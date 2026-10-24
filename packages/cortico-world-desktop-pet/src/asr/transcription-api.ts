/**
 * An OpenAI-compatible transcription service (engine `api`): each finished sentence goes out as a
 * 16 kHz mono 16-bit WAV file in one `POST {baseUrl}/audio/transcriptions` (multipart: `file`,
 * `model`, `language` when the recognition language is a two-letter code, `response_format=json`),
 * and the reply's `text` is the result. Requests go through the global `fetch`, so the system proxy
 * Core sets up applies.
 *
 * A remote address takes https only (`plainRemote`, the provider's rule). A failed request (an HTTP
 * error, no answer within the timeout, no connection) puts the engine in `error` with the reason;
 * nothing more is sent until it is started again, which a change of address or model, or an API Key
 * saved from the voice panel, also does.
 */
import type { Logger } from 'cortico/core/types.ts';
import { plainRemote } from 'cortico-provider-coo/src/address.ts';
import type { TranscribeResult } from './result.ts';
import type { SystemSentence } from './system-recognizer.ts';
import { petText, type PetText } from '../i18n/index.ts';

export type TranscriptionPhase = 'stopped' | 'running' | 'error';

export interface TranscriptionState {
  phase: TranscriptionPhase;
  /** What the panel shows as the engine's address: the URL requests go to. */
  url: string;
  pid: null;
  detail: string | null;
}

export interface TranscriptionApiOptions {
  /** The address and model as configured now (`asr.api`). */
  config: () => { baseUrl: string; model: string };
  /** The API Key; empty sends no Authorization header. */
  key: () => string;
  /** ISO 639-1 or 'auto'. */
  language: () => string;
  timeoutMs: () => number;
  log: Logger;
  /** The text table of the app language; Chinese when absent. */
  text?: () => PetText;
}

const SAMPLE_RATE = 16_000;
/** The longest part of an error body shown when it is not `{ error: { message } }`. */
const BODY_MAX = 300;

/** 16-bit mono PCM at 16 kHz as a WAV file. */
export function wavFile(pcm: Int16Array): Uint8Array<ArrayBuffer> {
  const bytes = pcm.length * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // channels
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true); // bytes a second
  v.setUint16(32, 2, true); // bytes a frame
  v.setUint16(34, 16, true); // bits a sample
  ascii(36, 'data');
  v.setUint32(40, bytes, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i]!, true);
  return new Uint8Array(v.buffer);
}

const endpointOf = (baseUrl: string) => `${baseUrl.trim().replace(/\/+$/, '')}/audio/transcriptions`;

export class TranscriptionApi {
  private phase: TranscriptionPhase = 'stopped';
  private detail: string | null = null;
  /** Address and model the engine was last started with. */
  private started = '';
  /** Counts starts and stops; a request begun before one does not change the state when it lands. */
  private generation = 0;

  constructor(private readonly opts: TranscriptionApiOptions) {}

  private get t(): PetText['transcription'] {
    return (this.opts.text?.() ?? petText()).transcription;
  }

  state(): TranscriptionState {
    const { baseUrl } = this.opts.config();
    return { phase: this.phase, url: baseUrl.trim() ? endpointOf(baseUrl) : '', pid: null, detail: this.detail };
  }

  /** The address or model changed since the engine was started. Polled with the config, so the key, whose read can open `.env`, is not compared. */
  get configChanged(): boolean {
    return this.started !== this.signature();
  }

  private signature(): string {
    const { baseUrl, model } = this.opts.config();
    return JSON.stringify([baseUrl, model]);
  }

  /** Takes the configured address and model, or says why they cannot be used; nothing is sent. */
  async start(): Promise<void> {
    this.generation++;
    this.started = this.signature();
    const { baseUrl, model } = this.opts.config();
    const why = this.problem(baseUrl.trim(), model.trim());
    this.phase = why ? 'error' : 'running';
    this.detail = why;
  }

  private problem(baseUrl: string, model: string): string | null {
    if (!baseUrl) return this.t.noUrl;
    let url: URL;
    try { url = new URL(baseUrl); } catch { return this.t.badUrl(baseUrl); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return this.t.badUrl(baseUrl);
    if (plainRemote(baseUrl)) return this.t.httpRemote;
    return model ? null : this.t.noModel;
  }

  async stop(): Promise<void> {
    this.generation++;
    this.phase = 'stopped';
    this.detail = null;
  }

  /** The service hears only finished sentences. */
  sentence(): SystemSentence | null {
    return null;
  }

  /** One finished sentence to text. */
  async transcribe(pcm: Int16Array): Promise<TranscribeResult> {
    const started = Date.now();
    if (this.phase !== 'running') return { text: '', ms: 0, error: this.detail ?? this.t.notRunning };
    const generation = this.generation;
    const { baseUrl, model } = this.opts.config();
    const language = this.opts.language();
    const form = new FormData();
    form.append('file', new Blob([wavFile(pcm)], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', model.trim());
    if (/^[a-z]{2}$/.test(language)) form.append('language', language);
    form.append('response_format', 'json');
    const key = this.opts.key();
    const timeoutMs = this.opts.timeoutMs();
    let error: string;
    try {
      const res = await fetch(endpointOf(baseUrl), {
        method: 'POST',
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.text();
      const json = parseJson(body);
      if (res.ok) {
        const text = (json as { text?: unknown } | null)?.text;
        if (typeof text === 'string') return { text: text.trim(), ms: Date.now() - started, error: null };
        error = this.t.noText;
      } else {
        const message = (json as { error?: { message?: unknown } } | null)?.error?.message;
        error = this.t.status(res.status, typeof message === 'string' ? message : body.trim().slice(0, BODY_MAX));
      }
    } catch (err) {
      const e = err as Error & { cause?: { message?: string } };
      error = e.name === 'TimeoutError' ? this.t.timeout(timeoutMs) : this.t.network(e.cause?.message ?? e.message);
    }
    this.opts.log.warn(`转写接口请求失败:${error}`);
    if (generation === this.generation) {
      this.phase = 'error';
      this.detail = error;
    }
    return { text: '', ms: Date.now() - started, error };
  }
}

function parseJson(body: string): unknown {
  try { return JSON.parse(body); } catch { return null; }
}
