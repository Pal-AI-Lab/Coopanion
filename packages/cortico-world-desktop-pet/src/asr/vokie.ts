/**
 * Vokie's speech recognition: the service Vokie runs on this computer
 * (`POST http://127.0.0.1:<port>/v1/asr/offline2pass`), which takes the path of a whole 16 kHz
 * mono WAV and answers with its text. Nothing runs in this process and nothing is downloaded;
 * voice input needs Vokie running with its external ASR API turned on.
 *
 * The port is `asr.vokiePort` when set, else Vokie's own settings (`externalAsrApi`), else 27678.
 * Each sentence is written to a temporary WAV, sent, and the file deleted whatever comes back.
 * Vokie recognizes finished sentences only, so the bubble shows nothing while the sentence is spoken.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Language } from 'cortico/core/language.ts';
import type { Logger } from 'cortico/core/types.ts';
import type { TranscribeResult } from './result.ts';
import type { SystemSentence } from './system-recognizer.ts';
import { petText, type PetText } from '../i18n/index.ts';

export type VokiePhase = 'stopped' | 'starting' | 'running' | 'error';

export interface VokieRecognizerState {
  phase: VokiePhase;
  /** What the panel shows as the engine's address. */
  url: string;
  /** The service is not a process this World owns. */
  pid: null;
  detail: string | null;
}

export interface VokieRecognizerOptions {
  /** `asr.vokiePort`: 0 reads the port from Vokie's settings. */
  port: () => number;
  /** `asr.language`: empty or `auto` follows the app language. */
  language: () => string;
  /** The app language, for `locale` when no recognition language is set; Chinese when absent. */
  appLanguage?: () => Language;
  /** How long one sentence may take: `asr.timeoutMs`. */
  timeoutMs: () => number;
  log: Logger;
  /** Vokie's settings file; null where this platform keeps none there. */
  settingsFile?: () => string | null;
  /** The text table of the app language, for the state and errors; Chinese when absent. */
  text?: () => PetText;
}

/** Vokie's settings, as its `externalAsrApi` records them. */
export interface VokieService {
  port: number;
  /** Whether Vokie's settings have its external ASR API switched on. */
  enabled: boolean;
}

const SAMPLE_RATE = 16_000;
/** Vokie's port while its settings say nothing else. */
const DEFAULT_PORT = 27_678;
/** A service on this computer answers at once or not at all; the recognition timeout is for sentences. */
const HEALTH_TIMEOUT_MS = 5_000;

/** Where Vokie keeps its settings on this platform, when it keeps them where this reads. */
export function vokieSettingsFile(): string | null {
  const appData = process.env.APPDATA;
  return process.platform === 'win32' && appData ? join(appData, 'vokie', 'app-settings.json') : null;
}

/** `externalAsrApi` of a Vokie settings file; its defaults for a file that is missing or unreadable. */
export function readVokieService(file: string | null): VokieService {
  const fallback: VokieService = { port: DEFAULT_PORT, enabled: true };
  if (!file) return fallback;
  let settings: unknown;
  try { settings = JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
  const api = (settings as { externalAsrApi?: { port?: unknown; enabled?: unknown } } | null)?.externalAsrApi;
  if (!api || typeof api !== 'object') return fallback;
  const port = typeof api.port === 'number' && Number.isInteger(api.port) && api.port > 0 && api.port < 65_536 ? api.port : DEFAULT_PORT;
  return { port, enabled: typeof api.enabled === 'boolean' ? api.enabled : true };
}

/** 16 kHz mono 16-bit PCM with a RIFF/WAVE header, as Vokie's service reads it. */
function wavFile(pcm: Int16Array): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SAMPLE_RATE, 24);
  head.writeUInt32LE(SAMPLE_RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** What Vokie's reply says when it is not the text. */
function failureText(reply: { error?: { code?: unknown; message?: unknown } } | null, status: number): string {
  const code = typeof reply?.error?.code === 'string' ? reply.error.code : '';
  const message = typeof reply?.error?.message === 'string' ? reply.error.message : '';
  if (code && message) return `${code}: ${message}`;
  return code || `HTTP ${status}`;
}

/** A request in flight, so `stop()` can cancel it while its timeout runs. */
interface Inflight {
  stop(): void;
}

type CallResult = { ok: true; body: string; status: number } | { ok: false; why: 'timeout' | 'stopped' | 'network'; error: string };

export class VokieRecognizer {
  private phase: VokiePhase = 'stopped';
  private detail: string | null = null;
  private starting: Promise<void> | null = null;
  private inflight: Inflight | null = null;
  /** Written to before the request, deleted after it, and by `stop()` if that never came. */
  private readonly temps = new Set<string>();

  constructor(private readonly opts: VokieRecognizerOptions) {}

  private get t(): PetText['vokie'] {
    return (this.opts.text?.() ?? petText()).vokie;
  }

  state(): VokieRecognizerState {
    return { phase: this.phase, url: `http://127.0.0.1:${this.service().port}`, pid: null, detail: this.detail };
  }

  /** The port and switch in force: `asr.vokiePort`, else Vokie's settings. */
  private service(): VokieService {
    const settings = readVokieService((this.opts.settingsFile ?? vokieSettingsFile)());
    return { port: this.opts.port() || settings.port, enabled: settings.enabled };
  }

  start(): Promise<void> {
    this.starting ??= this.doStart().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async doStart(): Promise<void> {
    if (this.phase === 'running') return;
    const service = this.service();
    if (!service.enabled) {
      this.phase = 'error';
      this.detail = this.t.apiOff;
      return;
    }
    this.phase = 'starting';
    this.detail = null;
    const call = await this.call(`http://127.0.0.1:${service.port}`, '/v1/asr/health', {}, HEALTH_TIMEOUT_MS);
    if (call.ok && call.status < 400 && this.healthy(call.body)) {
      this.phase = 'running';
      this.opts.log.info(`Vokie 璇嗗埆鏈嶅姟宸插氨缁?http://127.0.0.1:${service.port}`);
      return;
    }
    // a stopped one stays stopped: `stop()` already said so
    if (!call.ok && call.why === 'stopped') return;
    this.phase = 'error';
    this.detail = this.t.notRunning;
  }

  /** Whether a health reply is Vokie's own. */
  private healthy(body: string): boolean {
    try { return (JSON.parse(body) as { ok?: unknown } | null)?.ok === true; } catch { return false; }
  }

  /** One finished sentence to text: a temporary WAV in, Vokie's answer out, the file gone either way. */
  async transcribe(pcm: Int16Array): Promise<TranscribeResult> {
    const started = Date.now();
    if (this.phase !== 'running') await this.start();
    if (this.phase !== 'running') return { text: '', ms: Date.now() - started, error: this.detail ?? this.t.notRunning };
    const timeoutMs = this.opts.timeoutMs();
    const file = join(tmpdir(), `pet-vokie-${randomUUID()}.wav`);
    this.temps.add(file);
    try {
      writeFileSync(file, wavFile(pcm));
      const body = JSON.stringify({ inputPath: file, locale: this.locale(), includeSegments: false, includeMergedText: true });
      const call = await this.call(`http://127.0.0.1:${this.service().port}`, '/v1/asr/offline2pass', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }, timeoutMs);
      const ms = Date.now() - started;
      if (!call.ok) return { text: '', ms, error: this.callError(call, timeoutMs) };
      if (!call.body.trim()) return { text: '', ms, error: this.t.emptyReply };
      let reply: { ok?: unknown; text?: unknown; error?: { code?: unknown; message?: unknown } } | null;
      try { reply = JSON.parse(call.body) as typeof reply; } catch { return { text: '', ms, error: this.t.badReply }; }
      if (reply?.ok !== true || call.status >= 400) return { text: '', ms, error: this.t.failed(failureText(reply, call.status)) };
      return { text: typeof reply.text === 'string' ? reply.text.trim() : '', ms, error: null };
    } catch (err) {
      return { text: '', ms: Date.now() - started, error: this.t.failed((err as Error).message) };
    } finally {
      this.drop(file);
    }
  }

  /** Vokie recognizes a finished sentence only, so voice input shows nothing while it is spoken. */
  sentence(_onPartial: (text: string) => void): SystemSentence | null {
    return null;
  }

  /** The language Vokie is given: `asr.language`, else the app language's ISO 639-1 code. */
  private locale(): string {
    const setting = this.opts.language();
    if (setting && setting !== 'auto') return setting;
    return (this.opts.appLanguage?.() ?? 'zh').split('-')[0]!;
  }

  private callError(call: { why: 'timeout' | 'stopped' | 'network'; error: string }, timeoutMs: number): string {
    if (call.why === 'timeout') return this.t.timeout(timeoutMs);
    if (call.why === 'stopped') return this.t.stopped;
    return this.t.failed(call.error);
  }

  private async call(base: string, path: string, init: RequestInit, timeoutMs: number): Promise<CallResult> {
    const ctrl = new AbortController();
    let aborted: 'timeout' | 'stopped' | null = null;
    const timer = setTimeout(() => { aborted = 'timeout'; ctrl.abort(); }, timeoutMs);
    this.inflight = { stop: () => { aborted = 'stopped'; ctrl.abort(); } };
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: ctrl.signal });
      return { ok: true, body: await res.text(), status: res.status };
    } catch (err) {
      return { ok: false, why: aborted ?? 'network', error: (err as Error).message };
    } finally {
      clearTimeout(timer);
      this.inflight = null;
    }
  }

  /** Cancels the request in flight and removes the temporary WAVs it still had. */
  async stop(): Promise<void> {
    this.inflight?.stop();
    this.inflight = null;
    if (this.phase !== 'error') this.phase = 'stopped';
    for (const file of this.temps) this.drop(file);
  }

  /** A temporary WAV's use is over; on Windows a scanner may still hold it for a moment. */
  private drop(file: string): void {
    this.temps.delete(file);
    try { rmSync(file, { force: true }); } catch (err) { this.opts.log.debug(`涓存椂 WAV 鍒犱笉鎺?${(err as Error).message}`); }
  }
}
