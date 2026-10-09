/**
 * Speech models run in this process through sherpa-onnx's Node addon (`sherpa-onnx-node`, N-API,
 * one prebuilt package per platform: Windows x64, macOS arm64 and x64, Linux x64 and arm64 with
 * glibc 2.32 or later). Which model and how it is configured is a `SherpaModelKind`: FunASR's
 * SenseVoiceSmall or OpenAI's Whisper. The model files come from the runtime store
 * (`src/runtime/store.ts`); nothing else is downloaded.
 *
 * The models recognize a whole utterance at a time. While a sentence is being spoken the audio so
 * far is decoded again every `partialEveryMs` of the kind, one decode at a time, so the pet shows
 * what it hears before the sentence ends; the decode after the sentence ends is the result. A kind
 * whose `partialEveryMs` is 0 decodes only the finished sentence.
 *
 * Under Electron's Node the addon refuses external buffers; only Float32Array samples go in and
 * JSON comes back, which does not touch them.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import type { Logger } from 'cortico/core/types.ts';
import type { TranscribeResult } from './result.ts';
import { rmsDb } from './segmenter.ts';
import type { SystemSentence } from './system-recognizer.ts';
import { petText, type PetText } from '../i18n/index.ts';

export type SherpaPhase = 'stopped' | 'starting' | 'running' | 'error';

export interface SherpaState {
  phase: SherpaPhase;
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

/** What differs between the models run here. */
export interface SherpaModelKind {
  /** What the panel shows for the model. */
  label: string;
  /** The language handed to the model for a recognition language (ISO 639-1 or `auto`). */
  language(language: string): string;
  /** sherpa-onnx's model entry (`modelConfig` without `tokens`) for the files, by their role in the runtime store, and that language. */
  config(paths: Readonly<Record<string, string>>, language: string): Record<string, unknown>;
  /** How often the sentence being spoken is decoded again for the bubble; 0: only once it ends. */
  partialEveryMs: number;
  /**
   * Fallback for a model that writes text for audio without speech: an utterance whose loudest
   * 20 ms frame stays below this level (dBFS) is not decoded and comes back empty.
   */
  silentBelowDb?: number;
}

/** Languages SenseVoice names; anything else is left to its own detection. */
const SENSEVOICE_CODES = new Set(['zh', 'en', 'ja', 'ko', 'yue']);

/** FunASR's SenseVoiceSmall. A 3 s sentence decodes in about 0.1 s on two threads, so the repeated decodes stay well inside real time. */
export const SENSEVOICE: SherpaModelKind = {
  label: 'SenseVoiceSmall (FunASR)',
  language: (language) => (SENSEVOICE_CODES.has(language) ? language : 'auto'),
  config: (paths, language) => ({ senseVoice: { model: paths.model, language, useInverseTextNormalization: 1 } }),
  partialEveryMs: 500,
};

/**
 * The languages Whisper's multilingual models up to medium take. sherpa-onnx ends the process when
 * a decode is given any other code, so anything else goes in empty: Whisper then detects it.
 */
const WHISPER_CODES = new Set((
  'en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te '
  + 'fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps '
  + 'tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su'
).split(' '));

/**
 * OpenAI's Whisper small. A decode costs about 70 ms per output token, so a 3 s sentence takes
 * about 1 s and an 8 s one about 3 s (two threads on four cores of a current laptop CPU; four
 * threads on four cores are slower). It decodes only the finished sentence: re-decoding every
 * 500 ms would keep the CPU busy while the person speaks and hold the final decode up behind a
 * partial one.
 *
 * Its silence floor is a fallback: Whisper answers silence and room noise with subtitle credits
 * and sound labels (`[Musik]`, `Субтитры …`); `looksHallucinated` (result.ts) drops the labels
 * that do get decoded.
 */
export const WHISPER: SherpaModelKind = {
  label: 'Whisper small',
  language: (language) => (WHISPER_CODES.has(language) ? language : ''),
  config: (paths, language) => ({ whisper: { encoder: paths.encoder, decoder: paths.decoder, language, task: 'transcribe' } }),
  partialEveryMs: 0,
  silentBelowDb: -50,
};

/** The loudest 20 ms frame of an utterance, in dBFS. */
function peakDb(pcm: Int16Array): number {
  let peak = -100;
  for (let at = 0; at < pcm.length; at += 320) peak = Math.max(peak, rmsDb(pcm.subarray(at, at + 320)));
  return peak;
}

export interface SherpaAsrOptions {
  kind: SherpaModelKind;
  /** The model files by role (one of them `tokens`), or why they are not there. */
  model: () => { paths: Readonly<Record<string, string>> } | { missing: string };
  /** ISO 639-1 or 'auto'; the kind maps it to what its model takes. */
  language: () => string;
  /** CPU threads for one decode; 0 picks two. */
  threads: () => number;
  log: Logger;
  load?: () => SherpaModule;
  /** The text table of the app language, for why recognition is not ready; Chinese when absent. */
  text?: () => PetText;
}

const SAMPLE_RATE = 16_000;
const DEFAULT_THREADS = 2;

export function loadSherpa(): SherpaModule {
  return createRequire(import.meta.url)('sherpa-onnx-node') as SherpaModule;
}

const toFloat = (pcm: Int16Array): Float32Array => {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
};

export class SherpaAsr {
  private rec: SherpaRecognizer | null = null;
  private phase: SherpaPhase = 'stopped';
  private detail: string | null = null;
  private loaded = '';
  private starting: Promise<void> | null = null;

  constructor(private readonly opts: SherpaAsrOptions) {}

  private get t(): PetText['sherpa'] {
    return (this.opts.text?.() ?? petText()).sherpa;
  }

  state(): SherpaState {
    return { phase: this.phase, url: this.opts.kind.label, pid: null, detail: this.detail };
  }

  /** The language or thread count changed since the model was loaded. */
  get configChanged(): boolean {
    return this.phase === 'running' && this.loaded !== this.signature();
  }

  private signature(): string {
    return `${this.language()}/${this.threads()}`;
  }

  private language(): string {
    return this.opts.kind.language(this.opts.language());
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
    if (!Object.values(files.paths).every((p) => existsSync(p))) { this.phase = 'error'; this.detail = this.t.incomplete; return; }
    this.phase = 'starting';
    this.detail = null;
    const started = Date.now();
    try {
      const sherpa = (this.opts.load ?? loadSherpa)();
      this.rec = await sherpa.OfflineRecognizer.createAsync({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: {
          ...this.opts.kind.config(files.paths, this.language()),
          tokens: files.paths.tokens,
          numThreads: this.threads(),
          provider: 'cpu',
          debug: 0,
        },
      });
      this.loaded = this.signature();
      this.phase = 'running';
      this.opts.log.info(`${this.opts.kind.label} 模型已载入(${Date.now() - started} ms)`);
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
    const floor = this.opts.kind.silentBelowDb;
    if (floor !== undefined && peakDb(pcm) < floor) return { text: '', ms: 0, error: null };
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
   * far, `end` gives the whole sentence. Null while the model is not loaded, and for a kind that
   * decodes only finished sentences.
   */
  sentence(onPartial: (text: string) => void): SystemSentence | null {
    const every = this.opts.kind.partialEveryMs;
    if (!this.rec || every <= 0) return null;
    const frames: Int16Array[] = [];
    let samples = 0, decodedAt = 0, busy = false, ended = false, endedAt = 0;
    const joined = () => {
      const all = new Int16Array(samples);
      let at = 0;
      for (const f of frames) { all.set(f, at); at += f.length; }
      return all;
    };
    const partial = () => {
      if (busy || ended || (samples - decodedAt) * 1000 / SAMPLE_RATE < every) return;
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
