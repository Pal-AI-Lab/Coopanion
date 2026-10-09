/**
 * The text this World shows people, one table per language (`zh.ts`, `en.ts`). A new language is a
 * file with en.ts's keys, added to the table below; until then `zh-Hant` reads `zh` and every other
 * language reads `en` (Cortico's `pick`).
 */
import { pick, type Language } from 'cortico/core/language.ts';
import zh from './zh.ts';
import en from './en.ts';

export type CuaText = typeof zh;

/** The table of `language`, the app's or the console request's; `zh` when absent. */
export function cuaText(language: Language = 'zh'): CuaText {
  return pick(language, { zh, en });
}
