/**
 * Sign in with ChatGPT for an open-source app (developers.openai.com/siwc/token-sharing-open-source):
 * the account of one endpoint and its tokens.
 *
 * Signing in is OAuth's authorization code flow with PKCE (S256) through the system browser and a
 * loopback callback on `127.0.0.1` at a port the system picks. The first sign-in registers the app
 * with `client_id=dynamic_agent_client`, `agent_name_hint` and the endpoint's `ext_agent_host_id`; the
 * callback returns the client id issued to it, which every later sign-in and refresh uses. There is no
 * client secret. The ID token is checked against the issuer's published keys, and the plan is usable
 * only when the granted scope includes `chatgpt.tokens.use.direct`.
 *
 * Everything is stored in the endpoint directory's `.env`, where the other services keep their API
 * keys, one `CHATGPT_*` line each, written whole to a temporary file that replaces the old one. The
 * access token lasts an hour and is refreshed when less than `REFRESH_MARGIN_MS` of it is left, or
 * once after the API refuses it; each refresh rotates the refresh token, and the new one is written
 * before the access token is handed out. Refreshes of one directory run one at a time (`accountAt`
 * hands every instance of an endpoint the same object). A refresh token the service no longer takes
 * signs the endpoint out; the registration and the host id stay for the next sign-in.
 */
import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify, type JsonWebKey } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { readTextFile } from 'cortico/core/util.ts';

export interface ChatGPTService {
  /** The authorization server; its `/.well-known/openid-configuration` names the signing keys and the revocation endpoint. */
  issuer: string;
  /** The Responses API the tokens are sent to, whatever base URL the endpoint's config holds. */
  api: string;
  /** `agent_name_hint` of the first sign-in: the app's name, the same on every installation. */
  appName: string;
}

/** The API the tokens are issued for (`resource`). */
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1';
export const CHATGPT_SERVICE: ChatGPTService = { issuer: 'https://auth.openai.com', api: CHATGPT_RESOURCE, appName: 'Coopanion' };
export const CHATGPT_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
/** The scope that lets the tokens bill the ChatGPT plan. */
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const DYNAMIC_CLIENT = 'dynamic_agent_client';
const CALLBACK_PATH = '/auth/callback';
/** An access token with less than this left is refreshed before a request. */
const REFRESH_MARGIN_MS = 5 * 60_000;
/** A sign-in the browser has not come back from in this long is given up. */
const SIGN_IN_MS = 10 * 60_000;
/** Refresh errors after which the refresh token is no longer taken and the account has to sign in again. */
const SIGNED_OUT_CODES = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);

/** `code` is the OAuth or API error code where the service gave one; `status` the HTTP status, 0 when nothing came back. */
export class ChatGPTAuthError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0) {
    super(message);
    this.name = 'ChatGPTAuthError';
  }
}

/** The `.env` lines, by field. */
const KEYS = {
  hostId: 'CHATGPT_HOST_ID',
  clientId: 'CHATGPT_CLIENT_ID',
  subject: 'CHATGPT_SUBJECT',
  email: 'CHATGPT_EMAIL',
  accessToken: 'CHATGPT_ACCESS_TOKEN',
  /** Epoch milliseconds. */
  expiresAt: 'CHATGPT_EXPIRES_AT',
  refreshToken: 'CHATGPT_REFRESH_TOKEN',
  /** The granted scopes, comma-separated. */
  scope: 'CHATGPT_SCOPE',
} as const;
type Field = keyof typeof KEYS;
export type Stored = Partial<Record<Field, string>>;
/** What a sign-out and a refused refresh token remove. */
const TOKENS: readonly Field[] = ['accessToken', 'expiresAt', 'refreshToken', 'scope'];

export function readStored(dir: string): Stored {
  const file = join(dir, '.env');
  const text = existsSync(file) ? readTextFile(file) : '';
  const out: Stored = {};
  for (const [field, key] of Object.entries(KEYS) as Array<[Field, string]>) {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, 'm').exec(text);
    if (m) out[field] = m[1];
  }
  return out;
}

/** Sets the fields in `patch` (undefined removes one) and keeps every other line of the file. */
function writeStored(dir: string, patch: Partial<Record<Field, string | undefined>>): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, '.env');
  const lines = (existsSync(file) ? readTextFile(file) : '').split(/\r?\n/).filter(Boolean);
  const touched = new Set<string>(Object.keys(patch).map((field) => KEYS[field as Field]));
  const kept = lines.filter((line) => !touched.has(line.split('=')[0]!.trim()));
  for (const [field, value] of Object.entries(patch)) if (value) kept.push(`${KEYS[field as Field]}=${value}`);
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temp, kept.join('\n') + '\n', { mode: 0o600 });
  renameSync(temp, file);
}

/** A refresh token is stored and its grant includes the plan. */
export function signedIn(dir: string): boolean {
  const stored = readStored(dir);
  return !!stored.refreshToken && (stored.scope ?? '').split(',').includes(PLAN_SCOPE);
}

const random = () => randomBytes(32).toString('base64url');
/** Constant-time comparison of any two strings: their digests are always the same length. */
const sameText = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The error code of an OAuth reply (`error`) or an API reply (`error.code`). */
function errorCode(body: unknown): { code: string | null; message: string | null } {
  const b = body as { error?: unknown; error_description?: unknown } | null;
  if (typeof b?.error === 'string') return { code: b.error, message: typeof b.error_description === 'string' ? b.error_description : null };
  const e = b?.error as { code?: unknown; message?: unknown } | undefined;
  return { code: typeof e?.code === 'string' ? e.code : null, message: typeof e?.message === 'string' ? e.message : null };
}

interface Discovery { issuer: string; jwks_uri: string; revocation_endpoint?: string }

/** The issuer's configuration; its key set and revocation endpoint must be on the issuer's own origin. */
async function discover(service: ChatGPTService, fetchImpl: typeof fetch): Promise<Discovery> {
  const res = await fetchImpl(`${service.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => null) as Partial<Discovery> | null;
  const origin = new URL(service.issuer).origin;
  const ours = (url: unknown) => typeof url === 'string' && new URL(url).origin === origin;
  if (!res.ok || body?.issuer !== service.issuer || !ours(body.jwks_uri) || (body.revocation_endpoint !== undefined && !ours(body.revocation_endpoint)))
    throw new ChatGPTAuthError('discovery_failed', 'The ChatGPT sign-in configuration could not be read', res.status);
  return body as Discovery;
}

const decode = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

/**
 * The account an ID token names, after its RS256 signature is checked against the issuer's key set
 * and its issuer, audience (the issued client id), expiry and nonce against what was sent.
 */
async function verifyIdToken(token: string, opts: { service: ChatGPTService; clientId: string; nonce: string; fetchImpl: typeof fetch }): Promise<{ subject: string; email: string | null }> {
  const bad = (why: string) => new ChatGPTAuthError('invalid_id_token', `The ChatGPT identity could not be verified: ${why}`);
  const parts = token.split('.');
  if (parts.length !== 3) throw bad('not a JWT');
  const [head, payload, signature] = parts as [string, string, string];
  const header = decode(head);
  if (header.alg !== 'RS256') throw bad(`algorithm ${String(header.alg)}`);
  const config = await discover(opts.service, opts.fetchImpl);
  const res = await opts.fetchImpl(config.jwks_uri, { signal: AbortSignal.timeout(15_000) });
  const keys = ((await res.json().catch(() => null)) as { keys?: Array<JsonWebKey & { kid?: string }> } | null)?.keys ?? [];
  const jwk = keys.find((k) => k.kid === header.kid) ?? (header.kid === undefined && keys.length === 1 ? keys[0] : undefined);
  if (!jwk) throw bad('no matching key');
  if (!verify('RSA-SHA256', Buffer.from(`${head}.${payload}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(signature, 'base64url'))) throw bad('signature');
  const claims = decode(payload);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== opts.service.issuer) throw bad('issuer');
  if (!audience.includes(opts.clientId) || (claims.azp !== undefined && claims.azp !== opts.clientId) || (audience.length > 1 && claims.azp !== opts.clientId)) throw bad('audience');
  // a minute of clock difference between this machine and the issuer
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now() - 60_000) throw bad('expired');
  if (claims.nonce !== opts.nonce) throw bad('nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) throw bad('subject');
  return { subject: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
}

interface TokenReply { access_token?: unknown; refresh_token?: unknown; id_token?: unknown; token_type?: unknown; expires_in?: unknown; scope?: unknown }

export interface SignInStatus {
  signedIn: boolean;
  email: string | null;
  /** `waiting`: the browser has not come back yet; `done` / `failed`: the last sign-in since the app started. */
  phase: 'idle' | 'waiting' | 'done' | 'failed';
  /** Why the last sign-in failed: the service's error code, or what did not check out. */
  reason: string | null;
}

/** A sign-in waiting for the browser; `used` once a callback with its state came back, so the code is redeemed once. */
interface Flow { server: Server; timer: ReturnType<typeof setTimeout>; used: boolean }

export class ChatGPTAccount {
  private refreshing: Promise<string> | null = null;
  private flow: Flow | null = null;
  private outcome: { phase: 'done' | 'failed'; reason: string | null } | null = null;
  /** No request goes out before this epoch millisecond after the plan's usage limit was reached. */
  pausedUntil = 0;

  constructor(readonly dir: string, private readonly service: ChatGPTService, private readonly fetchImpl: typeof fetch = fetch) {}

  read(): Stored { return readStored(this.dir); }

  status(): SignInStatus {
    return {
      signedIn: signedIn(this.dir), email: this.read().email ?? null,
      phase: this.flow ? 'waiting' : this.outcome?.phase ?? 'idle', reason: this.outcome?.reason ?? null,
    };
  }

  /**
   * Listens for the callback and returns the authorization URL to open in the browser; a sign-in
   * still waiting is dropped. `page` is the HTML the browser shows once it is back.
   */
  async start(page: string): Promise<string> {
    this.cancel();
    this.outcome = null;
    const stored = this.read();
    const hostId = stored.hostId ?? `urn:uuid:${randomUUID()}`;
    if (!stored.hostId) writeStored(this.dir, { hostId });
    const state = random();
    const nonce = random();
    const verifier = random();
    const server = createServer();
    // port 0: the system picks one from its ephemeral range, which leaves out 1455, Codex CLI's port
    await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', () => done()); });
    const port = (server.address() as { port: number }).port;
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    const flow: Flow = { server, timer: setTimeout(() => this.settle(flow, new ChatGPTAuthError('timeout', 'The browser did not come back')), SIGN_IN_MS), used: false };
    flow.timer.unref();
    this.flow = flow;
    // any page the browser has open can send requests here: whatever is not this sign-in's callback is refused
    server.on('request', (req, res) => {
      let params: URLSearchParams;
      try {
        const url = new URL(req.url ?? '/', redirectUri);
        if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}` || url.pathname !== CALLBACK_PATH) {
          res.writeHead(404).end();
          return;
        }
        params = url.searchParams;
        const states = params.getAll('state');
        // a request without this sign-in's state leaves it waiting
        if (states.length !== 1 || !sameText(states[0]!, state) || flow.used || this.flow !== flow) {
          res.writeHead(400).end();
          return;
        }
      } catch {
        res.writeHead(400).end();
        return;
      }
      flow.used = true;
      clearTimeout(flow.timer);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }).end(page);
      void this.complete(params, { clientId: stored.clientId ?? null, redirectUri, verifier, nonce })
        .then(() => this.settle(flow, null), (err: unknown) => this.settle(flow, err));
    });
    const query = new URLSearchParams({
      client_id: stored.clientId ?? DYNAMIC_CLIENT, response_type: 'code', redirect_uri: redirectUri, scope: CHATGPT_SCOPES,
      resource: CHATGPT_RESOURCE, state, nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), ext_agent_host_id: hostId,
    });
    if (!stored.clientId) query.set('agent_name_hint', this.service.appName);
    else if (stored.email) query.set('login_hint', stored.email);
    return `${this.service.issuer}/api/accounts/authorize?${query}`;
  }

  /** Ends a sign-in still waiting. */
  cancel(): void {
    if (!this.flow) return;
    clearTimeout(this.flow.timer);
    this.flow.server.close();
    this.flow.server.closeAllConnections();
    this.flow = null;
  }

  /** Ends `flow` with its outcome; a flow already replaced or cancelled leaves the current state alone. */
  private settle(flow: Flow, err: unknown): void {
    if (this.flow !== flow) return;
    this.cancel();
    this.outcome = err === null ? { phase: 'done', reason: null } : { phase: 'failed', reason: err instanceof ChatGPTAuthError ? err.code : errText(err) };
  }

  private async complete(params: URLSearchParams, sent: { clientId: string | null; redirectUri: string; verifier: string; nonce: string }): Promise<void> {
    const error = params.get('error');
    if (error) throw new ChatGPTAuthError(error, params.get('error_description') ?? error);
    const code = params.get('code');
    const returned = params.getAll('client_id');
    const clientId = returned[0] ?? sent.clientId;
    if (!code || returned.length > 1 || !clientId || clientId === DYNAMIC_CLIENT || (sent.clientId && returned.length && returned[0] !== sent.clientId))
      throw new ChatGPTAuthError('registration_incomplete', 'ChatGPT did not complete the app registration');
    // kept before the one-time code is spent, so a failed exchange signs in again under the same registration
    if (clientId !== sent.clientId) writeStored(this.dir, { clientId });
    const reply = await this.tokenRequest({
      grant_type: 'authorization_code', client_id: clientId, code, code_verifier: sent.verifier, redirect_uri: sent.redirectUri, resource: CHATGPT_RESOURCE,
    });
    const scopes = typeof reply.scope === 'string' ? reply.scope.split(/\s+/).filter(Boolean) : [];
    if (!scopes.includes(PLAN_SCOPE)) throw new ChatGPTAuthError('plan_not_granted', `${PLAN_SCOPE} was not granted`);
    if (typeof reply.refresh_token !== 'string' || !reply.refresh_token || typeof reply.id_token !== 'string') throw new ChatGPTAuthError('invalid_token_response', 'ChatGPT returned incomplete credentials');
    const tokens = this.tokenFields(reply);
    const identity = await verifyIdToken(reply.id_token, { service: this.service, clientId, nonce: sent.nonce, fetchImpl: this.fetchImpl });
    const stored = this.read();
    if (stored.subject && stored.subject !== identity.subject) throw new ChatGPTAuthError('account_mismatch', 'This is another ChatGPT account than the one this endpoint signed in with');
    writeStored(this.dir, { ...tokens, refreshToken: reply.refresh_token, scope: scopes.join(','), subject: identity.subject, email: identity.email ?? undefined });
    // a new sign-in starts without the pause of the old one's usage limit
    this.pausedUntil = 0;
  }

  private tokenFields(reply: TokenReply): { accessToken: string; expiresAt: string } {
    if (typeof reply.access_token !== 'string' || !reply.access_token || typeof reply.expires_in !== 'number' || reply.expires_in <= 0
      || typeof reply.token_type !== 'string' || reply.token_type.toLowerCase() !== 'bearer')
      throw new ChatGPTAuthError('invalid_token_response', 'ChatGPT returned incomplete credentials');
    return { accessToken: reply.access_token, expiresAt: String(Date.now() + reply.expires_in * 1000) };
  }

  private async tokenRequest(form: Record<string, string>): Promise<TokenReply> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.service.issuer}/api/accounts/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(form), redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new ChatGPTAuthError('network_error', `The ChatGPT token endpoint could not be reached: ${errText(err)}`);
    }
    const body = await res.json().catch(() => null) as TokenReply | null;
    if (res.ok && !body) throw new ChatGPTAuthError('invalid_token_response', 'The ChatGPT token endpoint answered with a body that is not JSON', res.status);
    if (!res.ok || !body) {
      const { code, message } = errorCode(body);
      throw new ChatGPTAuthError(code ?? `http_${res.status}`, message ?? code ?? `HTTP ${res.status}`, res.status);
    }
    return body;
  }

  /**
   * A current access token, refreshed first when it is about to expire or is `stale` (the one the API
   * just refused). Callers waiting at the same time share one refresh.
   */
  async accessToken(stale?: string): Promise<string> {
    const stored = this.read();
    if (!stored.refreshToken || !stored.clientId) throw new ChatGPTAuthError('signed_out', 'The endpoint is not signed in to ChatGPT', 401);
    if (stored.accessToken && stored.accessToken !== stale && Number(stored.expiresAt) - Date.now() > REFRESH_MARGIN_MS) return stored.accessToken;
    this.refreshing ??= this.refresh(stored.clientId, stored.refreshToken, stored.scope).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async refresh(clientId: string, refreshToken: string, scope: string | undefined): Promise<string> {
    let reply: TokenReply;
    try {
      reply = await this.tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, resource: CHATGPT_RESOURCE });
    } catch (err) {
      // only the tokens this refresh used go: a sign-in that replaced them meanwhile keeps its own
      if (err instanceof ChatGPTAuthError && SIGNED_OUT_CODES.has(err.code) && this.read().refreshToken === refreshToken)
        writeStored(this.dir, Object.fromEntries(TOKENS.map((f) => [f, undefined])));
      const replaced = this.read();
      if (replaced.refreshToken && replaced.refreshToken !== refreshToken && replaced.accessToken) return replaced.accessToken;
      throw err;
    }
    const tokens = this.tokenFields(reply);
    // signed out or signed in again while the refresh was under way: its tokens are not written back,
    // and a new sign-in's token is used instead
    const current = this.read();
    if (current.refreshToken !== refreshToken) {
      if (current.refreshToken && current.accessToken) return current.accessToken;
      throw new ChatGPTAuthError('signed_out', 'The endpoint was signed out of ChatGPT', 401);
    }
    // the service may leave the scope out when it is unchanged
    const granted = typeof reply.scope === 'string' ? reply.scope.split(/\s+/).filter(Boolean).join(',') : scope;
    writeStored(this.dir, { ...tokens, refreshToken: typeof reply.refresh_token === 'string' && reply.refresh_token ? reply.refresh_token : refreshToken, scope: granted });
    return tokens.accessToken;
  }

  /**
   * Removes the tokens, after a refresh under way has stored the one it rotated to, and revokes the
   * refresh token; the registration and host id stay. The tokens go even when the revocation fails.
   */
  async signOut(): Promise<void> {
    this.cancel();
    await this.refreshing?.catch(() => {});
    const stored = this.read();
    writeStored(this.dir, Object.fromEntries(TOKENS.map((f) => [f, undefined])));
    this.outcome = null;
    this.pausedUntil = 0;
    if (!stored.refreshToken || !stored.clientId) return;
    try {
      const { revocation_endpoint: endpoint } = await discover(this.service, this.fetchImpl);
      if (endpoint) await this.fetchImpl(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'error', signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({ token: stored.refreshToken, token_type_hint: 'refresh_token', client_id: stored.clientId }),
      });
    } catch { /* unconfirmed: the tokens are gone from this machine all the same */ }
  }
}

const accounts = new Map<string, ChatGPTAccount>();

/** The one account object of the endpoint directory `dir`, shared by every instance of the endpoint and its console methods. */
export function accountAt(dir: string, service: ChatGPTService = CHATGPT_SERVICE, fetchImpl: typeof fetch = fetch): ChatGPTAccount {
  const key = `${resolve(dir)}\n${service.issuer}`;
  let account = accounts.get(key);
  if (!account) accounts.set(key, account = new ChatGPTAccount(dir, service, fetchImpl));
  return account;
}
