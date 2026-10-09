/** What a recognizer returns for one utterance, and the filter for lines that are not speech. */

export interface TranscribeResult {
  text: string;
  ms: number;
  /** null on success. */
  error: string | null;
}

/**
 * Fallback for models that write text for audio without speech: on noise they produce
 * high-frequency lines from their training subtitles, which cannot be told apart from real speech
 * by content, so they are blocked by list; Whisper also labels sounds in brackets, parentheses or
 * asterisks (`[Musik]`, `(звук пива)`, `*Bruit de la porte*`), sometimes cut off before the
 * closing mark. Letting one through means an event claims a sentence nobody said.
 */
const HALLUCINATION_PATTERNS: readonly RegExp[] = [
  /^[\s。.,、!?!?…~-]*$/,
  /字幕|谢谢观看|请不吝点赞|订阅|转发|打赏|明镜与点点栏目/,
  /^(thank you|thanks for watching|subtitles by|you)[\s.!]*$/i,
  /^\s*(sous-titr|untertitel|subt[ií]tulos|legendas|sottotitoli|субтитр)/i,
  /^\s*[[(（【*♪]/,
];

/** Sentences heard one after another: a space before one that starts in Latin letters or digits after Latin text or ASCII punctuation, nothing between Chinese ones. */
export function joinSpeech(pieces: readonly string[]): string {
  let out = '';
  for (const p of pieces) {
    if (!p) continue;
    out += out && /[A-Za-z0-9.,!?;:]$/.test(out) && /^[A-Za-z0-9]/.test(p) ? ` ${p}` : p;
  }
  return out;
}

export function looksHallucinated(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(t));
}
