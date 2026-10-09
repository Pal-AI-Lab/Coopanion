/**
 * The text this World shows people, one file per language named for its code. `zh.ts` and `en.ts`
 * have every key; another language's file has the top-level keys translated so far, each group in it
 * whole, and the keys it leaves out read `zh.ts` for `zh-Hant` and `en.ts` for the rest. Imports
 * nothing from Cortico at run time, so the console panels (src/console/client.ts) use it too.
 */
import type { Language, LanguageTable } from 'cortico/core/language.ts';
import zh from './zh.ts';
import en from './en.ts';
import zhHant from './zh-Hant.ts';
import ja from './ja.ts';
import ko from './ko.ts';
import fr from './fr.ts';
import de from './de.ts';
import es419 from './es-419.ts';
import ptBR from './pt-BR.ts';
import it from './it.ts';
import ru from './ru.ts';

export type PetText = typeof zh;

export const PET_TEXT: LanguageTable<PetText> = { zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru };

/**
 * The table of `language`, the app's or the console request's; `zh` when absent. This is Cortico's
 * `pick` (cortico/core/language.ts) written out for the console bundle: a language without its
 * table reads `zh`'s for `zh-Hant` and `en`'s for the rest, and a table that leaves out top-level
 * keys takes them from there.
 */
export function petText(language: Language = 'zh'): PetText {
  const base = PET_TEXT[language === 'zh' || language === 'zh-Hant' ? 'zh' : 'en'];
  const own = language === 'zh' || language === 'en' ? undefined : PET_TEXT[language];
  if (!own) return base;
  return { ...base, ...Object.fromEntries(Object.entries(own).filter(([, value]) => value !== undefined)) };
}

/** Scripts that write a word in a character or two: the character caps of text the person reads are set for them. */
const DENSE: ReadonlySet<Language> = new Set(['zh', 'zh-Hant', 'ja', 'ko']);

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
export function capFor(base: number, language: Language = 'zh'): number {
  return DENSE.has(language) ? base : base * 2;
}
