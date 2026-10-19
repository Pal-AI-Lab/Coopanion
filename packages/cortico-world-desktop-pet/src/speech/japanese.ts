/**
 * Japanese to IPA. Kanji are read by the longest word that starts at them in `JapaneseReadings.word` (the Jōyō
 * appendix's jukujikun, then IPADIC's words); a kanji in no word takes its own reading (Unihan's): next to another
 * kanji its first on'yomi, alone its kun'yomi cut where the kana after it (okurigana) begin to match it, else its
 * first kun'yomi. Kana are read by mora: small ゃゅょ palatalize the mora before them, っ adds no syllable, and
 * う or ー after an o-mora and い or ー after an e-mora lengthen it into ou and ei.
 */
import type { Ph } from './rules.ts';

const ROWS: Array<[string, string[]]> = [
  ['あいうえお', ['a', 'i', 'ɯ', 'e', 'o']],
  ['かきくけこ', ['k a', 'k i', 'k ɯ', 'k e', 'k o']], ['がぎぐげご', ['ɡ a', 'ɡ i', 'ɡ ɯ', 'ɡ e', 'ɡ o']],
  ['さしすせそ', ['s a', 'ɕ i', 's ɯ', 's e', 's o']], ['ざじずぜぞ', ['z a', 'dʑ i', 'z ɯ', 'z e', 'z o']],
  ['たちつてと', ['t a', 'tɕ i', 'ts ɯ', 't e', 't o']], ['だぢづでど', ['d a', 'dʑ i', 'z ɯ', 'd e', 'd o']],
  ['なにぬねの', ['n a', 'ɲ i', 'n ɯ', 'n e', 'n o']], ['はひふへほ', ['h a', 'ç i', 'ɸ ɯ', 'h e', 'h o']],
  ['ばびぶべぼ', ['b a', 'b i', 'b ɯ', 'b e', 'b o']], ['ぱぴぷぺぽ', ['p a', 'p i', 'p ɯ', 'p e', 'p o']],
  ['まみむめも', ['m a', 'm i', 'm ɯ', 'm e', 'm o']], ['らりるれろ', ['ɾ a', 'ɾ i', 'ɾ ɯ', 'ɾ e', 'ɾ o']],
  ['やゆよ', ['j a', 'j ɯ', 'j o']], ['わゐゑを', ['w a', 'i', 'e', 'o']], ['ゔ', ['v ɯ']], ['ん', ['N']],
];
const MORA = new Map<string, string[]>();
for (const [kana, ps] of ROWS) [...kana].forEach((k, i) => MORA.set(k, ps[i]!.split(' ')));
const SMALL_Y: Record<string, string> = { 'ゃ': 'a', 'ゅ': 'ɯ', 'ょ': 'o' };
const SMALL_V: Record<string, string> = { 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'ɯ', 'ぇ': 'e', 'ぉ': 'o' };
const PALATAL = new Set(['ɕ', 'dʑ', 'tɕ', 'ç', 'ɲ']);

/** Katakana to hiragana; anything else unchanged. */
export const hira = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  return cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : ch;
};
export const isKana = (ch: string) => /[ぁ-ゖァ-ヺー]/.test(ch);
export const isKanji = (ch: string) => /[㐀-䶿一-鿿々]/.test(ch);

/** Kana (each with the text index it came from) to phonemes. */
export function kanaPhonemes(kana: ReadonlyArray<readonly [string, number]>): Ph[] {
  const out: Ph[] = [];
  let lastVowel = -1;
  for (const [raw, at] of kana) {
    const k = hira(raw);
    if (k === 'っ') continue;
    if (k === 'ー') {
      const v = lastVowel >= 0 ? out[lastVowel]!.p : '';
      if (v === 'o' || v === 'e') out[lastVowel]!.p = v === 'o' ? 'ou' : 'ei';
      continue;
    }
    if (SMALL_Y[k] && lastVowel >= 0) {
      const v = out[lastVowel]!;
      const cons = out[lastVowel - 1];
      v.p = SMALL_Y[k]!;
      if (cons && !PALATAL.has(cons.p)) { out.splice(lastVowel, 0, { p: 'j', at: cons.at }); lastVowel++; }
      continue;
    }
    if (SMALL_V[k] && lastVowel >= 0) { out[lastVowel]!.p = SMALL_V[k]!; continue; }
    const prev = lastVowel >= 0 ? out[lastVowel]!.p : '';
    if ((k === 'う' && (prev === 'o' || prev === 'ɯ')) || (k === 'い' && prev === 'e')) {
      out[lastVowel]!.p = prev === 'o' ? 'ou' : prev === 'e' ? 'ei' : 'ɯː';
      continue;
    }
    const m = MORA.get(k);
    if (!m) continue;
    for (const p of m) out.push({ p, at });
    lastVowel = m.at(-1) === 'N' ? -1 : out.length - 1;
  }
  return out;
}

/** Where kanji readings come from, all in hiragana. */
export interface JapaneseReadings {
  /** A word's reading; words up to `longest` characters are tried. */
  word(w: string): string | undefined;
  longest: number;
  /** A kanji's own readings, the commonest first. */
  kanji(k: string): { on: string[]; kun: string[] } | undefined;
}

/** A kanji in no word: see the module header. */
function ownReading(run: string, i: number, r: { on: string[]; kun: string[] }): string | undefined {
  const inWord = (i > 0 && isKanji(run[i - 1]!)) || (i + 1 < run.length && isKanji(run[i + 1]!));
  if (inWord && r.on[0]) return r.on[0];
  const tail = run.slice(i + 1).match(/^[ぁ-ゟ]+/)?.[0] ?? '';
  for (const k of r.kun) for (let cut = 1; cut < k.length; cut++) if (tail.startsWith(k.slice(cut))) return k.slice(0, cut);
  return r.kun[0] ?? r.on[0];
}

/** Japanese text (kana and kanji) to phonemes. */
export function japanesePhonemes(run: string, start: number, readings: JapaneseReadings): Ph[] {
  const kana: Array<[string, number]> = [];
  // a reading's kana spread over the characters it reads
  const spread = (reading: string, i: number, len: number) => {
    const chars = [...reading];
    chars.forEach((k, n) => kana.push([k, start + i + Math.floor((n * len) / chars.length)]));
  };
  let i = 0;
  while (i < run.length) {
    if (!isKanji(run[i]!)) { kana.push([run[i]!, start + i]); i++; continue; }
    let len = Math.min(readings.longest, run.length - i), reading: string | undefined;
    for (; len > 0; len--) { reading = readings.word(run.slice(i, i + len)); if (reading) break; }
    if (reading) { spread(reading, i, len); i += len; continue; }
    const own = readings.kanji(run[i] === '々' && i > 0 ? run[i - 1]! : run[i]!);
    const said = own && ownReading(run, i, own);
    if (said) spread(said, i, 1);
    i++;
  }
  return kanaPhonemes(kana);
}
