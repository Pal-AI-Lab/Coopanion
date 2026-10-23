/**
 * The system proxy for the Core's requests, asked of the app process per host as they go out
 * (`companion:proxy`, answered from the default session's `resolveProxy` in app/core-host.cjs), so
 * a proxy app turned on or off reaches a running Core, and a PAC script's answer for one host is not
 * used for another. Installed by boot.ts when the app sets `COOPANION_SYSTEM_PROXY` (no proxy
 * variables of the person's own).
 *
 * fetch goes through a global dispatcher that looks the request's origin up, each answer kept for
 * PROXY_TTL_MS. node:http and node:https global agents, and the proxy variables a child process
 * inherits (pnpm installing an extension), cannot wait for a lookup: they follow the answer for the
 * npm registry, looked up again every PROXY_TTL_MS. A lookup that fails or goes unanswered goes direct.
 */
import http from 'node:http';
import https from 'node:https';
import { Agent, Dispatcher, ProxyAgent, setGlobalDispatcher } from 'undici';

/** How long an answer for an origin is used before it is asked again. */
export const PROXY_TTL_MS = 10_000;
/** An answer the app process has not given after this long counts as direct. */
export const ASK_MS = 6_000;
/** The origin whose answer node:http, node:https and child processes follow. */
const SHARED_ORIGIN = 'https://registry.npmjs.org';
const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'] as const;
const LOOPBACK = /^(localhost|127(\.\d+){3}|\[?::1\]?)$/i;

/** The app process's answer: a proxy URL Node can use, or null for direct, and the rule it came from. */
export interface ProxyAnswer { proxy: string | null; rule: string }
export type AskProxy = (url: string) => Promise<ProxyAnswer>;

/** Answers per origin, asked again once PROXY_TTL_MS old; one question per origin at a time. Never rejects. */
export class SystemProxy {
  private readonly answers = new Map<string, { proxy: string | null; rule: string; at: number }>();
  private readonly asking = new Map<string, Promise<string | null>>();

  constructor(
    private readonly ask: AskProxy,
    private readonly log: (line: string) => void = (line) => console.log(line),
    private readonly ttlMs = PROXY_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** The proxy URL for `origin`, or null to go direct. */
  lookup(origin: string): Promise<string | null> {
    let host: string;
    try { host = new URL(origin).hostname; } catch { return Promise.resolve(null); }
    if (LOOPBACK.test(host)) return Promise.resolve(null);
    const known = this.answers.get(origin);
    if (known && this.now() - known.at < this.ttlMs) return Promise.resolve(known.proxy);
    const pending = this.asking.get(origin);
    if (pending) return pending;
    const asked = this.ask(origin)
      .catch((e: unknown): ProxyAnswer => ({ proxy: null, rule: `DIRECT (no answer: ${e instanceof Error ? e.message : e})` }))
      .then(({ proxy, rule }) => {
        // a line per change, so core.log shows when a proxy came and went
        if (!known || known.rule !== rule) this.log(`proxy: ${origin} ${rule}`);
        this.answers.set(origin, { proxy, rule, at: this.now() });
        this.asking.delete(origin);
        return proxy;
      });
    this.asking.set(origin, asked);
    return asked;
  }
}

type Handler = Dispatcher.DispatchHandler & { onError?: (err: Error) => void };

/** fetch's dispatcher: each request goes direct or through the proxy its origin has now. */
export class SystemProxyDispatcher extends Dispatcher {
  private readonly direct = new Agent();
  private readonly proxies = new Map<string, ProxyAgent>();

  constructor(private readonly system: SystemProxy) { super(); }

  override dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    void this.system.lookup(String(opts.origin)).then((proxy) => {
      try {
        this.route(proxy).dispatch(opts, handler);
      } catch (err) {
        (handler as Handler).onError?.(err as Error);
      }
    });
    return true;
  }

  private route(proxy: string | null): Dispatcher {
    if (!proxy) return this.direct;
    let agent = this.proxies.get(proxy);
    if (!agent) this.proxies.set(proxy, agent = new ProxyAgent(proxy));
    return agent;
  }

  override close(callback: () => void): void;
  override close(): Promise<void>;
  override close(callback?: () => void): Promise<void> | void {
    const done = Promise.all([this.direct, ...this.proxies.values()].map((d) => d.close())).then(() => {});
    if (!callback) return done;
    void done.then(callback);
  }

  override destroy(err: Error | null, callback: () => void): void;
  override destroy(callback: () => void): void;
  override destroy(err: Error | null): Promise<void>;
  override destroy(): Promise<void>;
  override destroy(a?: Error | null | (() => void), b?: () => void): Promise<void> | void {
    const err = typeof a === 'function' ? null : a ?? null;
    const callback = typeof a === 'function' ? a : b;
    const done = Promise.all([this.direct, ...this.proxies.values()].map((d) => d.destroy(err))).then(() => {});
    if (!callback) return done;
    void done.then(callback);
  }
}

/** Points node:http, node:https and the proxy variables of child processes at `proxy`, or direct for null. */
function shareProxy(proxy: string | null): void {
  for (const key of PROXY_VARS) {
    if (proxy) process.env[key] = proxy;
    else delete process.env[key];
  }
  // Node reads proxyEnv when an agent is made, so a change takes new agents (NODE_USE_ENV_PROXY is read once, at start)
  const proxyEnv = proxy ? { HTTP_PROXY: proxy, HTTPS_PROXY: proxy, NO_PROXY: process.env.NO_PROXY ?? '' } : {};
  http.globalAgent = new http.Agent({ keepAlive: true, proxyEnv } as http.AgentOptions);
  https.globalAgent = new https.Agent({ keepAlive: true, proxyEnv } as https.AgentOptions);
}

/** Asks the app process over the IPC channel; an answer that does not come within ASK_MS counts as direct. */
export function askAppProcess(): AskProxy {
  let seq = 0;
  const waiting = new Map<number, (answer: ProxyAnswer) => void>();
  process.on('message', (msg: { type?: string; id?: number; proxy?: unknown; rule?: unknown }) => {
    if (msg?.type !== 'companion:proxy' || typeof msg.id !== 'number') return;
    waiting.get(msg.id)?.({ proxy: typeof msg.proxy === 'string' ? msg.proxy : null, rule: typeof msg.rule === 'string' ? msg.rule : 'DIRECT' });
    waiting.delete(msg.id);
  });
  return (url) => new Promise<ProxyAnswer>((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); resolve({ proxy: null, rule: `DIRECT (no answer in ${ASK_MS} ms)` }); }, ASK_MS);
    timer.unref();
    waiting.set(id, (answer) => { clearTimeout(timer); resolve(answer); });
    if (!process.send?.({ type: 'companion:proxy', id, url })) { clearTimeout(timer); waiting.delete(id); resolve({ proxy: null, rule: 'DIRECT (no app process)' }); }
  });
}

/**
 * Routes fetch per origin through `system` and keeps node:http, node:https and child processes on the
 * shared answer, refreshed every `ttlMs`. Resolves once the first shared answer is in.
 */
export async function installSystemProxy(system: SystemProxy, ttlMs = PROXY_TTL_MS): Promise<void> {
  setGlobalDispatcher(new SystemProxyDispatcher(system));
  let shared: string | null | undefined;
  const refresh = async () => {
    const proxy = await system.lookup(SHARED_ORIGIN);
    if (proxy !== shared) shareProxy(shared = proxy);
  };
  await refresh();
  setInterval(() => void refresh(), ttlMs).unref();
}
