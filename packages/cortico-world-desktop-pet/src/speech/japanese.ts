/**
 * Japanese to IPA. Kanji are read by the longest word of the dictionary (src/speech/data/ja.tsv.gz, KAKASI's)
 * that the text starts with at that point, kana by their mora; small ゃゅょ palatalize the mora before them,
 * っ and ー add no syllable, う after an o-mora and い after an e-mora lengthen it into ou and ei.
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
    if (k === 'っ' || k === 'ー') continue;
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

/** Japanese text (kana and kanji) to phonemes; `dict` gives a word's reading in hiragana. */
export function japanesePhonemes(run: string, start: number, dict: (word: string) => string | undefined, longest: number): Ph[] {
  const kana: Array<[string, number]> = [];
  let i = 0;
  while (i < run.length) {
    if (!isKanji(run[i]!)) { kana.push([run[i]!, start + i]); i++; continue; }
    let len = Math.min(longest, run.length - i), reading: string | undefined;
    for (; len > 0; len--) { reading = dict(run.slice(i, i + len)); if (reading) break; }
    if (!reading) { i++; continue; }
    // the reading's kana spread over the characters it reads
    const chars = [...reading];
    chars.forEach((k, n) => kana.push([k, start + i + Math.floor((n * len) / chars.length)]));
    i += len;
  }
  return kanaPhonemes(kana);
}
