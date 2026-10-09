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

/** Written without spaces between words. */
const UNSPACED_END = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const UNSPACED_START = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Sentences heard one after another: a space before one that starts with a letter or digit after
 * a letter, digit or ASCII punctuation, unless either side is Chinese or Japanese.
 */
export function joinSpeech(pieces: readonly string[]): string {
  let out = '';
  for (const p of pieces) {
    if (!p) continue;
    const spaced = /[\p{L}\p{N}.,!?;:]$/u.test(out) && !UNSPACED_END.test(out) && /^[\p{L}\p{N}]/u.test(p) && !UNSPACED_START.test(p);
    out += spaced ? ` ${p}` : p;
  }
  return out;
}

export function looksHallucinated(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(t));
}
