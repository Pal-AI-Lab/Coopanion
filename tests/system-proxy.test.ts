import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SystemProxy, type ProxyAnswer } from '../core/system-proxy.ts';
const require = createRequire(import.meta.url);

describe('system proxy answers', () => {
  it('asks once per origin while an answer is fresh, again once it is old, and logs only changes', async () => {
    let now = 0;
    const asked: string[] = [];
    const lines: string[] = [];
    let answer: ProxyAnswer = { proxy: 'http://127.0.0.1:7897', rule: 'PROXY 127.0.0.1:7897' };
    const system = new SystemProxy(async (url) => { asked.push(url); return answer; }, (l) => lines.push(l), 1000, () => now);
    const origin = 'https://api.test';
    expect(await Promise.all([system.lookup(origin), system.lookup(origin)])).toEqual(['http://127.0.0.1:7897', 'http://127.0.0.1:7897']);
    now = 999;
    expect(await system.lookup(origin)).toBe('http://127.0.0.1:7897');
    expect(asked).toEqual([origin]);
    answer = { proxy: null, rule: 'DIRECT' };
    now = 1000;
    expect(await system.lookup(origin)).toBeNull();
    now = 2000;
    await system.lookup(origin);
    expect(asked).toEqual([origin, origin, origin]);
    expect(lines).toEqual([`proxy: ${origin} PROXY 127.0.0.1:7897`, `proxy: ${origin} DIRECT`]);
  });

  it('goes direct for loopback without asking, and for an answer that fails', async () => {
    const asked: string[] = [];
    const system = new SystemProxy(async (url) => { asked.push(url); throw new Error('channel closed'); }, () => {});
    expect(await system.lookup('http://127.0.0.1:17790')).toBeNull();
    expect(await system.lookup('http://localhost:8080')).toBeNull();
    expect(await system.lookup('https://api.test')).toBeNull();
    expect(asked).toEqual(['https://api.test']);
  });
});

describe('system proxy in the Core runtime', () => {
  const closing: Array<() => void> = [];
  afterEach(() => { for (const close of closing.splice(0)) close(); });

  /** A CONNECT and plain-HTTP proxy like a proxy app's mixed port; `stop` ends it and every tunnel, as quitting the app does. */
  async function proxyApp(target: number) {
    const hits: string[] = [];
    const sockets = new Set<Socket>();
    const server: Server = createServer((req, res) => { hits.push(req.url ?? ''); res.end('via-proxy'); });
    server.on('connection', (s) => sockets.add(s));
    server.on('connect', (req, socket, head) => {
      hits.push(req.url ?? '');
      sockets.add(socket as Socket);
      const upstream = connect(target, '127.0.0.1', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(socket); socket.pipe(upstream);
      });
      sockets.add(upstream);
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const stop = () => { server.close(); for (const s of sockets) s.destroy(); };
    closing.push(stop);
    return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, hits, stop };
  }

  it('follows a proxy app that quits while the Core runs: fetch, node:http and child processes go direct again without a restart', async () => {
    const target = createServer((req, res) => res.end(`direct:${req.url}`));
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
    closing.push(() => { target.closeAllConnections(); target.close(); });
    const targetPort = (target.address() as { port: number }).port;
    const app = await proxyApp(targetPort);
    // the Core reaches the target by a name that is not loopback, as it does a model service
    const dir = mkdtempSync(join(tmpdir(), 'system-proxy-'));
    closing.push(() => rmSync(dir, { recursive: true, force: true }));
    const script = join(dir, 'core.mjs');
    writeFileSync(script, `
      const { SystemProxy, askAppProcess, installSystemProxy } = await import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'core', 'system-proxy.ts')).href)});
      await installSystemProxy(new SystemProxy(askAppProcess(), () => {}, 200), 200);
      const http = await import('node:http');
      const viaFetch = async () => { try { return await (await fetch('http://model.test:${targetPort}/model')).text(); } catch (e) { return 'failed ' + (e.cause?.code ?? e.message); } };
      const viaHttp = () => new Promise((ok) => http.get('http://download.test:${targetPort}/archive', (r) => { let s = ''; r.on('data', (d) => s += d); r.on('end', () => ok(s)); }).on('error', (e) => ok('failed ' + e.code)));
      process.on('message', async (m) => {
        if (m?.type !== 'probe') return;
        process.send({ type: 'result', fetch: await viaFetch(), http: await viaHttp(), env: process.env.HTTPS_PROXY ?? null });
      });
      process.send({ type: 'up' });
    `);
    let answer: ProxyAnswer = { proxy: app.url, rule: `PROXY ${app.url.slice(7)}` };
    const child = fork(script, [], {
      execPath: require('electron'), execArgv: ['--use-env-proxy', '--import', 'tsx'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_USE_ENV_PROXY: '1', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    closing.push(() => child.kill());
    const messages: Array<Record<string, unknown>> = [];
    child.on('message', (m: { type?: string; id?: number; url?: string }) => {
      // the app process: model.test and download.test resolve only through the proxy app, which forwards them to the target
      if (m?.type === 'companion:proxy') child.send({ type: 'companion:proxy', id: m.id, ...answer });
      else messages.push(m as Record<string, unknown>);
    });
    const next = async (type: string) => { await expect.poll(() => messages.some((m) => m.type === type)).toBe(true); return messages.splice(messages.findIndex((m) => m.type === type), 1)[0]!; };
    await next('up');
    child.send({ type: 'probe' });
    expect(await next('result')).toEqual({ type: 'result', fetch: 'direct:/model', http: 'via-proxy', env: app.url });
    expect(app.hits).toEqual([`model.test:${targetPort}`, `http://download.test:${targetPort}/archive`]);

    app.stop();
    answer = { proxy: null, rule: 'DIRECT' };
    await new Promise((r) => setTimeout(r, 400));
    child.send({ type: 'probe' });
    const after = await next('result');
    // direct now: the names do not resolve here, so the requests fail on DNS, not on the quit proxy's port
    expect(after.fetch).toMatch(/failed (ENOTFOUND|EAI_AGAIN)/);
    expect(after.http).toMatch(/failed (ENOTFOUND|EAI_AGAIN)/);
    expect(after.env).toBeNull();
  });
});
