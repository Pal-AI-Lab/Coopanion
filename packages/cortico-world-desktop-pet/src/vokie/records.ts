/**
 * Vokie's finished listening sessions, read from its read-only local API, as the pet's second way in.
 *
 * Vokie's Google TV remote starts a `旁听` (toggle) session rather than a dictation: it records and
 * keeps the transcript in its history, and pastes nothing. Its external API publishes that history
 * (`GET /v1/data/records`), so a session the person began with the remote reaches the pet here —
 * with Vokie's own recognition of the microphone the person actually spoke into, and without this
 * World opening a microphone of its own or pressing any key for Vokie.
 *
 * Only records written after this started are reported, only `completed` ones, and only the type the
 * setting names (`toggle` by default: the remote's 旁听; `ptt` is the 听写 that Vokie pastes itself).
 * The transcript of a 旁听 record is a transcript of segments, one `HH:MM:SS` line and one
 * `SPEAKER_00: text` line each; `cleanTranscript` folds it into one line of speech.
 */
import type { Logger } from 'cortico/core/types.ts';
import { readVokieService, vokieSettingsFile } from '../asr/vokie.ts';

/** One finished Vokie session, as the pet takes it. */
export interface VokieRecord {
  /** Vokie's history id, increasing. */
  id: number;
  /** `ptt`, `toggle` or `command`. */
  type: string;
  /** The spoken text, cleaned. */
  text: string;
  /** When the session was created, epoch milliseconds. */
  ts: number;
}

export type RecordsPhase = 'stopped' | 'waiting' | 'running';

export interface VokieRecordsState {
  phase: RecordsPhase;
  /** Vokie's address as this one reads it. */
  url: string;
  detail: string | null;
}

export interface VokieRecordsOptions {
  /** `asr.vokiePort`: 0 reads the port from Vokie's settings. */
  port: () => number;
  /** How often Vokie's history is read. */
  pollMs: number;
  onRecord: (record: VokieRecord) => void;
  log?: Logger;
  /** Tests pass a local server's fetch. */
  fetchImpl?: typeof fetch;
  settingsFile?: () => string | null;
}

/** One line that is only a timestamp, which a segment transcript puts before each segment. */
const TIME_ONLY = /^\d{1,2}(:\d{2}){1,2}([.,]\d+)?$/;
/** The speaker label a segment transcript puts before the words: `SPEAKER_00:`, `UNKNOWN:`. */
const SPEAKER = /^[A-Z][A-Z0-9_]{1,}:\s*/;
/** A segment transcript with CJK needs no space between segments; a Latin one does. */
const CJK = /[\u3400-\u9fff]/;

/**
 * A 旁听 transcript as one line of speech: timestamp and speaker lines dropped, segments joined.
 * Empty when nothing but noise was heard.
 */
export function cleanTranscript(transcript: string): string {
  const parts: string[] = [];
  for (const raw of transcript.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || TIME_ONLY.test(line)) continue;
    line = line.replace(SPEAKER, '').trim();
    if (line) parts.push(line);
  }
  const cjk = parts.some((part) => CJK.test(part));
  return parts.join(cjk ? '' : ' ').trim();
}

/** Shorter than this after the punctuation is a cough, a "嗯" or a hallucination of silence. */
const MIN_CHARS = 2;
/** What a transcript of silence comes back as; Vokie's own files show "嗯。" for an empty session. */
const FILLERS = new Set(['嗯', '嗯嗯', '啊', '呃', '哦', '额', 'em', 'um', 'uh', 'hmm']);

/** Whether a cleaned transcript says nothing worth handing to the bot. */
export function isNoise(text: string): boolean {
  const bare = text.replace(/[\s，。、,.!！?？…~～:：;；"'“”‘’]/g, '').toLowerCase();
  return bare.length < MIN_CHARS || FILLERS.has(bare);
}
/** One history read cannot hold the pet for long; the next poll starts over. */
const READ_TIMEOUT_MS = 4_000;
/** How many records one read asks for: enough for a burst, few enough to parse cheaply. */
const PAGE = 10;

export class VokieRecordsWatch {
  private phase: RecordsPhase = 'stopped';
  private timer: NodeJS.Timeout | null = null;
  private abort: AbortController | null = null;
  /** Ids already dealt with, whether they were delivered, were noise, or were there before this started. */
  private readonly settled = new Set<number>();
  /** True until the first good read, which only records what was already there. */
  private baseline = true;
  private lastNoted = '';
  private reading = false;
  private detail: string | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly settingsFile: () => string | null;

  constructor(private readonly opts: VokieRecordsOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.settingsFile = opts.settingsFile ?? vokieSettingsFile;
  }

  /** Where Vokie's history is read: the port setting, else Vokie's own settings. */
  url(): string {
    const port = this.opts.port() || readVokieService(this.settingsFile()).port;
    return `http://127.0.0.1:${port}`;
  }

  state(): VokieRecordsState {
    return { phase: this.phase, url: this.url(), detail: this.detail };
  }

  /** Starts polling; the sessions already in Vokie's history are not replayed. */
  start(): void {
    if (this.timer) return;
    this.phase = 'waiting';
    this.detail = null;
    this.settled.clear();
    this.baseline = true;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.opts.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    this.phase = 'stopped';
  }

  /** Writes a line the first time the history becomes readable or unreadable, not on every poll. */
  private note(phase: RecordsPhase, detail: string | null): void {
    this.phase = phase;
    this.detail = detail;
    const key = `${phase}:${detail ?? ''}`;
    if (key === this.lastNoted) return;
    this.lastNoted = key;
    if (phase === 'running') this.opts.log?.info(`Vokie 历史可以读了:${this.url()}`);
    else this.opts.log?.warn(`Vokie 历史读不到(${detail ?? '?'}):${this.url()}`);
  }

  private async poll(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort?.abort(), READ_TIMEOUT_MS);
    try {
      const reply = await this.fetchImpl(`${this.url()}/v1/data/records?limit=${PAGE}&full=true`, { signal: this.abort.signal });
      if (!reply.ok) {
        this.note('waiting', `http ${reply.status}`);
        return;
      }
      const body = (await reply.json()) as { records?: unknown };
      const records = Array.isArray(body.records) ? body.records : [];
      this.note('running', null);
      const parsed = records.map(parseRecord).filter((r): r is ParsedRecord => r !== null).sort((a, b) => a.id - b.id);
      if (this.baseline) {
        // the history that was already there belongs to whatever the person did before the pet listened
        this.baseline = false;
        for (const record of parsed) this.settled.add(record.id);
        return;
      }
      for (const record of parsed) {
        if (this.settled.has(record.id)) continue;
        // a session is written while it is still running: leave it unsettled until it completes
        if (record.status !== 'completed') continue;
        this.settled.add(record.id);
        if (isNoise(record.text)) {
          this.opts.log?.info(`Vokie 记录 ${record.id} 没有文字,跳过`);
          continue;
        }
        this.opts.onRecord({ id: record.id, type: record.type, text: record.text, ts: record.ts });
      }
      // the history page is short; remembering more than it can hold buys nothing
      if (this.settled.size > 200) {
        const keepFrom = Math.max(...this.settled) - 100;
        for (const id of this.settled) if (id < keepFrom) this.settled.delete(id);
      }
    } catch (err) {
      this.note('waiting', (err as Error).name === 'AbortError' ? 'timeout' : 'unreachable');
    } finally {
      clearTimeout(timer);
      this.abort = null;
      this.reading = false;
    }
  }
}

interface ParsedRecord {
  id: number;
  type: string;
  status: string;
  text: string;
  ts: number;
}

/** One record of `/v1/data/records`, or null for an entry that cannot be one. */
function parseRecord(value: unknown): ParsedRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    id?: unknown; type?: unknown; status?: unknown; create_time?: unknown;
    transcription?: { transcript?: unknown };
  };
  if (typeof record.id !== 'number' || typeof record.type !== 'string') return null;
  const transcript = record.transcription?.transcript;
  return {
    id: record.id,
    type: record.type,
    status: typeof record.status === 'string' ? record.status : '',
    text: typeof transcript === 'string' ? cleanTranscript(transcript) : '',
    ts: typeof record.create_time === 'number' ? record.create_time : Date.now(),
  };
}
