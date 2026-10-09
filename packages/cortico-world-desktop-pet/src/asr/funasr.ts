/**
 * FunASR's SenseVoiceSmall (int8) run in this process through sherpa-onnx's Node addon
 * (`sherpa-onnx-node`, N-API, one prebuilt package per platform: Windows x64, macOS arm64 and x64).
 * The model files come from the runtime store (`src/runtime/store.ts`); nothing else is downloaded.
 *
 * SenseVoice recognizes a whole utterance at a time. While a sentence is being spoken the audio
 * so far is decoded again every PARTIAL_EVERY_MS, one decode at a time, so the pet shows what it
 * hears before the sentence ends; the decode after the sentence ends is the result. A 3 s sentence
 * decodes in about 0.1 s on two threads, so the repeated decodes stay well inside real time.
 *
 * Under Electron's Node the addon refuses external buffers; only Float32Array samples go in and
 * JSON comes back, which does not touch them.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import type { Logger } from 'cortico/core/types.ts';
import type { TranscribeResult } from './result.ts';
import type { SystemSentence } from './system-recognizer.ts';
import { petText, type PetText } from '../i18n/index.ts';

export type FunAsrPhase = 'stopped' | 'starting' | 'running' | 'error';

export interface FunAsrState {
  phase: FunAsrPhase;
  /** What the panel shows where a server shows its address: the model in use. */
  url: string;
  pid: null;
  detail: string | null;
}

/** The part of sherpa-onnx-node used here; tests pass a fake. */
export interface SherpaModule {
  OfflineRecognizer: {
    createAsync(config: Record<string, unknown>): Promise<SherpaRecognizer>;
  };
}
export interface SherpaRecognizer {
  createStream(): { acceptWaveform(w: { sampleRate: number; samples: Float32Array }): void };
  decodeAsync(stream: unknown): Promise<{ text?: string }>;
}

export interface FunAsrOptions {
  /** The model files, or why they are not there. */
  model: () => { model: string; tokens: string } | { missing: string };
  /** ISO 639-1 or 'auto'; SenseVoice takes zh, en, ja, ko, yue or auto. */
  language: () => string;
  /** CPU threads for one decode; 0 picks two. */
  threads: () => number;
  log: Logger;
  load?: () => SherpaModule;
  /** The text table of the app language, for why recognition is not ready; Chinese when absent. */
  text?: () => PetText;
}

const SAMPLE_RATE = 16_000;
/** How often the sentence being spoken is decoded again for the bubble. */
const PARTIAL_EVERY_MS = 500;
/** Languages SenseVoice names; anything else is left to its own detection. */
const LANGUAGES = new Set(['zh', 'en', 'ja', 'ko', 'yue']);
const DEFAULT_THREADS = 2;

export function loadSherpa(): SherpaModule {
  return createRequire(import.meta.url)('sherpa-onnx-node') as SherpaModule;
}

const toFloat = (pcm: Int16Array): Float32Array => {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
};

export class FunAsrRecognizer {
  private rec: SherpaRecognizer | null = null;
  private phase: FunAsrPhase = 'stopped';
  private detail: string | null = null;
  private loaded = '';
  private starting: Promise<void> | null = null;

  constructor(private readonly opts: FunAsrOptions) {}

  private get t(): PetText['funasr'] {
    return (this.opts.text?.() ?? petText()).funasr;
  }

  state(): FunAsrState {
    return { phase: this.phase, url: 'SenseVoiceSmall (FunASR)', pid: null, detail: this.detail };
  }

  /** The language or thread count changed since the model was loaded. */
  get configChanged(): boolean {
    return this.phase === 'running' && this.loaded !== this.signature();
  }

  private signature(): string {
    return `${this.language()}/${this.threads()}`;
  }

  private language(): string {
    const l = this.opts.language();
    return LANGUAGES.has(l) ? l : 'auto';
  }

  private threads(): number {
    return this.opts.threads() > 0 ? this.opts.threads() : DEFAULT_THREADS;
  }

  start(): Promise<void> {
    this.starting ??= this.doStart().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async doStart(): Promise<void> {
    if (this.phase === 'running' && !this.configChanged) return;
    const files = this.opts.model();
    // no model yet is not a failure: voice input waits for the download
    if ('missing' in files) { this.rec = null; this.phase = 'stopped'; this.detail = files.missing; return; }
    if (!existsSync(files.model) || !existsSync(files.tokens)) { this.phase = 'error'; this.detail = this.t.incomplete; return; }
    this.phase = 'starting';
    this.detail = null;
    const started = Date.now();
    try {
      const sherpa = (this.opts.load ?? loadSherpa)();
      this.rec = await sherpa.OfflineRecognizer.createAsync({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: {
          senseVoice: { model: files.model, language: this.language(), useInverseTextNormalization: 1 },
          tokens: files.tokens,
          numThreads: this.threads(),
          provider: 'cpu',
          debug: 0,
        },
      });
      this.loaded = this.signature();
      this.phase = 'running';
      this.opts.log.info(`FunASR 模型已载入(${Date.now() - started} ms)`);
    } catch (err) {
      this.rec = null;
      this.phase = 'error';
      const msg = (err as Error).message;
      this.detail = /Cannot find module|MODULE_NOT_FOUND/.test(msg) ? this.t.noRuntime(`${process.platform}-${process.arch}`) : this.t.loadFailed(msg);
    }
  }

  async stop(): Promise<void> {
    await this.starting;
    this.rec = null;
    if (this.phase !== 'error') this.phase = 'stopped';
  }

  /** One finished utterance to text. */
  async transcribe(pcm: Int16Array): Promise<TranscribeResult> {
    const started = Date.now();
    if (!this.rec) return { text: '', ms: 0, error: this.detail ?? this.t.notLoaded };
    return { ...(await this.decode(pcm)), ms: Date.now() - started };
  }

  private async decode(pcm: Int16Array): Promise<TranscribeResult> {
    const rec = this.rec;
    if (!rec) return { text: '', ms: 0, error: this.detail ?? this.t.notLoaded };
    try {
      const stream = rec.createStream();
      stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: toFloat(pcm) });
      const r = await rec.decodeAsync(stream);
      return { text: (r.text ?? '').trim(), ms: 0, error: null };
    } catch (err) {
      return { text: '', ms: 0, error: (err as Error).message };
    }
  }

  /**
   * A sentence being spoken: frames go in as they arrive, `onPartial` gets what has been heard so
   * far, `end` gives the whole sentence. Null while the model is not loaded.
   */
  sentence(onPartial: (text: string) => void): SystemSentence | null {
    if (!this.rec) return null;
    const frames: Int16Array[] = [];
    let samples = 0, decodedAt = 0, busy = false, ended = false, endedAt = 0;
    const joined = () => {
      const all = new Int16Array(samples);
      let at = 0;
      for (const f of frames) { all.set(f, at); at += f.length; }
      return all;
    };
    const partial = () => {
      if (busy || ended || (samples - decodedAt) * 1000 / SAMPLE_RATE < PARTIAL_EVERY_MS) return;
      busy = true;
      decodedAt = samples;
      void this.decode(joined()).then((r) => { busy = false; if (!ended && !r.error && r.text) onPartial(r.text); });
    };
    return {
      write: (frame) => { if (ended) return; frames.push(frame); samples += frame.length; partial(); },
      end: async () => {
        ended = true;
        endedAt = Date.now();
        const r = await this.decode(joined());
        return { ...r, ms: Date.now() - endedAt };
      },
    };
  }
}
