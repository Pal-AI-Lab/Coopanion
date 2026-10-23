/**
 * LAN rooms for desktop pets. A host owns one WebSocket listener; guests connect to it. The wire
 * carries a player's name, normalized x and y, facing, skin and visual actions. Screen pixels, scale
 * and window settings stay local, so each client maps the position to its own stage. Positions move
 * at ONLINE_TICK_HZ; the receiving page interpolates between them.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { DESKTOP_PET_DEFAULTS, type PetSkin } from './config.ts';

export const ONLINE_DEFAULT_HOST = 'localhost';
export const ONLINE_DEFAULT_PORT = 11451;
export const ONLINE_TICK_HZ = 20;
export const ONLINE_TICK_MS = 1000 / ONLINE_TICK_HZ;
export const ONLINE_NAME_MAX = 24;

const PLAYERS_MAX = 16;
const MESSAGE_MAX = 64 * 1024;
const HELLO_TIMEOUT_MS = 6_000;
const JOIN_TIMEOUT_MS = 8_000;
const SKIN_TEXT_MAX = 64;
const COLORS_MAX = 16;

export type OnlineMode = 'off' | 'host' | 'guest';
export type OnlinePhase = 'idle' | 'connecting' | 'connected' | 'error';
export type OnlineErrorCode = 'busy' | 'name' | 'host' | 'port' | 'listen' | 'connect' | 'disconnected' | 'full' | 'protocol';

export interface OnlineSnapshot {
  x: number;
  /** Vertical offset from the stage floor, as a share of stage height; 0 means standing on it. */
  y: number;
  dragging: boolean;
  facing: 1 | -1;
  skin: PetSkin;
}

export interface OnlinePlayer extends OnlineSnapshot {
  id: string;
  name: string;
  /** A persistent body mode another player can replay when joining; short actions arrive as behavior frames. */
  action?: string;
}

export type OnlineBehavior =
  | { kind: 'state'; action: string }
  | { kind: 'action'; action: string }
  | { kind: 'cue'; cue: string }
  | { kind: 'interrupt' };

export interface OnlineUiState {
  mode: OnlineMode;
  phase: OnlinePhase;
  name: string;
  host: string;
  port: number;
  players: Array<{ id: string; name: string }>;
  addresses: string[];
  error: { code: OnlineErrorCode; detail: string | null } | null;
}

export interface OnlinePageState {
  active: boolean;
  players: OnlinePlayer[];
}

export interface OnlineRoomOptions {
  snapshot(): OnlineSnapshot;
  onPageState(state: OnlinePageState): void;
  onPeer(player: OnlinePlayer): void;
  onRemove(id: string): void;
  onBehavior(id: string, behavior: OnlineBehavior): void;
}

interface GuestSocket {
  id: string | null;
  timer: NodeJS.Timeout;
}

const clampPosition = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5;

const clampLift = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(-2, Math.min(2, value)) : 0;

const cleanName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, ONLINE_NAME_MAX).join('');
};

const cleanText = (value: unknown, max = SKIN_TEXT_MAX): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';

function cleanColors(value: unknown): PetSkin['colors'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(DESKTOP_PET_DEFAULTS.skin.colors);
  const out: PetSkin['colors'] = {};
  for (const [key, entry] of Object.entries(value).slice(0, COLORS_MAX)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const pair = entry as Record<string, unknown>;
    out[cleanText(key, 32)] = { main: cleanText(pair.main, 32), acc: cleanText(pair.acc, 32) };
  }
  return out;
}

function cleanSkin(value: unknown): PetSkin {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const fallback = DESKTOP_PET_DEFAULTS.skin;
  return {
    figure: cleanText(raw.figure, 32) || fallback.figure,
    scheme: cleanText(raw.scheme, 64),
    palette: cleanText(raw.palette, 32) || fallback.palette,
    head: cleanText(raw.head, 32) || fallback.head,
    side: cleanText(raw.side, 32) || fallback.side,
    glasses: cleanText(raw.glasses, 32) || fallback.glasses,
    neck: cleanText(raw.neck, 32) || fallback.neck,
    colors: cleanColors(raw.colors),
  };
}

function readSnapshot(value: unknown): OnlineSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    x: clampPosition(raw.x),
    y: clampLift(raw.y),
    dragging: raw.dragging === true,
    facing: raw.facing === -1 ? -1 : 1,
    skin: cleanSkin(raw.skin),
  };
}

function cleanBehavior(value: unknown): OnlineBehavior | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'state' || raw.kind === 'action') {
    const action = cleanText(raw.action, 32);
    return action ? { kind: raw.kind, action } : null;
  }
  if (raw.kind === 'cue') {
    const cue = cleanText(raw.cue, 32);
    return cue ? { kind: 'cue', cue } : null;
  }
  if (raw.kind === 'interrupt') return { kind: 'interrupt' };
  return null;
}

const cleanAction = (value: unknown): string => cleanText(value, 32);

export function validOnlineAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const host = value.trim();
  if (!host || host.length > 253) return false;
  const bare = host.replace(/^\[|\]$/g, '');
  if (isIP(bare) === 6) return true;
  if (/[\s/:?#[\]@]/.test(bare)) return false;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::') return true;
  if (isIP(host)) return true;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host);
}

function socketHost(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host;
}

function isWildcard(host: string): boolean {
  return host === '0.0.0.0' || host === '::';
}

function lanAddresses(host: string): string[] {
  if (host === 'localhost') return ['localhost'];
  if (!isWildcard(host)) return [host];
  const out: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && !out.includes(entry.address)) out.push(entry.address);
    }
  }
  return out;
}

function parseMessage(data: RawData): Record<string, unknown> | null {
  try {
    const text = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8');
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket | null, message: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export class OnlineRoom {
  private mode: OnlineMode = 'off';
  private phase: OnlinePhase = 'idle';
  private name = '';
  private host = ONLINE_DEFAULT_HOST;
  private requestedPort = ONLINE_DEFAULT_PORT;
  private boundPort = 0;
  private error: OnlineUiState['error'] = null;
  private hostServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private hostId = '';
  private selfId = '';
  private lastSkin = '';
  private hostAction = '';
  private tickTimer: NodeJS.Timeout | null = null;
  private readonly peers = new Map<string, OnlinePlayer>();
  private readonly guests = new Map<WebSocket, GuestSocket>();

  constructor(private readonly opts: OnlineRoomOptions) {}

  private snapshot(): OnlineSnapshot {
    const value = this.opts.snapshot();
    return {
      x: clampPosition(value.x),
      y: clampLift(value.y),
      dragging: value.dragging === true,
      facing: value.facing === -1 ? -1 : 1,
      skin: cleanSkin(value.skin),
    };
  }

  private fail(code: OnlineErrorCode, detail: unknown = null): OnlineUiState {
    this.error = { code, detail: detail instanceof Error ? detail.message : detail ? String(detail) : null };
    if (this.mode === 'off') this.phase = 'error';
    return this.uiState();
  }

  uiState(): OnlineUiState {
    return {
      mode: this.mode,
      phase: this.phase,
      name: this.name,
      host: this.host,
      port: this.boundPort || this.requestedPort,
      players: [...this.peers.values()].map(({ id, name }) => ({ id, name })),
      addresses: this.mode === 'host' && this.phase === 'connected' ? lanAddresses(this.host) : [],
      error: this.error,
    };
  }

  pageState(): OnlinePageState {
    return { active: this.phase === 'connected' && this.mode !== 'off', players: [...this.peers.values()] };
  }

  private publish(): void {
    this.opts.onPageState(this.pageState());
  }

  private hostPlayer(): OnlinePlayer {
    return { id: this.hostId, name: this.name, ...this.snapshot(), ...(this.hostAction ? { action: this.hostAction } : {}) };
  }

  private localPlayer(): OnlinePlayer {
    return { id: this.selfId, name: this.name, ...this.snapshot() };
  }

  private resetPeers(): void {
    for (const id of this.peers.keys()) this.opts.onRemove(id);
    this.peers.clear();
  }

  private putPeer(player: OnlinePlayer): void {
    this.peers.set(player.id, player);
    this.opts.onPeer(player);
  }

  private removePeer(id: string): void {
    if (!this.peers.delete(id)) return;
    this.opts.onRemove(id);
  }

  async create(nameValue: unknown, hostValue: unknown, portValue: unknown): Promise<OnlineUiState> {
    if (this.mode !== 'off') return this.fail('busy');
    const name = cleanName(nameValue);
    if (!name) return this.fail('name');
    const host = typeof hostValue === 'string' ? hostValue.trim().replace(/^\[|\]$/g, '') : '';
    if (!validOnlineAddress(host)) return this.fail('host');
    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 0 || port > 65535) return this.fail('port');

    this.mode = 'host';
    this.phase = 'connecting';
    this.name = name;
    this.host = host;
    this.requestedPort = port;
    this.boundPort = 0;
    this.hostId = randomUUID();
    this.error = null;
    this.publish();

    const server = createServer((_req, res) => {
      res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('WebSocket only');
    });
    const wss = new WebSocketServer({ noServer: true, maxPayload: MESSAGE_MAX });
    server.on('upgrade', (req, socket, head) => {
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/') { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, (ws) => this.acceptGuest(ws));
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (err) {
      wss.close();
      server.close();
      this.mode = 'off';
      this.phase = 'error';
      this.error = { code: 'listen', detail: (err as Error).message };
      this.publish();
      return this.uiState();
    }

    this.hostServer = server;
    this.wss = wss;
    this.boundPort = (server.address() as AddressInfo).port;
    this.phase = 'connected';
    this.lastSkin = JSON.stringify(this.snapshot().skin);
    this.startTick();
    this.publish();
    return this.uiState();
  }

  private acceptGuest(ws: WebSocket): void {
    if (this.mode !== 'host' || this.phase !== 'connected' || this.peers.size >= PLAYERS_MAX - 1) {
      ws.close(4003, 'room full');
      return;
    }
    const state: GuestSocket = {
      id: null,
      timer: setTimeout(() => ws.close(4008, 'hello timeout'), HELLO_TIMEOUT_MS),
    };
    this.guests.set(ws, state);
    ws.on('message', (data, isBinary) => {
      if (isBinary) { ws.close(4002, 'text only'); return; }
      const msg = parseMessage(data);
      if (!msg) { ws.close(4002, 'bad message'); return; }
      const guest = this.guests.get(ws);
      if (!guest) return;
      if (!guest.id) {
        if (msg.t !== 'hello') { ws.close(4002, 'hello required'); return; }
        const name = cleanName(msg.name);
        const snapshot = readSnapshot(msg);
        if (!name || !snapshot) { ws.close(4002, 'bad hello'); return; }
        clearTimeout(guest.timer);
        guest.id = randomUUID();
        const player: OnlinePlayer = { id: guest.id, name, ...snapshot };
        this.peers.set(player.id, player);
        send(ws, { t: 'welcome', id: player.id, host: this.hostPlayer(), players: [...this.peers.values()].filter((p) => p.id !== player.id) });
        this.broadcast({ t: 'player', player }, ws);
        this.putPeer(player);
        return;
      }
      if (msg.t === 'player') {
        const snapshot = readSnapshot(msg.player);
        if (!snapshot) return;
        const current = this.peers.get(guest.id);
        if (!current) return;
        const player = { ...current, ...snapshot };
        this.peers.set(player.id, player);
        this.broadcast({ t: 'player', player }, ws);
        this.putPeer(player);
        return;
      }
      if (msg.t === 'motion') {
        const current = this.peers.get(guest.id);
        if (!current) return;
        const player = {
          ...current,
          x: clampPosition(msg.x),
          y: clampLift(msg.y),
          dragging: msg.dragging === true,
          facing: msg.facing === -1 ? -1 as const : 1 as const,
        };
        this.peers.set(player.id, player);
        this.broadcast({ t: 'motion', id: player.id, x: player.x, y: player.y, dragging: player.dragging, facing: player.facing }, ws);
        this.putPeer(player);
        return;
      }
      if (msg.t === 'skin') {
        const current = this.peers.get(guest.id);
        if (!current) return;
        const player = { ...current, skin: cleanSkin(msg.skin) };
        this.peers.set(player.id, player);
        this.broadcast({ t: 'skin', id: player.id, skin: player.skin }, ws);
        this.putPeer(player);
        return;
      }
      if (msg.t === 'behavior') {
        const behavior = cleanBehavior(msg.behavior);
        if (!behavior) return;
        if (behavior.kind === 'state' || behavior.kind === 'interrupt') {
          const current = this.peers.get(guest.id);
          if (current) this.peers.set(guest.id, { ...current, action: behavior.kind === 'state' ? behavior.action : 'idle' });
        }
        this.opts.onBehavior(guest.id, behavior);
        this.broadcast({ t: 'behavior', id: guest.id, behavior }, ws);
      }
    });
    ws.on('close', () => {
      const guest = this.guests.get(ws);
      this.guests.delete(ws);
      if (!guest?.id) return;
      clearTimeout(guest.timer);
      this.removePeer(guest.id);
      this.broadcast({ t: 'remove', id: guest.id });
    });
    ws.on('error', () => ws.close());
  }

  async join(nameValue: unknown, hostValue: unknown, portValue: unknown): Promise<OnlineUiState> {
    if (this.mode !== 'off') return this.fail('busy');
    const name = cleanName(nameValue);
    if (!name) return this.fail('name');
    const host = typeof hostValue === 'string' ? hostValue.trim().replace(/^\[|\]$/g, '') : '';
    if (!validOnlineAddress(host) || isWildcard(host)) return this.fail('host');
    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return this.fail('port');

    this.mode = 'guest';
    this.phase = 'connecting';
    this.name = name;
    this.host = host;
    this.requestedPort = port;
    this.boundPort = port;
    this.selfId = randomUUID();
    this.error = null;
    this.resetPeers();
    this.publish();
    try {
      await this.connectGuest(`ws://${socketHost(host)}:${port}/`);
      this.phase = 'connected';
      this.lastSkin = JSON.stringify(this.snapshot().skin);
      this.startTick();
      return this.uiState();
    } catch (err) {
      return this.dropGuest('connect', err);
    }
  }

  private connectGuest(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { handshakeTimeout: JOIN_TIMEOUT_MS, maxPayload: MESSAGE_MAX });
      this.client = ws;
      let welcomed = false;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; ws.close(); reject(new Error('room did not answer')); }
      }, JOIN_TIMEOUT_MS);
      const fail = (err: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      ws.on('open', () => send(ws, { t: 'hello', name: this.name, ...this.snapshot() }));
      ws.on('message', (data, isBinary) => {
        if (isBinary) { ws.close(4002, 'text only'); return; }
        const msg = parseMessage(data);
        if (!msg) { ws.close(4002, 'bad message'); return; }
        if (!welcomed) {
          if (msg.t !== 'welcome' || typeof msg.id !== 'string') { fail(new Error('room rejected the connection')); ws.close(); return; }
          welcomed = true;
          settled = true;
          clearTimeout(timer);
          this.selfId = msg.id;
          this.resetPeers();
          const hostRaw = msg.host && typeof msg.host === 'object' && !Array.isArray(msg.host) ? msg.host as Record<string, unknown> : null;
          const host = readSnapshot(hostRaw);
          const hostName = cleanName(hostRaw?.name);
          const hostId = cleanText(hostRaw?.id, 64);
          const hostAction = cleanAction(hostRaw?.action);
          if (host && hostName && hostId) this.putPeer({ id: hostId, name: hostName, ...host, ...(hostAction ? { action: hostAction } : {}) });
          for (const value of Array.isArray(msg.players) ? msg.players : []) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
            const raw = value as Record<string, unknown>;
            const id = cleanText(raw.id, 64);
            const peerName = cleanName(raw.name);
            const snapshot = readSnapshot(raw);
            const action = cleanAction(raw.action);
            if (id && id !== this.selfId && peerName && snapshot) this.putPeer({ id, name: peerName, ...snapshot, ...(action ? { action } : {}) });
          }
          this.phase = 'connected';
          this.publish();
          resolve();
          return;
        }
        if (msg.t === 'player') {
          if (!msg.player || typeof msg.player !== 'object' || Array.isArray(msg.player)) return;
          const raw = msg.player as Record<string, unknown>;
          const id = cleanText(raw.id, 64);
          const peerName = cleanName(raw.name);
          const snapshot = readSnapshot(raw);
          const action = cleanAction(raw.action);
          if (id && id !== this.selfId && peerName && snapshot) this.putPeer({ id, name: peerName, ...snapshot, ...(action ? { action } : {}) });
        } else if (msg.t === 'motion' && typeof msg.id === 'string') {
          const current = this.peers.get(msg.id);
          if (!current) return;
          this.putPeer({
            ...current,
            x: clampPosition(msg.x),
            y: clampLift(msg.y),
            dragging: msg.dragging === true,
            facing: msg.facing === -1 ? -1 : 1,
          });
        } else if (msg.t === 'skin' && typeof msg.id === 'string') {
          const current = this.peers.get(msg.id);
          if (!current) return;
          this.putPeer({ ...current, skin: cleanSkin(msg.skin) });
        } else if (msg.t === 'remove' && typeof msg.id === 'string') {
          this.removePeer(msg.id);
        } else if (msg.t === 'behavior') {
          const id = typeof msg.id === 'string' ? msg.id : '';
          const behavior = cleanBehavior(msg.behavior);
          if (id && id !== this.selfId && behavior) {
            if (behavior.kind === 'state') {
              const current = this.peers.get(id);
              if (current) this.peers.set(id, { ...current, action: behavior.action });
            }
            this.opts.onBehavior(id, behavior);
          }
        }
      });
      ws.on('error', (err) => { if (!settled) fail(err); });
      ws.on('close', () => {
        if (this.client !== ws) return;
        this.client = null;
        if (!settled) fail(new Error('room closed the connection'));
        else if (this.mode === 'guest') this.dropGuest('disconnected');
      });
    });
  }

  private broadcast(message: Record<string, unknown>, except?: WebSocket): void {
    for (const ws of this.guests.keys()) if (ws !== except) send(ws, message);
  }

  private startTick(): void {
    this.stopTick();
    this.tickTimer = setInterval(() => this.tick(), ONLINE_TICK_MS);
  }

  private stopTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private tick(): void {
    if (this.mode === 'off' || this.phase !== 'connected') return;
    const player = this.mode === 'host' ? this.hostPlayer() : this.localPlayer();
    const motion = { t: 'motion', id: player.id, x: player.x, y: player.y, dragging: player.dragging, facing: player.facing };
    if (this.mode === 'host') this.broadcast(motion);
    else send(this.client, motion);
    const skin = JSON.stringify(player.skin);
    if (skin !== this.lastSkin) {
      this.lastSkin = skin;
      const frame = { t: 'skin', id: player.id, skin: player.skin };
      if (this.mode === 'host') this.broadcast(frame);
      else send(this.client, frame);
    }
  }

  sendBehavior(behaviorValue: unknown): void {
    if (this.mode === 'off' || this.phase !== 'connected') return;
    const behavior = cleanBehavior(behaviorValue);
    if (!behavior) return;
    if (behavior.kind === 'state') this.hostAction = behavior.action;
    else if (behavior.kind === 'interrupt') this.hostAction = 'idle';
    if (this.mode === 'host') this.broadcast({ t: 'behavior', id: this.hostId, behavior });
    else send(this.client, { t: 'behavior', behavior });
  }

  private dropGuest(code: OnlineErrorCode, detail: unknown = null): OnlineUiState {
    const ws = this.client;
    this.client = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    this.stopTick();
    this.mode = 'off';
    this.phase = 'error';
    this.boundPort = 0;
    this.hostAction = '';
    this.resetPeers();
    this.error = { code, detail: detail instanceof Error ? detail.message : detail ? String(detail) : null };
    this.publish();
    return this.uiState();
  }

  async leave(): Promise<OnlineUiState> {
    if (this.mode === 'host') await this.closeHost();
    else if (this.mode === 'guest') {
      const ws = this.client;
      this.client = null;
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close(1000, 'leave');
    }
    this.stopTick();
    this.mode = 'off';
    this.phase = 'idle';
    this.boundPort = 0;
    this.hostAction = '';
    this.error = null;
    this.resetPeers();
    this.publish();
    return this.uiState();
  }

  private async closeHost(): Promise<void> {
    const wss = this.wss;
    const server = this.hostServer;
    this.wss = null;
    this.hostServer = null;
    for (const ws of this.guests.keys()) ws.close(1001, 'room closed');
    this.guests.clear();
    if (wss) await new Promise<void>((resolve) => { wss.close(() => resolve()); });
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
  }

  async stop(): Promise<void> {
    const mode = this.mode;
    this.stopTick();
    this.mode = 'off';
    this.phase = 'idle';
    if (mode === 'host') await this.closeHost();
    const ws = this.client;
    this.client = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close(1001, 'stopped');
    this.resetPeers();
    this.boundPort = 0;
    this.hostAction = '';
    this.error = null;
    this.publish();
  }
}
