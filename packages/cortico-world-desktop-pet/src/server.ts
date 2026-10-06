/**
 * Local HTTP + WebSocket server for the pet's pages. Binds 127.0.0.1 only and answers only
 * requests whose Host is a loopback name, so a web page cannot reach it through DNS rebinding.
 *
 * - `/pet`: the pet itself. In the pet window it is transparent and click-through outside
 *   the figure; in a browser tab it draws a floor.
 * - `/dress`: the dressing page; changes go through `POST /api/skin` and `POST /api/prefs`.
 * - `/api/avatar`: the bot's avatar for the menu header, 404 until one exists.
 * - `/api/figures`: the figure packs (src/packs.ts) the pages may load, Coo's first; `/packs/<id>/…`:
 *   an installed pack's files (a built-in one is under `/web/`).
 * - `/figure-frame`: the sandbox a pack's code runs in. Its own CSP sandboxes it (an opaque
 *   origin) and denies it every connection; scripts and images come from this server only. Files
 *   under `/web/` and `/packs/` answer that opaque origin's CORS requests; nothing else does,
 *   and a write (`POST`, the socket) from it is refused.
 * - `/socket?role=pet|dress&host=window|tab`: one live pet connection plus any number of
 *   pages that only receive skin and preference updates. A newer pet connection replaces the
 *   live one, except that a browser tab only watches while the pet window is connected. A
 *   watching tab still sends typed text, preference changes and run-control clicks.
 *   Binary frames from the pet connection are 16 kHz mono PCM16 microphone audio.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { packFile, type FigurePack } from './packs.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const PAGES: Record<string, string> = { '/pet': 'pet.html', '/dress': 'dress.html' };
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const PORT_ATTEMPTS = 10;
/** What a watching pet page may still send: input that is the person's whichever page it came from. */
const WATCHER_MESSAGES = new Set(['text', 'prefs', 'control']);

export type PageMessage = Record<string, unknown> & { t: string };

export interface PetServerOptions {
  port: () => number;
  webDir: string;
  /** Snapshot sent to every new connection and served at `/api/state`. */
  snapshot(): Record<string, unknown>;
  onPetMessage(msg: PageMessage): void;
  onAudio(frame: Int16Array): void;
  onPetConnect(): void;
  onPetDisconnect(): void;
  /** A dressing page saved a skin. */
  onSkin(skin: unknown): void;
  onPrefs(prefs: Record<string, unknown>): void;
  /** PNG served at `/api/avatar`. */
  avatarFile?: string;
  /** The figure packs, looked up again for each request. */
  packs?(): FigurePack[];
}

export class PetServer {
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private pet: WebSocket | null = null;
  private petIsWindow = false;
  /** Dressing pages and pet pages that only watch. */
  private readonly dressers = new Set<WebSocket>();
  private boundPort = 0;

  constructor(private readonly opts: PetServerOptions) {}

  get port(): number {
    return this.boundPort;
  }

  get origin(): string {
    return this.boundPort ? `http://127.0.0.1:${this.boundPort}` : '';
  }

  get petConnected(): boolean {
    return this.pet !== null && this.pet.readyState === this.pet.OPEN;
  }

  async start(): Promise<number> {
    const base = this.opts.port();
    let lastErr: Error | null = null;
    for (let i = 0; i < PORT_ATTEMPTS; i++) {
      const server = createServer((req, res) => { void this.handle(req, res); });
      try {
        await new Promise<void>((done, fail) => {
          server.once('error', fail);
          server.listen(base === 0 ? 0 : base + i, '127.0.0.1', () => { server.off('error', fail); done(); });
        });
      } catch (err) {
        lastErr = err as Error;
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EADDRINUSE' || code === 'EACCES') continue;
        throw err;
      }
      this.http = server;
      const addr = server.address();
      this.boundPort = typeof addr === 'object' && addr ? addr.port : 0;
      this.wss = new WebSocketServer({ noServer: true });
      server.on('upgrade', (req, socket, head) => {
        if (!this.allowed(req, true) || !(req.url ?? '').startsWith('/socket')) { socket.destroy(); return; }
        this.wss!.handleUpgrade(req, socket, head, (ws) => this.accept(ws, req));
      });
      return this.boundPort;
    }
    throw new Error(`端口 ${base}–${base + PORT_ATTEMPTS - 1} 都被占用:${lastErr?.message ?? ''}`);
  }

  async stop(): Promise<void> {
    for (const ws of [this.pet, ...this.dressers]) ws?.close();
    this.pet = null;
    this.dressers.clear();
    this.wss?.close();
    this.wss = null;
    const http = this.http;
    this.http = null;
    this.boundPort = 0;
    if (http) {
      http.closeAllConnections();
      await new Promise<void>((r) => http.close(() => r()));
    }
  }

  /** Sends to the pet page; false when no page is connected. */
  sendPet(msg: PageMessage): boolean {
    if (!this.petConnected) return false;
    this.pet!.send(JSON.stringify(msg));
    return true;
  }

  /** Sends to the pet page and every dressing page. */
  broadcast(msg: PageMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of [this.pet, ...this.dressers]) if (ws && ws.readyState === ws.OPEN) ws.send(text);
  }

  /** A loopback Host, and a loopback or absent Origin; an opaque origin (the figure frame) only reads. */
  private allowed(req: IncomingMessage, write: boolean): boolean {
    if (!LOOPBACK.test(req.headers.host ?? '')) return false;
    const origin = req.headers.origin;
    if (origin === 'null') return !write;
    if (!origin) return true;
    try {
      return LOOPBACK.test(new URL(origin).host);
    } catch {
      return false;
    }
  }

  private accept(ws: WebSocket, req: IncomingMessage): void {
    const params = new URL(req.url ?? '/', 'http://x').searchParams;
    const fromWindow = params.get('host') === 'window';
    ws.send(JSON.stringify({ t: 'init', ...this.opts.snapshot() }));
    // the pet window outranks a browser tab: a tab opened while the window is connected only watches
    const watcher = params.get('role') !== 'pet' || (!fromWindow && this.petConnected && this.petIsWindow);
    if (!watcher) {
      const old = this.pet;
      this.pet = ws;
      this.petIsWindow = fromWindow;
      if (old) old.close(4000, 'replaced');
      this.opts.onPetConnect();
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const buf = data as Buffer;
          if (buf.length % 2 === 0) this.opts.onAudio(new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)));
          return;
        }
        const msg = parse(data.toString());
        if (msg) this.opts.onPetMessage(msg);
      });
      ws.on('close', () => {
        if (this.pet !== ws) return;
        this.pet = null;
        this.opts.onPetDisconnect();
      });
      return;
    }
    if (params.get('role') === 'pet') {
      ws.send(JSON.stringify({ t: 'watching' }));
      ws.on('message', (data, isBinary) => {
        const msg = isBinary ? null : parse(data.toString());
        if (msg && WATCHER_MESSAGES.has(msg.t)) this.opts.onPetMessage(msg);
      });
    }
    this.dressers.add(ws);
    ws.on('close', () => this.dressers.delete(ws));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.allowed(req, req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(421).end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/api/figures') {
      return json(res, 200, (this.opts.packs?.() ?? []).map(({ id, base, manifest: m }) => ({
        id, base, name: m.name, thumb: m.thumb ?? null, entry: m.entry, export: m.export, model: m.model ?? null, axes: m.axes, presets: m.presets,
        vocab: m.vocab.map(({ id: w, kind, seconds, lasting }) => ({ id: w, kind, seconds, ...(lasting ? { lasting } : {}) })), sounds: m.sounds, can: m.can,
      })));
    }
    if (req.method === 'GET' && path === '/figure-frame') {
      const self = `http://${req.headers.host}`;
      return this.sendFile(res, join(this.opts.webDir, 'figure-frame.html'), [
        'sandbox allow-scripts', "default-src 'none'", `script-src ${self}`, `img-src ${self} data: blob:`, "style-src 'unsafe-inline'", "connect-src 'none'", `frame-ancestors ${self}`,
      ].join('; '));
    }
    if (req.method === 'GET' && path.startsWith('/packs/')) {
      const [, , id, ...rest] = path.split('/');
      const pack = (this.opts.packs?.() ?? []).find((p) => p.id === id && !p.builtin);
      const full = pack ? packFile(pack, decodeURIComponent(rest.join('/'))) : null;
      if (!full) { res.writeHead(404).end(); return; }
      return this.sendFile(res, full, null, req.headers.origin === 'null');
    }
    if (req.method === 'GET' && path === '/api/state') return json(res, 200, this.opts.snapshot());
    if (req.method === 'GET' && path === '/api/avatar') {
      const bytes = this.opts.avatarFile ? await readFile(this.opts.avatarFile).catch(() => null) : null;
      if (!bytes) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' }).end(bytes);
      return;
    }
    if (req.method === 'POST' && (path === '/api/skin' || path === '/api/prefs')) {
      const body = await readBody(req);
      const msg = body ? parse(body) : null;
      if (!msg) return json(res, 400, { error: 'bad json' });
      if (path === '/api/skin') this.opts.onSkin(msg.skin);
      else this.opts.onPrefs(msg);
      return json(res, 200, { ok: true });
    }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (path === '/') { res.writeHead(302, { location: '/pet' }).end(); return; }
    const file = PAGES[path] ?? (path.startsWith('/web/') ? path.slice(5) : null);
    if (!file) { res.writeHead(404).end(); return; }
    const root = normalize(this.opts.webDir).replace(/[\\/]+$/, '') + sep;
    const full = normalize(join(root, file));
    if (!full.startsWith(root)) { res.writeHead(403).end(); return; }
    return this.sendFile(res, full, null, path.startsWith('/web/') && req.headers.origin === 'null');
  }

  /** A file with the pages' CSP (or `csp`); `frame` answers the figure frame's CORS request. */
  private async sendFile(res: ServerResponse, full: string, csp: string | null, frame = false): Promise<void> {
    try {
      const bytes = await readFile(full);
      res.writeHead(200, {
        'content-type': MIME[extname(full)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
        'content-security-policy': csp ?? "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*",
        ...(frame ? { 'access-control-allow-origin': 'null' } : {}),
      });
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  }
}

function parse(text: string): PageMessage | null {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as PageMessage) : null;
  } catch {
    return null;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const MAX_BODY = 64 * 1024;
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((done) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); done(null); return; }
      chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => done(null));
  });
}
