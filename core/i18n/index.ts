/**
 * The Core process's text for people, one table per language (`zh.ts`, `en.ts`). A new language is a
 * file with en.ts's keys, added to `TABLES`; until then a language reads its fallback's table
 * (`fallbackLanguage` in language.ts).
 */
import { fallbackLanguage, type AppLanguage } from '../language.ts';
import zh from './zh.ts';
import en from './en.ts';

export type CoreText = typeof zh;

const TABLES: Partial<Record<AppLanguage, CoreText>> = { zh, en };

export const coreText = (language: AppLanguage): CoreText => TABLES[language] ?? TABLES[fallbackLanguage(language)]!;
