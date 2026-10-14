/**
 * Sign in with ChatGPT and plan-billed requests against a local fake of the authorization server
 * (discovery, key set, token and revocation endpoints) and of the Responses API; the browser is a
 * fetch of the redirect URL.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dryMountProvider } from 'cortico/extensions/dry-mount.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { LLMProviderEntry, Logger } from 'cortico/core/types.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { functionCall, functionResult, message } from 'cortico/protocol/open-responses/context.ts';
import { CHATGPT_PROVIDER, SIGN_IN_PANEL, chatgptModule, usageLimited, USAGE_LIMIT } from '../src/index.ts';
import { CHATGPT_RESOURCE, CHATGPT_SCOPES, PLAN_SCOPE, accountAt, readStored, type ChatGPTService } from '../src/chatgpt/auth.ts';
import { TOOL_NAMESPACE } from '../src/chatgpt/client.ts';
import { connectChatGPT, type ConsoleCall } from '../src/connect.ts';
import { cooText } from '../src/strings.ts';

const CLIENT = 'oaiapp_test';
const KEY = generateKeyPairSync('rsa', { modulusLength: 2048 });
const OTHER_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 });

const servers: Server[] = [];
afterEach(() => { for (const s of servers.splice(0)) s.close(); });

async function listen(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void): Promise<string> {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    handler(req, res, body);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

const jwt = (claims: Record<string, unknown>, key: KeyObject = KEY.privateKey) => {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
};

/** The fake authorization server. `scope` is what it grants; `signWith` the key of its ID tokens. */
async function authServer(opts: { scope?: string; signWith?: KeyObject; refreshError?: string; onRefresh?: () => void } = {}) {
  const seen = { exchanges: [] as Array<Record<string, string>>, refreshes: [] as Array<Record<string, string>>, revoked: [] as string[] };
  let challenge = '';
  let nonce = '';
  let rotation = 1;
  const issuer = await listen((req, res, body) => {
    const json = (status: number, value: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    const path = (req.url ?? '').split('?')[0];
    if (path === '/.well-known/openid-configuration') return json(200, { issuer, jwks_uri: `${issuer}/jwks`, revocation_endpoint: `${issuer}/revoke` });
    if (path === '/jwks') return json(200, { keys: [{ ...KEY.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] });
    if (path === '/revoke') { seen.revoked.push(new URLSearchParams(body).get('token') ?? ''); return res.writeHead(200).end(); }
    if (path !== '/api/accounts/oauth/token') return json(404, {});
    const form = Object.fromEntries(new URLSearchParams(body));
    if (form.grant_type === 'authorization_code') {
      seen.exchanges.push(form);
      const pkce = createHash('sha256').update(form.code_verifier ?? '').digest('base64url') === challenge;
      if (!pkce || form.code !== 'code-1' || form.client_id !== CLIENT || form.resource !== CHATGPT_RESOURCE) return json(400, { error: 'invalid_grant' });
      return json(200, {
        access_token: 'at-1', refresh_token: 'rt-1', token_type: 'Bearer', expires_in: 3600, scope: opts.scope ?? CHATGPT_SCOPES,
        id_token: jwt({ iss: issuer, aud: CLIENT, sub: 'account-1', email: 'person@example.com', nonce, exp: Math.floor(Date.now() / 1000) + 3600 }, opts.signWith),
      });
    }
    seen.refreshes.push(form);
    opts.onRefresh?.();
    if (opts.refreshError) return json(400, { error: opts.refreshError });
    if (form.refresh_token !== `rt-${rotation}`) return json(400, { error: 'refresh_token_reused' });
    rotation += 1;
    return json(200, { access_token: `at-${rotation}`, refresh_token: `rt-${rotation}`, token_type: 'Bearer', expires_in: 3600 });
  });
  /** What the browser sends to the authorization URL is read off it: the challenge and nonce the token endpoint checks. */
  const authorized = (url: string) => {
    const q = new URL(url).searchParams;
    challenge = q.get('code_challenge') ?? '';
    nonce = q.get('nonce') ?? '';
    return q;
  };
  return { issuer, seen, authorized };
}

const entry = (baseUrl = 'http://127.0.0.1:9/v1'): LLMProviderEntry => ({
  kind: 'chatgpt', baseUrl, spec: { model: 'm', thinking: true, reasoningEffort: 'high' }, multimodal: true,
});

function recordingLog(): Logger & { warns: string[] } {
  const warns: string[] = [];
  return { ...nullLogger(), warns, warn: (msg: string) => { warns.push(msg); } } as Logger & { warns: string[] };
}

/** The fake services, with the Responses API at `api`. */
const svc = (issuer: string, api = 'http://127.0.0.1:9/v1'): ChatGPTService => ({ issuer, api, appName: 'Test App' });

/** The module as the app registers it, against `service`, with one endpoint `chatgpt` under a fresh directory. */
function setup(service: ChatGPTService, baseUrl?: string, log: Logger = nullLogger()) {
  const root = mkdtempSync(join(tmpdir(), 'chatgpt-'));
  const dir = join(root, 'chatgpt');
  mkdirSync(dir);
  const module = chatgptModule(service, () => root);
  const e = entry(baseUrl);
  const create = () => module.create('chatgpt', e, { stateDir: dir, secret: () => '', readBlob: () => null, keepThinking: () => true, log });
  const console = module.console!({ language: 'en', entries: () => [{ name: 'chatgpt', entry: e }], instance: create, save: () => {} });
  const invoke = <T>(method: string) => console.invoke!(SIGN_IN_PANEL, method, ['chatgpt']) as Promise<T>;
  return { root, dir, module, create, console, invoke, entry: e };
}

interface State { signedIn: boolean; email: string | null; phase: string; reason: string | null; models?: string[] }

async function settled(invoke: <T>(method: string) => Promise<T>): Promise<State> {
  for (;;) {
    const state = await invoke<State>('state');
    if (state.phase !== 'waiting') return state;
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** The browser coming back to the loopback callback. */
const callback = (url: string, params: Record<string, string>) => {
  const q = new URL(url).searchParams;
  return fetch(`${q.get('redirect_uri')}?${new URLSearchParams({ state: q.get('state')!, ...params })}`);
};

describe('Sign in with ChatGPT', () => {
  it('passes the provider dry mount', () => {
    expect(dryMountProvider(CHATGPT_PROVIDER, { scratchDir: mkdtempSync(join(tmpdir(), 'chatgpt-dry-')) }).failures).toEqual([]);
  });

  it('registers on the first sign-in, exchanges the code with its PKCE verifier, and signs in again under the issued client id', async () => {
    const auth = await authServer();
    const { dir, module, console, invoke } = setup(svc(auth.issuer));
    // the console server answers only methods of a declared panel
    expect(console.panels?.map((p) => p.id)).toContain(SIGN_IN_PANEL);
    writeFileSync(join(dir, '.env'), 'OTHER_KEY=kept\n');
    expect(module.availability!('chatgpt', entry(), 'en')).toEqual({ ready: false, reason: cooText('en').chatgpt.signedOut });
    expect(module.normalize!(entry('https://elsewhere.example/v1')).baseUrl).toBe('http://127.0.0.1:9/v1');

    const { url } = await invoke<{ url: string }>('signIn');
    expect(url.startsWith(`${auth.issuer}/api/accounts/authorize?`)).toBe(true);
    const q = auth.authorized(url);
    expect(Object.fromEntries(q)).toMatchObject({
      client_id: 'dynamic_agent_client', agent_name_hint: 'Test App', response_type: 'code', scope: CHATGPT_SCOPES,
      resource: CHATGPT_RESOURCE, code_challenge_method: 'S256',
    });
    expect(q.get('ext_agent_host_id')).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(q.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // a request without the sign-in's state leaves it waiting
    expect((await fetch(`${q.get('redirect_uri')}?state=forged&code=code-1`)).status).toBe(400);
    expect((await invoke<State>('state')).phase).toBe('waiting');

    // the callback page loaded twice redeems the code once
    const [page, again] = await Promise.all([1, 2].map(() => callback(url, { code: 'code-1', scope: CHATGPT_SCOPES, client_id: CLIENT })));
    expect([page!.status, again!.status].sort()).toEqual([200, 400]);
    const shown = page!.status === 200 ? page! : again!;
    expect(await shown.text()).toContain(cooText('en').chatgpt.returnToApp);
    expect(await settled(invoke)).toMatchObject({ phase: 'done', signedIn: true, email: 'person@example.com' });
    expect(auth.seen.exchanges).toHaveLength(1);
    expect(auth.seen.exchanges[0]).toMatchObject({ client_id: CLIENT, redirect_uri: q.get('redirect_uri') });
    expect(module.availability!('chatgpt', entry(), 'en')).toEqual({ ready: true });
    const env = readFileSync(join(dir, '.env'), 'utf8');
    expect(env).toContain('OTHER_KEY=kept');
    expect(readStored(dir)).toMatchObject({ clientId: CLIENT, refreshToken: 'rt-1', accessToken: 'at-1', subject: 'account-1', hostId: q.get('ext_agent_host_id') });

    const next = await invoke<{ url: string }>('signIn');
    const q2 = auth.authorized(next.url);
    expect(q2.get('client_id')).toBe(CLIENT);
    expect(q2.has('agent_name_hint')).toBe(false);
    expect(q2.get('ext_agent_host_id')).toBe(q.get('ext_agent_host_id'));
    expect(q2.get('login_hint')).toBe('person@example.com');
    // a returning sign-in's callback may leave the client id out
    await callback(next.url, { code: 'code-1', scope: CHATGPT_SCOPES });
    expect(await settled(invoke)).toMatchObject({ phase: 'done', signedIn: true });
  });

  it('fails a sign-in that is refused, lacks the plan scope or carries an ID token of another key, and stays signed out', async () => {
    for (const [opts, params, reason] of [
      [{}, { error: 'access_denied' }, 'access_denied'],
      [{ scope: CHATGPT_SCOPES.replace(` ${PLAN_SCOPE}`, '') }, { code: 'code-1', client_id: CLIENT }, 'plan_not_granted'],
      [{ signWith: OTHER_KEY.privateKey }, { code: 'code-1', client_id: CLIENT }, 'invalid_id_token'],
    ] as const) {
      const auth = await authServer(opts);
      const { dir, invoke } = setup(svc(auth.issuer));
      const { url } = await invoke<{ url: string }>('signIn');
      auth.authorized(url);
      await callback(url, params);
      expect(await settled(invoke), reason).toMatchObject({ phase: 'failed', signedIn: false, reason });
      expect(readStored(dir).refreshToken).toBeUndefined();
    }
  });

  it('answers a malformed request or a state of other characters with a 400 and keeps waiting', async () => {
    const auth = await authServer();
    const { invoke } = setup(svc(auth.issuer));
    const { url } = await invoke<{ url: string }>('signIn');
    const redirect = new URL(new URL(url).searchParams.get('redirect_uri')!);
    const raw = await new Promise<string>((done) => {
      const socket = connect(Number(redirect.port), '127.0.0.1', () => socket.end(`GET //[ HTTP/1.1\r\nHost: ${redirect.host}\r\n\r\n`));
      let reply = '';
      socket.on('data', (chunk) => { reply += chunk; }).on('close', () => done(reply));
    });
    expect(raw).toMatch(/^HTTP\/1\.1 400/);
    expect((await fetch(`${redirect}?state=${'%C3%A9'.repeat(43)}&code=code-1`)).status).toBe(400);
    expect((await invoke<State>('state')).phase).toBe('waiting');
  });

  it('refreshes an expiring access token once for requests waiting together and stores the rotated refresh token', async () => {
    const auth = await authServer();
    const dir = mkdtempSync(join(tmpdir(), 'chatgpt-'));
    writeFileSync(join(dir, '.env'), `CHATGPT_CLIENT_ID=${CLIENT}\nCHATGPT_ACCESS_TOKEN=at-1\nCHATGPT_EXPIRES_AT=${Date.now() + 1000}\nCHATGPT_REFRESH_TOKEN=rt-1\nCHATGPT_SCOPE=${PLAN_SCOPE}\n`);
    const account = accountAt(dir, svc(auth.issuer));
    expect(await Promise.all([account.accessToken(), account.accessToken(), account.accessToken()])).toEqual(['at-2', 'at-2', 'at-2']);
    expect(auth.seen.refreshes).toHaveLength(1);
    expect(auth.seen.refreshes[0]).toMatchObject({ grant_type: 'refresh_token', client_id: CLIENT, refresh_token: 'rt-1', resource: CHATGPT_RESOURCE });
    expect(readStored(dir)).toMatchObject({ refreshToken: 'rt-2', accessToken: 'at-2', scope: PLAN_SCOPE });
    // the token the API refused is refreshed even before it expires
    expect(await account.accessToken('at-2')).toBe('at-3');
    expect(readStored(dir).refreshToken).toBe('rt-3');
  });

  it('a sign-in that lands while a refresh is under way keeps its tokens, and the refresh hands them out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chatgpt-'));
    const signedInAgain = `CHATGPT_CLIENT_ID=${CLIENT}
CHATGPT_ACCESS_TOKEN=at-new
CHATGPT_EXPIRES_AT=${Date.now() + 3_600_000}
CHATGPT_REFRESH_TOKEN=rt-new
CHATGPT_SCOPE=${PLAN_SCOPE}
`;
    const auth = await authServer({ onRefresh: () => writeFileSync(join(dir, '.env'), signedInAgain) });
    writeFileSync(join(dir, '.env'), `CHATGPT_CLIENT_ID=${CLIENT}
CHATGPT_ACCESS_TOKEN=at-1
CHATGPT_EXPIRES_AT=0
CHATGPT_REFRESH_TOKEN=rt-1
CHATGPT_SCOPE=${PLAN_SCOPE}
`);
    expect(await accountAt(dir, svc(auth.issuer)).accessToken()).toBe('at-new');
    expect(readStored(dir)).toMatchObject({ accessToken: 'at-new', refreshToken: 'rt-new' });
  });

  it('signs out when the refresh token is refused, keeping the registration; signing out revokes the refresh token', async () => {
    const refused = await authServer({ refreshError: 'invalid_grant' });
    const dir = mkdtempSync(join(tmpdir(), 'chatgpt-'));
    const env = `CHATGPT_HOST_ID=urn:uuid:x\nCHATGPT_CLIENT_ID=${CLIENT}\nCHATGPT_ACCESS_TOKEN=at-1\nCHATGPT_EXPIRES_AT=0\nCHATGPT_REFRESH_TOKEN=rt-1\nCHATGPT_SCOPE=${PLAN_SCOPE}\n`;
    writeFileSync(join(dir, '.env'), env);
    await expect(accountAt(dir, svc(refused.issuer)).accessToken()).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(readStored(dir)).toEqual({ hostId: 'urn:uuid:x', clientId: CLIENT });

    const auth = await authServer();
    writeFileSync(join(dir, '.env'), env);
    const account = accountAt(dir, svc(auth.issuer));
    await account.signOut();
    expect(auth.seen.revoked).toEqual(['rt-1']);
    expect(readStored(dir)).toEqual({ hostId: 'urn:uuid:x', clientId: CLIENT });
  });
});

/** SSE frames of a Responses stream. */
const sse = (events: Array<Record<string, unknown>>) => events.map((e, i) => `data: ${JSON.stringify({ ...e, sequence_number: i })}\n\n`).join('');
const RESPONSE = { id: 'resp_1', object: 'response', model: 'm', created_at: 1, output: [] };
const REPLY = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] };
const COMPLETED = sse([
  { type: 'response.created', response: { ...RESPONSE, status: 'in_progress' } },
  { type: 'response.output_item.added', output_index: 0, item: { ...REPLY, status: 'in_progress', content: [] } },
  { type: 'response.content_part.added', output_index: 0, item_id: 'msg_1', content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
  { type: 'response.output_text.delta', output_index: 0, item_id: 'msg_1', content_index: 0, delta: 'ok' },
  { type: 'response.output_text.done', output_index: 0, item_id: 'msg_1', content_index: 0, text: 'ok' },
  { type: 'response.content_part.done', output_index: 0, item_id: 'msg_1', content_index: 0, part: REPLY.content[0] },
  { type: 'response.output_item.done', output_index: 0, item: REPLY },
  { type: 'response.completed', response: { ...RESPONSE, status: 'completed', output: [REPLY], usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 } } },
]);
const LIMITED = sse([
  { type: 'response.created', response: { ...RESPONSE, status: 'in_progress' } },
  { type: 'response.failed', response: { ...RESPONSE, status: 'failed', error: { code: USAGE_LIMIT, message: 'Usage limit reached' } } },
]);

/** A signed-in endpoint whose API is `api`; tokens expire in an hour. */
async function signedInEndpoint(api: (req: IncomingMessage, res: ServerResponse, body: Record<string, unknown> | null) => void, log: Logger = nullLogger()) {
  const auth = await authServer();
  const baseUrl = await listen((req, res, raw) => api(req, res, raw ? JSON.parse(raw) as Record<string, unknown> : null));
  // the endpoint's own base URL points elsewhere: requests go to the service's API all the same
  const s = setup(svc(auth.issuer, `${baseUrl}/v1`), 'http://127.0.0.1:9/v1', log);
  writeFileSync(join(s.dir, '.env'), `CHATGPT_CLIENT_ID=${CLIENT}\nCHATGPT_ACCESS_TOKEN=at-1\nCHATGPT_EXPIRES_AT=${Date.now() + 3_600_000}\nCHATGPT_REFRESH_TOKEN=rt-1\nCHATGPT_SCOPE=${PLAN_SCOPE}\n`);
  return { ...s, auth };
}

const stream = (res: ServerResponse, body: string) => res.writeHead(200, { 'content-type': 'text/event-stream' }).end(body);

describe('requests billed to a ChatGPT plan', () => {
  it('streams with store off, instructions for system text, no sampling or output caps, tools and past calls in one namespace', async () => {
    const seen: Array<{ auth?: string; body: Record<string, unknown> }> = [];
    const { create } = await signedInEndpoint((req, res, body) => {
      seen.push({ auth: req.headers.authorization, body: body! });
      // the first token is refused once: the client refreshes and sends again
      if (req.headers.authorization === 'Bearer at-1') return res.writeHead(401, { 'content-type': 'application/json' }).end('{"detail":"expired"}');
      stream(res, COMPLETED);
    });
    const tool = { type: 'function', name: 'say', description: 'Says a line', parameters: { type: 'object', properties: {} }, strict: false };
    const request = { model: 'm', tools: [tool], max_output_tokens: 100, temperature: 0.5, top_p: 0.9, service_tier: 'priority' } as unknown as Request;
    const out = await create().client.respond(request, {
      context: [message('system', 'be brief'), message('user', 'hi'), functionCall('call_1', 'say', '{}'), functionResult('call_1', 'said')],
    });
    expect(out.response.output[0]).toMatchObject({ type: 'message', content: [{ text: 'ok' }] });
    expect(seen.map((s) => s.auth)).toEqual(['Bearer at-1', 'Bearer at-2']);
    const body = seen[1]!.body;
    expect(body).toMatchObject({ model: 'm', store: false, stream: true, instructions: 'be brief' });
    for (const key of ['max_output_tokens', 'temperature', 'top_p', 'service_tier', 'previous_response_id']) expect(body, key).not.toHaveProperty(key);
    expect(body.tools).toEqual([{ type: 'namespace', ...TOOL_NAMESPACE, tools: [tool] }]);
    const input = body.input as Array<Record<string, unknown>>;
    expect(input.some((item) => item.role === 'system' || item.role === 'developer')).toBe(false);
    expect(input.find((item) => item.type === 'function_call')).toMatchObject({ name: 'say', namespace: TOOL_NAMESPACE.name });
  });

  it('streams a request whose caller asked for no events: the route answers streams only', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { create } = await signedInEndpoint((_req, res, body) => { seen.push(body!); stream(res, COMPLETED); });
    await create().client.respond({ model: 'm' } as unknown as Request, { context: [message('user', 'hi')] });
    expect(seen[0]).toMatchObject({ stream: true });
  });

  it('a terminal response with an empty output takes the done items, in the result and in the forwarded event', async () => {
    const { create } = await signedInEndpoint((_req, res) => stream(res, sse([
      { type: 'response.created', response: { ...RESPONSE, status: 'in_progress' } },
      { type: 'response.output_item.added', output_index: 0, item: { ...REPLY, status: 'in_progress', content: [] } },
      { type: 'response.output_item.done', output_index: 0, item: REPLY },
      { type: 'response.completed', response: { ...RESPONSE, status: 'completed', output: [] } },
    ])));
    const events: Array<{ type: string; response?: { output: unknown[] } }> = [];
    const out = await create().client.respond({ model: 'm' } as unknown as Request, { context: [message('user', 'hi')], onEvent: (e) => events.push(e) });
    expect(out.response.output).toEqual([REPLY]);
    expect(events.at(-1)).toMatchObject({ type: 'response.completed', response: { output: [REPLY] } });
  });

  it('a usage limit inside the stream is logged and waited out inside the client: no request goes out until the pause ends, then it is sent again', async () => {
    let requests = 0;
    let limited = true;
    const log = recordingLog();
    const { create, dir, auth } = await signedInEndpoint((_req, res) => { requests += 1; stream(res, limited ? LIMITED : COMPLETED); }, log);
    const pending = create().client.respond({ model: 'm' } as unknown as Request, { context: [message('user', 'hi')] });
    await new Promise((r) => setTimeout(r, 1500));
    expect(requests).toBe(1);
    expect(log.warns.filter((w) => w.includes(USAGE_LIMIT))).toHaveLength(1);
    // a new event preempting the request ends the wait
    const stop = new AbortController();
    const preempted = create().client.respond({ model: 'm' } as unknown as Request, { context: [message('user', 'again')], signal: stop.signal }).catch((e: unknown) => e);
    stop.abort();
    expect(await preempted).toBeInstanceOf(Error);
    expect(requests).toBe(1);
    // the pause ends: the request goes out again and is answered
    limited = false;
    accountAt(dir, svc(auth.issuer)).pausedUntil = 0;
    expect((await pending).response.output[0]).toMatchObject({ type: 'message', content: [{ text: 'ok' }] });
    expect(requests).toBe(2);
  });

  it('a usage limit answered with HTTP 429 fails the console connection test with the 429', async () => {
    const { create } = await signedInEndpoint((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: USAGE_LIMIT, message: 'Usage limit reached' } }));
    });
    const err = await create().client.respond({ model: 'm' } as unknown as Request, { context: [message('user', 'hi')], diagnostic: true }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429 });
    expect(usageLimited(err)).toBe(true);
  });

  it('lists the models the plan lists, in its order', async () => {
    const { create } = await signedInEndpoint((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ models: [
        { slug: 'b', display_name: 'B', visibility: 'list' }, { slug: 'hidden', display_name: 'H', visibility: 'hide' }, { slug: 'a', display_name: 'A', visibility: 'list' },
      ] }));
      expect(req.url).toBe('/v1/models');
    });
    expect(await create().listModels!()).toEqual([{ id: 'b', displayName: 'B' }, { id: 'a', displayName: 'A' }]);
  });
});

describe('connecting a ChatGPT plan through the console routes', () => {
  /** A console with no endpoints whose sign-in is done after `waiting` looks, with the plan listing `models`. */
  function fakeConsole(final: { phase: 'done' | 'failed'; reason?: string }, models: string[], waiting = 2) {
    const calls: Array<[string, unknown]> = [];
    const call = (async (path: string, body?: unknown) => {
      calls.push([path, body]);
      if (path === '/api/providers' && body === undefined) return { providers: [] };
      if (path.endsWith('/signIn')) return { url: 'https://auth.example/authorize?x=1' };
      if (path.endsWith('/state')) return waiting-- > 0 ? { phase: 'waiting', signedIn: false } : { ...final, signedIn: final.phase === 'done', models };
      if (path.endsWith('/test')) return { ok: true, elapsedMs: 7 };
      if (body === undefined) return { name: 'chatgpt', entry: { kind: 'chatgpt', spec: { model: 'old-model' } }, revision: 'r1' };
      return {};
    }) as ConsoleCall;
    return { call, calls };
  }

  it('creates the endpoint, opens the authorization URL, waits for the sign-in, takes a listed model, tests, activates and resumes', async () => {
    const { call, calls } = fakeConsole({ phase: 'done' }, ['plan-model']);
    const opened: string[] = [];
    const r = await connectChatGPT(call, (url) => opened.push(url), { pollMs: 1 });
    expect(r).toMatchObject({ ok: true, ms: 7 });
    expect(opened).toEqual(['https://auth.example/authorize?x=1']);
    const route = `/api/console/providers/${encodeURIComponent('llm:chatgpt')}/panels/chatgpt`;
    expect(calls.map(([path]) => path)).toEqual([
      '/api/providers', '/api/providers', `${route}/signIn`, `${route}/state`, `${route}/state`, `${route}/state`,
      '/api/providers/chatgpt', '/api/providers/chatgpt/save', '/api/providers/chatgpt/test', '/api/providers/chatgpt/activate', '/api/run/resume',
    ]);
    expect(calls[1]![1]).toMatchObject({ name: 'chatgpt', entry: { kind: 'chatgpt' } });
    expect(calls[1]![1]).not.toHaveProperty('secretValue');
    expect(calls[2]![1]).toEqual({ args: ['chatgpt'] });
    expect(calls[7]![1]).toMatchObject({ entry: { spec: { model: 'plan-model' } }, expectedRevision: 'r1' });
  });

  it('stops at a failed sign-in with its reason and leaves the active endpoint alone', async () => {
    const { call, calls } = fakeConsole({ phase: 'failed', reason: 'access_denied' }, [], 0);
    expect(await connectChatGPT(call, () => {}, { pollMs: 1 })).toEqual({ ok: false, ms: null, why: 'access_denied' });
    expect(calls.some(([path]) => path.endsWith('/activate'))).toBe(false);
  });
});
