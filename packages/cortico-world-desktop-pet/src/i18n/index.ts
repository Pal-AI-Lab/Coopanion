/**
 * The text this World shows people, one table per language (`zh.ts`, `en.ts`). A new language is
 * a file with en.ts's keys, added to `TABLES`; until then `zh-Hant` reads `zh` and every other
 * language reads `en`. Imports nothing, so the console panels (src/console/client.ts) use it too.
 */
import zh from './zh.ts';
import en from './en.ts';

export type PetText = typeof zh;

const TABLES: Partial<Record<string, PetText>> = { zh, en };

/** The table of `language`, an app or console language code; `zh` when absent. */
export function petText(language = 'zh'): PetText {
  return TABLES[language] ?? (language === 'zh' || language === 'zh-Hant' ? zh : en);
}

/** Scripts that write a word in a character or two: the character caps of text the person reads are set for them. */
const DENSE = new Set(['zh', 'zh-Hant', 'ja', 'ko']);

/** Characters as the person sees them (grapheme clusters). */
export function charCount(text: string): number {
  let n = 0;
  for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) n++;
  return n;
}

/** `text` cut to `max` characters as the person sees them. */
export function cutChars(text: string, max: number): string {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
  return parts.length > max ? parts.slice(0, max).map((s) => s.segment).join('') : text;
}

/** A character cap set for Chinese, Japanese and Korean, doubled for the other languages, whose words take more characters. */
export function capFor(base: number, language = 'zh'): number {
  return DENSE.has(language) ? base : base * 2;
}
