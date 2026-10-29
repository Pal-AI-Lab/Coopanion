/**
 * Local HTTP + WebSocket server for the pet's pages. Binds 127.0.0.1 only and answers only
 * requests whose Host is a loopback name, so a web page cannot reach it through DNS rebinding.
 *
 * - `/pet`: the pet itself. In the pet window it is transparent and click-through outside
 *   the figure; in a browser tab it draws a floor.
 * - `/dress`: the dressing page; changes go through `POST /api/skin` and `POST /api/prefs`.
 * - `/api/avatar`: the bot's avatar for the menu header, 404 until one exists.
 * - `POST /api/speech` (`{ text }`): the syllables the pet page's speech plays for a bubble's text (src/speech).
 * - `/api/figures`: the figure packs (src/packs.ts) the pages may load, Coo's first, each with whether it
 *   can be uninstalled (`removable`); `/packs/<id>/…`: an installed pack's files (a built-in one is under
 *   `/web/`). `/api/figures/status`: the installed packs that did not load and why, and whether packs can be
 *   imported here; `POST /api/figures/import` (a zip, or the page's framing of folders), `…/import/install`
 *   and `…/import/cancel` import them, `POST /api/figures/remove` (`{ id }`) uninstalls one (src/pack-import.ts).
 * - `/figure-frame?pack=<id>`: the sandbox a pack's code runs in. Its own CSP sandboxes it (an opaque
 *   origin) and lets it connect only to `/packs/<id>/` of an installed pack, nowhere for any other id;
 *   scripts and images come from this server only. Files
 *   under `/web/` and `/packs/` answer that opaque origin's CORS requests; nothing else does,
 *   and a write (`POST`, the socket) from it is refused.
 * - `/socket?role=pet|dress&host=window|tab`: one live pet connection plus any number of
 *   pages that only receive skin and preference updates. The window and overlay source authenticate
 *   with the key carried by `windowUrl`. A newer pet connection replaces the live one, except
 *   that a browser tab only watches while the pet window is connected. A
 *   watching tab still sends typed text, preference changes and run-control clicks.
 *   Binary frames from the pet connection are 16 kHz mono PCM16 microphone audio.
 * - `/overlay` and `/socket?role=overlay`: the OBS overlay page and its feed, while `overlay()` is on
 *   (404 and a closed socket otherwise). `/socket?role=overlay-source` is the pet window process: it is told
 *   `{ t: 'overlay', on }` (on while the overlay is on and a page watches) and its binary frames
 *   (host/overlay.cjs) go to every overlay page as they are; when it goes, the pages are sent a frame that clears them.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { languageTag, type Language } from 'cortico/core/language.ts';
import { packFile, type FigurePack, type PackProblem } from './packs.ts';
import { BUNDLE_TYPE, IMPORT_LARGE, PACK_DEPTH, filesFromBundle, filesFromZip, type PackImporter } from './pack-import.ts';
import { petText, type PetText } from './i18n/index.ts';
import type { SpeechUnit } from './speech/index.ts';

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
/**
 * A pack's files: the figure frame imports its scripts and loads its images, which this does not
 * restrict; a pack's HTML or SVG opened as a page runs in an opaque origin with no network.
 */
const PACK_CSP = "sandbox allow-scripts; default-src 'none'";
/** The pages' own CSP. */
const PAGE_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*";
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
  /** What was wrong in the pack directories, looked up again for each request. */
  packProblems?(): PackProblem[];
  /** Installs packs the dressing page sends; without it the page offers no import. */
  importer?: PackImporter;
  /** The app language, stamped on each page's `<html lang>` as it is served; the page loads its text in it. `zh` when absent. */
  language?(): Language;
  /** The text table of the app language, for errors; Chinese when absent. */
  text?(): PetText;
  /** Whether the OBS overlay is served; off when absent. */
  overlay?(): boolean;
  /** The syllables `text` is spoken as; `POST /api/speech` answers 404 without it. */
  speech?(text: string): SpeechUnit[];
}

export class PetServer {
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private pet: WebSocket | null = null;
  private petIsWindow = false;
  /** Dressing pages and pet pages that only watch. */
  private readonly dressers = new Set<WebSocket>();
  /** The pet window process sending the overlay's frames, and the overlay pages watching. */
  private overlaySource: WebSocket | null = null;
  private readonly overlayViewers = new Set<WebSocket>();
  /** What the source was last told. */
  private overlayTold: boolean | null = null;
  private boundPort = 0;
  private readonly windowKey = randomUUID();

  constructor(private readonly opts: PetServerOptions) {}

  get port(): number {
    return this.boundPort;
  }

  private get t(): PetText {
    return this.opts.text?.() ?? petText();
  }

  get origin(): string {
    return this.boundPort ? `http://127.0.0.1:${this.boundPort}` : '';
  }

  /** Only the window host receives this URL; its fragment stays out of HTTP requests and referrers. */
  get windowUrl(): string {
    return `${this.origin}/pet#key=${this.windowKey}`;
  }

  get petConnected(): boolean {
    return this.pet !== null && this.pet.readyState === this.pet.OPEN;
  }

  /** The connected pet page is the pet window, not a browser tab. */
  get petInWindow(): boolean {
    return this.petConnected && this.petIsWindow;
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
        if (!this.allowed(req, true)) { socket.end('HTTP/1.1 421 Misdirected Request\r\nConnection: close\r\n\r\n'); return; }
        const url = new URL(req.url ?? '/', this.origin);
        if (url.pathname !== '/socket') { socket.destroy(); return; }
        const params = url.searchParams;
        if ((params.get('host') === 'window' || params.get('role') === 'overlay-source') && params.get('key') !== this.windowKey) {
          socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
        }
        this.wss!.handleUpgrade(req, socket, head, (ws) => this.accept(ws, req));
      });
      return this.boundPort;
    }
    throw new Error(this.t.portsTaken(base, base + PORT_ATTEMPTS - 1, lastErr?.message ?? ''));
  }

  async stop(): Promise<void> {
    for (const ws of [this.pet, ...this.dressers, this.overlaySource, ...this.overlayViewers]) ws?.close();
    this.pet = null;
    this.dressers.clear();
    this.overlaySource = null;
    this.overlayViewers.clear();
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

  /** Follows `overlay()`: off closes the overlay pages; the source streams while it is on and a page watches. */
  syncOverlay(): void {
    if (!this.overlayEnabled) for (const ws of this.overlayViewers) ws.close(4003, 'overlay off');
    const source = this.overlaySource;
    if (!source || source.readyState !== source.OPEN) return;
    const on = this.overlayEnabled && this.overlayViewers.size > 0;
    if (on === this.overlayTold) return;
    this.overlayTold = on;
    source.send(JSON.stringify({ t: 'overlay', on }));
  }

  private get overlayEnabled(): boolean {
    return this.opts.overlay?.() ?? false;
  }

  /** Browser writes require this service's HTTP origin; local clients may omit Origin. Reads also allow loopback and opaque origins. */
  private allowed(req: IncomingMessage, write: boolean): boolean {
    if (!LOOPBACK.test(req.headers.host ?? '')) return false;
    const origin = req.headers.origin;
    if (origin === 'null') return !write;
    if (!origin) return true;
    if (write) return origin === this.origin || origin === `http://localhost:${this.boundPort}`;
    try {
      return LOOPBACK.test(new URL(origin).host);
    } catch {
      return false;
    }
  }

  private accept(ws: WebSocket, req: IncomingMessage): void {
    const params = new URL(req.url ?? '/', 'http://x').searchParams;
    const fromWindow = params.get('host') === 'window';
    if (params.get('role') === 'overlay-source') return this.acceptOverlaySource(ws);
    if (params.get('role') === 'overlay') return this.acceptOverlayViewer(ws);
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
        if (this.pet !== ws) return;
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

  private acceptOverlaySource(ws: WebSocket): void {
    this.overlaySource?.close(4000, 'replaced');
    this.overlaySource = ws;
    this.overlayTold = null;
    ws.on('message', (data, isBinary) => {
      if (this.overlaySource !== ws || !isBinary || !this.overlayEnabled) return;
      for (const viewer of this.overlayViewers) if (viewer.readyState === viewer.OPEN) viewer.send(data, { binary: true });
    });
    ws.on('close', () => {
      if (this.overlaySource !== ws) return;
      this.overlaySource = null;
      // the window process is gone: the pages must not keep its last picture
      const clear = Buffer.alloc(24);
      for (const viewer of this.overlayViewers) if (viewer.readyState === viewer.OPEN) viewer.send(clear, { binary: true });
    });
    this.syncOverlay();
  }

  private acceptOverlayViewer(ws: WebSocket): void {
    if (!this.overlayEnabled) { ws.close(4003, 'overlay off'); return; }
    this.overlayViewers.add(ws);
    ws.on('close', () => { this.overlayViewers.delete(ws); this.syncOverlay(); });
    this.syncOverlay();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.allowed(req, req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(421).end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/api/figures') {
      const importer = this.opts.importer;
      return json(res, 200, (this.opts.packs?.() ?? []).map((pack) => {
        const { id, base, manifest: m } = pack;
        return {
          id, base, name: m.name, thumb: m.thumb ?? null, entry: m.entry, export: m.export, model: m.model ?? null, axes: m.axes, presets: m.presets,
          vocab: m.vocab.map(({ id: w, kind, seconds, lasting }) => ({ id: w, kind, seconds, ...(lasting ? { lasting } : {}) })), sounds: m.sounds, can: m.can, needs: m.needs,
          voice: m.voice, effects: m.effects, bubble: m.bubble ?? null,
          removable: importer?.removable(pack) ?? false,
        };
      }));
    }
    if (req.method === 'GET' && path === '/api/figures/status') {
      return json(res, 200, {
        importable: !!this.opts.importer, large: IMPORT_LARGE, depth: PACK_DEPTH,
        problems: (this.opts.packProblems?.() ?? []).filter((p) => !p.loaded).map((p) => ({ dir: basename(p.dir), reason: p.reason })),
      });
    }
    if (req.method === 'POST' && path.startsWith('/api/figures/import') && this.opts.importer) return this.importRequest(req, res, path, this.opts.importer);
    if (req.method === 'POST' && path === '/api/figures/remove' && this.opts.importer) {
      const msg = parse(await readBody(req) ?? '');
      if (typeof msg?.id !== 'string') return json(res, 400, { error: 'bad json' });
      const out = await this.opts.importer.remove(msg.id);
      return json(res, 'error' in out ? 400 : 200, out);
    }
    if (req.method === 'GET' && path === '/figure-frame') {
      const self = `http://${req.headers.host}`;
      // an installed pack (`?pack=<id>`) may fetch its own folder, which never redirects (a CSP path stops holding after
      // a redirect); a built-in pack, an unknown id or none connects nowhere
      const id = url.searchParams.get('pack');
      const own = id && (this.opts.packs?.() ?? []).some((p) => p.id === id && !p.builtin) ? `${self}/packs/${id}/` : "'none'";
      return this.sendFile(res, join(this.opts.webDir, 'figure-frame.html'), [
        'sandbox allow-scripts', "default-src 'none'", `script-src ${self}`, `img-src ${self} data: blob:`, "style-src 'unsafe-inline'", `connect-src ${own}`,
        // the pet page holds it, and the console that shows the pet page in its own frames (another local port) is an ancestor too
        `frame-ancestors ${self} http://127.0.0.1:* http://localhost:*`,
      ].join('; '));
    }
    if (req.method === 'GET' && path.startsWith('/packs/')) {
      const [, , id, ...rest] = path.split('/');
      const pack = (this.opts.packs?.() ?? []).find((p) => p.id === id && !p.builtin);
      const full = pack ? packFile(pack, decodeURIComponent(rest.join('/'))) : null;
      if (!full) { res.writeHead(404).end(); return; }
      return this.sendFile(res, full, PACK_CSP, req.headers.origin === 'null');
    }
    if (req.method === 'GET' && path === '/api/state') return json(res, 200, this.opts.snapshot());
    if (req.method === 'GET' && path === '/api/avatar') {
      const bytes = this.opts.avatarFile ? await readFile(this.opts.avatarFile).catch(() => null) : null;
      if (!bytes) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' }).end(bytes);
      return;
    }
    if (req.method === 'POST' && path === '/api/speech') {
      const msg = parse(await readBody(req) ?? '');
      if (!this.opts.speech) { res.writeHead(404).end(); return; }
      if (typeof msg?.text !== 'string') return json(res, 400, { error: 'bad json' });
      return json(res, 200, { units: this.opts.speech(msg.text) });
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
    if (path === '/overlay') {
      if (!this.overlayEnabled) { res.writeHead(404).end(); return; }
      return this.sendPage(res, join(this.opts.webDir, 'overlay.html'));
    }
    const file = PAGES[path] ?? (path.startsWith('/web/') ? path.slice(5) : null);
    if (!file) { res.writeHead(404).end(); return; }
    const root = normalize(this.opts.webDir).replace(/[\\/]+$/, '') + sep;
    const full = normalize(join(root, file));
    if (!full.startsWith(root)) { res.writeHead(403).end(); return; }
    if (PAGES[path]) return this.sendPage(res, full);
    return this.sendFile(res, full, null, path.startsWith('/web/') && req.headers.origin === 'null');
  }

  /** A page, its `<html lang>` set to the app language (`zh` as `zh-CN`). */
  private async sendPage(res: ServerResponse, full: string): Promise<void> {
    const lang = languageTag(this.opts.language?.() ?? 'zh');
    try {
      const html = (await readFile(full, 'utf8')).replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache', 'content-security-policy': PAGE_CSP });
      res.end(html);
    } catch {
      res.writeHead(404).end();
    }
  }

  private async importRequest(req: IncomingMessage, res: ServerResponse, path: string, importer: PackImporter): Promise<void> {
    if (path === '/api/figures/import') {
      const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      if (type !== 'application/zip' && type !== BUNDLE_TYPE) return json(res, 415, { error: this.t.importing.zipOrFolder });
      const bytes = await readBytes(req);
      if (!bytes) return json(res, 400, { error: this.t.importing.truncated });
      const files = type === BUNDLE_TYPE ? filesFromBundle(bytes, this.t.importing) : filesFromZip(bytes, this.t.importing);
      if (typeof files === 'string') return json(res, 400, { error: files });
      const out = await importer.stage(files, type === BUNDLE_TYPE);
      return json(res, 'error' in out ? 400 : 200, out);
    }
    const body = await readBody(req);
    const msg = body ? parse(body) : null;
    if (path === '/api/figures/import/install' && msg && typeof msg.token === 'string' && Array.isArray(msg.dirs)) {
      const replace = Array.isArray(msg.replace) ? msg.replace.filter((id): id is string => typeof id === 'string') : [];
      const out = await importer.install(msg.token, msg.dirs.filter((d): d is string => typeof d === 'string'), replace);
      return json(res, 'error' in out ? 400 : 'conflicts' in out ? 409 : 200, out);
    }
    if (path === '/api/figures/import/cancel') { await importer.cancel(); return json(res, 200, { ok: true }); }
    return json(res, 400, { error: 'bad request' });
  }

  /** A file with the pages' CSP (or `csp`); `frame` answers the figure frame's CORS request. */
  private async sendFile(res: ServerResponse, full: string, csp: string | null, frame = false): Promise<void> {
    try {
      const bytes = await readFile(full);
      res.writeHead(200, {
        'content-type': MIME[extname(full)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
        'content-security-policy': csp ?? PAGE_CSP,
        'x-content-type-options': 'nosniff',
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

/** The body of `req`, or null when it is longer than `max` bytes or breaks off. */
function readBytes(req: IncomingMessage): Promise<Uint8Array | null> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', () => done(null));
  });
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
