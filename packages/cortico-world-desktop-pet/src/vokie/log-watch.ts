/**
 * Vokie's remote-control edge log, read from Vokie's own log file.
 *
 * Vokie writes one line for every physical edge of the remote it drives, under the
 * `google-tv-remote-helper` label:
 *
 * ```text
 * [2026-10-22 18:12:16.919] [info]  google-tv-remote-helper { type: 'button', button: 'siri', event: 'down', sessionId: 9 }
 * ```
 *
 * `siri` is the voice key, `select` the OK key, `back` the back key. Vokie's log is the one
 * place a second program can see these edges: the remote's HID reports are claimed by Vokie's
 * helper, and Vokie publishes no event or hook of its own. The file is read, never written,
 * and only lines after the read started are considered, so old presses do not replay.
 *
 * File is `%APPDATA%\vokie\logs\app.log` on Windows. Vokie rotates it at about one megabyte;
 * a shorter file than the last read is a rotated file and is read from its start.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import type { Logger } from 'cortico/core/types.ts';
import { remoteButtonFor, type RemoteEdge } from './gesture.ts';

/** The consumer-control usage page: every button of the remote is on it. */
const CONSUMER_PAGE = 0x0c;
/** `siri`, the voice key, is AC Search; `select` is Menu Pick; `back` is AC Back. */
const USAGE: Readonly<Record<string, number>> = { siri: 0x221, select: 0x41, back: 0x224 };

/** One `google-tv-remote-helper { type: 'button', … }` line, with the log's own timestamp. */
const EDGE_LINE = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})\] .*google-tv-remote-helper \{ type: 'button', button: '([a-z]+)', event: '(down|up)'/;

/** Vokie's log, beside its settings. */
export function vokieLogFile(): string | null {
  if (process.platform !== 'win32' || !process.env.APPDATA) return null;
  return `${process.env.APPDATA}\\vokie\\logs\\app.log`;
}

export type LogWatchPhase = 'stopped' | 'waiting' | 'running';

export interface VokieLogWatchState {
  phase: LogWatchPhase;
  /** The file being read. */
  file: string;
  /** Why the file cannot be read yet, or null. */
  detail: string | null;
}

export interface VokieLogWatchOptions {
  /** Vokie's `app.log`; null where the platform keeps none there. */
  file: () => string | null;
  /** How often the file is polled for new lines. */
  pollMs: number;
  onEdge: (edge: RemoteEdge) => void;
  log?: Logger;
  /** Tests read a file they control instead of one growing under them. */
  read?: (file: string, offset: number) => { text: string; size: number } | null;
}

/** `[YYYY-MM-DD HH:MM:SS.mmm]` in the machine's own time zone, as epoch milliseconds. */
function logTime(y: string, mo: string, d: string, h: string, mi: string, s: string, ms: string): number {
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms)).getTime();
}

/**
 * One line of the log as an edge, or null for a line that names a button this bridge does not
 * use. Exported for tests: the parsing is the contract with Vokie's log format.
 */
export function parseEdgeLine(line: string): RemoteEdge | null {
  const m = EDGE_LINE.exec(line);
  if (!m) return null;
  const usage = USAGE[m[8]!];
  if (usage === undefined) return null;
  return { button: remoteButtonFor(CONSUMER_PAGE, usage), page: CONSUMER_PAGE, usage, down: m[9] === 'down', ts: logTime(m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7]!) };
}

/** Reads the bytes appended after `offset`; null when the file is gone. */
function readTail(file: string, offset: number): { text: string; size: number } | null {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return null;
  }
  if (size <= offset) return { text: '', size };
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(size - offset);
    const read = readSync(fd, buffer, 0, buffer.length, offset);
    return { text: buffer.subarray(0, read).toString('utf8'), size: offset + read };
  } finally {
    closeSync(fd);
  }
}

export class VokieLogWatch {
  private phase: LogWatchPhase = 'stopped';
  private timer: NodeJS.Timeout | null = null;
  private offset = 0;
  private carry = '';
  private detail: string | null = null;
  private readonly read: (file: string, offset: number) => { text: string; size: number } | null;

  constructor(private readonly opts: VokieLogWatchOptions) {
    this.read = opts.read ?? readTail;
  }

  state(): VokieLogWatchState {
    return { phase: this.phase, file: this.opts.file() ?? '', detail: this.detail };
  }

  /** Starts polling from the end of the file: only presses from now on are reported. */
  start(): void {
    if (this.timer) return;
    const file = this.opts.file();
    if (!file) {
      this.phase = 'waiting';
      this.detail = 'no-log-file';
      return;
    }
    const tail = this.read(file, 0);
    this.offset = tail?.size ?? 0;
    this.carry = '';
    this.phase = 'waiting';
    this.detail = tail ? null : 'missing';
    this.timer = setInterval(() => this.poll(), this.opts.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.phase = 'stopped';
  }

  private poll(): void {
    const file = this.opts.file();
    if (!file) return;
    const tail = this.read(file, this.offset);
    if (!tail) {
      if (this.phase !== 'waiting') {
        this.phase = 'waiting';
        this.detail = 'missing';
      }
      this.offset = 0;
      return;
    }
    if (this.phase === 'waiting') {
      this.phase = 'running';
      this.detail = null;
    }
    // a rotated file is shorter than what was already read: start over instead of skipping edges
    if (tail.size < this.offset) {
      this.offset = 0;
      this.carry = '';
      return;
    }
    this.offset = tail.size;
    if (!tail.text) return;
    const lines = (this.carry + tail.text).split('\n');
    this.carry = lines.pop() ?? '';
    for (const line of lines) {
      const edge = parseEdgeLine(line);
      if (edge) this.opts.onEdge(edge);
      else if (line.includes('google-tv-remote-helper')) this.opts.log?.debug(`遥控器日志行没能解析:${line}`);
    }
  }
}
