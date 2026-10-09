/**
 * The text this World shows people, one table per language (`zh.ts`, `en.ts`). A new language is a
 * file with en.ts's keys, added to `TABLES`; until then `zh-Hant` reads `zh` and every other language
 * reads `en`.
 */
import zh from './zh.ts';
import en from './en.ts';

export type CuaText = typeof zh;

const TABLES: Partial<Record<string, CuaText>> = { zh, en };

/** The table of `language`, an app or console language code; `zh` when absent. */
export function cuaText(language = 'zh'): CuaText {
  return TABLES[language] ?? (language === 'zh' || language === 'zh-Hant' ? zh : en);
}
