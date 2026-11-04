/**
 * The script of one job: the worker's transcript plus names and corrections, kept as script.json
 * and rendered to script.md. Speaker labels (S1, S2, ...) come from diarization and never change;
 * names are a separate map, so renaming rewrites only the rendering.
 */

export interface VideoInfo {
  title: string;
  uploader: string;
  durationSec: number | null;
  webpageUrl: string;
  /** `BV…` or `av…` as the tool was given it. */
  ref: string;
  page: number;
}

export interface ScriptLine {
  start: number;
  end: number;
  speaker: string;
  text: string;
  /** Recognized text when `text` was corrected by the writer model. */
  asrText?: string;
}

export type NameSource = 'bot' | 'endpoint';

export interface Script {
  video: VideoInfo;
  /** Language Whisper used or detected. */
  language: string;
  asrModel: string;
  diarizationModel: string | null;
  speakers: string[];
  names: Record<string, string>;
  nameSource: Record<string, NameSource>;
  evidence: Record<string, string>;
  lines: ScriptLine[];
}

/** What biliscript_worker.py writes to transcript.json. */
export interface WorkerTranscript {
  video: { title: string; uploader: string; durationSec: number | null; webpageUrl: string; id: string };
  language: string;
  durationSec: number;
  asrModel: string;
  diarizationModel: string | null;
  speakers: string[];
  lines: Array<{ start: number; end: number; speaker: string; text: string }>;
}

export function scriptFromTranscript(t: WorkerTranscript, ref: string, page: number): Script {
  return {
    video: {
      title: t.video.title,
      uploader: t.video.uploader,
      durationSec: t.video.durationSec ?? t.durationSec,
      webpageUrl: t.video.webpageUrl,
      ref,
      page,
    },
    language: t.language,
    asrModel: t.asrModel,
    diarizationModel: t.diarizationModel,
    speakers: [...t.speakers],
    names: {},
    nameSource: {},
    evidence: {},
    lines: t.lines.map((l) => ({ start: l.start, end: l.end, speaker: l.speaker, text: l.text })),
  };
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function displayName(script: Script, speaker: string): string {
  return script.names[speaker] ?? speaker;
}

export function lineCounts(script: Script): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of script.lines) counts[l.speaker] = (counts[l.speaker] ?? 0) + 1;
  return counts;
}

/** `[mm:ss] Name: text`, the form used in script.md, receipts and events. */
export function formatLine(script: Script, l: ScriptLine, cjk = isCjk(script.language)): string {
  return `[${clock(l.start)}] ${displayName(script, l.speaker)}${cjk ? '：' : ': '}${l.text}`;
}

const isCjk = (language: string): boolean => /^(zh|ja|yue)/i.test(language);

const HEADINGS = {
  cjk: {
    source: '来源', uploader: 'UP 主', duration: '时长', engines: '转写', diarization: '说话人区分',
    off: '未区分', cast: '人物', lines: (n: number) => `${n} 句`, unnamed: '未命名', dialogue: '对白', sep: '；',
  },
  latin: {
    source: 'Source', uploader: 'Uploader', duration: 'Duration', engines: 'Transcription', diarization: 'Speaker separation',
    off: 'off', cast: 'Cast', lines: (n: number) => `${n} lines`, unnamed: 'unnamed', dialogue: 'Dialogue', sep: '; ',
  },
};

export function renderMarkdown(script: Script): string {
  const cjk = isCjk(script.language);
  const h = cjk ? HEADINGS.cjk : HEADINGS.latin;
  const v = script.video;
  const counts = lineCounts(script);
  const out: string[] = [];
  out.push(`# ${v.title || v.ref}${v.page > 1 ? ` (P${v.page})` : ''}`, '');
  out.push(`- ${h.source}: ${v.webpageUrl}`);
  if (v.uploader) out.push(`- ${h.uploader}: ${v.uploader}`);
  if (v.durationSec) out.push(`- ${h.duration}: ${clock(v.durationSec)}`);
  out.push(`- ${h.engines}: faster-whisper ${script.asrModel}${h.sep}${h.diarization}: ${script.diarizationModel ?? h.off}`);
  out.push('', `## ${h.cast}`, '');
  for (const s of script.speakers) {
    const name = script.names[s];
    const n = h.lines(counts[s] ?? 0);
    out.push(name ? `- ${name} (${s}, ${n})` : `- ${s} (${n}, ${h.unnamed})`);
  }
  out.push('', `## ${h.dialogue}`, '');
  for (const l of script.lines) out.push(formatLine(script, l, cjk), '');
  return out.join('\n');
}
