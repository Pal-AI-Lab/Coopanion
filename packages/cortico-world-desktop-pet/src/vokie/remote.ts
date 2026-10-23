/**
 * The Google TV remote's voice key, read by `remote-input.ps1` in one long-lived
 * PowerShell process. The script registers a Raw Input sink for the remote's HID
 * collections and prints one JSON line per pressed or released usage; this class starts
 * it, forwards the edges, and restarts it when it exits.
 *
 * Errors never reach the caller as prose: `detail` is a stable code (`spawn-failed`,
 * `helper-exited`, `restart-exhausted`, or one the helper printed such as `no-device`)
 * that the panel maps to its text.
 *
 * The script goes in through `-EncodedCommand`, so neither the execution policy nor the
 * console code page touches it; the device to listen to goes in through the environment.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'cortico/core/types.ts';
import { remoteButtonFor, type RemoteEdge } from './gesture.ts';

export type VokieRemotePhase = 'stopped' | 'starting' | 'running' | 'error';

export interface VokieRemoteState {
  phase: VokieRemotePhase;
  /** Null, or an error code the panel maps to its text. */
  detail: string | null;
  /** False where the helper cannot run; `start()` is a no-op there. */
  supported: boolean;
}

export interface VokieRemoteOptions {
  /** Every pressed and released usage the helper decodes. */
  onEdge: (edge: RemoteEdge) => void;
  log: Logger;
  /** The HID device to listen to; the Google TV remote when absent. */
  vendorId?: number;
  productId?: number;
  /** Starts the helper; tests pass a fake. */
  spawnImpl?: typeof spawn;
  /** The clock for a key line that arrives without `ts`. */
  now?: () => number;
}

/** The Google TV remote's HID identity. */
export const DEFAULT_REMOTE_VENDOR_ID = 0x18d1;
export const DEFAULT_REMOTE_PRODUCT_ID = 0x9450;
/** How many times an exited helper is started again before the error stays. */
export const MAX_REMOTE_RESTARTS = 5;
/** The first restart delay; it doubles up to RESTART_MAX_MS. */
export const RESTART_BASE_MS = 1_000;
export const RESTART_MAX_MS = 30_000;

/** Available at all: Windows only. */
export const vokieRemoteSupported = (): boolean => process.platform === 'win32';

const SCRIPT_FILE = fileURLToPath(new URL('./remote-input.ps1', import.meta.url));
/** How long a killed helper gets to exit before the wrapper leaves it. */
const STOP_TIMEOUT_MS = 1_500;

function powershellExe(): string {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export class VokieRemote {
  private child: ChildProcess | null = null;
  private phase: VokieRemotePhase = 'stopped';
  private detail: string | null = null;
  private restarts = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private starting: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly opts: VokieRemoteOptions) {}

  state(): VokieRemoteState {
    return { phase: this.phase, detail: this.detail, supported: vokieRemoteSupported() };
  }

  start(): Promise<void> {
    if (!vokieRemoteSupported()) return Promise.resolve();
    this.starting ??= this.doStart().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async doStart(): Promise<void> {
    if (this.child) return;
    this.stopping = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.phase = 'starting';
    this.detail = null;
    const encoded = Buffer.from(readFileSync(SCRIPT_FILE, 'utf8'), 'utf16le').toString('base64');
    const vendorId = this.opts.vendorId ?? DEFAULT_REMOTE_VENDOR_ID;
    const productId = this.opts.productId ?? DEFAULT_REMOTE_PRODUCT_ID;
    let child: ChildProcess;
    try {
      child = (this.opts.spawnImpl ?? spawn)(powershellExe(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PET_REMOTE_VENDOR_ID: String(vendorId), PET_REMOTE_PRODUCT_ID: String(productId) },
      });
    } catch (err) {
      this.phase = 'error';
      this.detail = 'spawn-failed';
      this.opts.log.child('vokie-remote').error(`helper start failed: ${(err as Error).message}`);
      return;
    }
    this.child = child;
    const log = this.opts.log.child('vokie-remote');
    child.stderr?.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) if (line.trim()) log.debug(line); });
    // a helper that died mid-write must not take the World down with an EPIPE
    child.stdin?.on('error', (err) => log.debug(`stdin: ${err.message}`));
    createInterface({ input: child.stdout! }).on('line', (line) => this.answer(line, log));
    child.on('error', (err) => {
      if (this.child !== child) return;
      this.detail = 'spawn-failed';
      log.error(`helper error: ${err.message}`);
      this.gone(child, log);
    });
    child.on('exit', (code) => {
      if (this.child !== child) return;
      log.warn(`helper exited: ${code}`);
      this.gone(child, log);
    });
  }

  private answer(line: string, log: Logger): void {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(line) as Record<string, unknown>; } catch { log.debug(line); return; }
    if (msg.t === 'hello') {
      this.phase = 'running';
      this.detail = null;
      this.restarts = 0;
      log.info(`remote ready: ${String(msg.vid)}:${String(msg.pid)}`);
      return;
    }
    if (msg.t === 'key') {
      const page = msg.page;
      const usage = msg.usage;
      const down = msg.down;
      if (typeof page !== 'number' || typeof usage !== 'number' || typeof down !== 'boolean') { log.debug(line); return; }
      const ts = typeof msg.ts === 'number' ? msg.ts : (this.opts.now?.() ?? Date.now());
      this.opts.onEdge({ button: remoteButtonFor(page, usage), page, usage, down, ts });
      return;
    }
    if (msg.t === 'error') {
      const code = typeof msg.code === 'string' ? msg.code : 'helper-error';
      this.detail = code;
      if (this.phase !== 'running') this.phase = 'error';
      log.warn(`remote helper: ${code}`);
      return;
    }
    log.debug(line);
  }

  private gone(child: ChildProcess, log: Logger): void {
    if (this.child !== child) return;
    this.child = null;
    if (this.stopping || this.phase === 'stopped') return;
    this.phase = 'error';
    this.detail ??= 'helper-exited';
    if (this.restarts >= MAX_REMOTE_RESTARTS) {
      this.detail = 'restart-exhausted';
      log.error(`remote helper exited ${MAX_REMOTE_RESTARTS} times; giving up`);
      return;
    }
    const delay = Math.min(RESTART_BASE_MS * 2 ** this.restarts, RESTART_MAX_MS);
    this.restarts++;
    log.info(`restarting remote helper in ${delay} ms`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start();
    }, delay);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    this.phase = 'stopped';
    this.detail = null;
    this.restarts = 0;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    const timer = new Promise<void>((resolve) => { setTimeout(resolve, STOP_TIMEOUT_MS); });
    await Promise.race([exited, timer]);
  }
}
