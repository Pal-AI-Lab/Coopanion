/**
 * The Core process's text for people, one table per language (`zh.ts`, `en.ts`). A new language is a
 * file with en.ts's keys, added to the table below; until then a language reads its base language's
 * table (Cortico's `pick`).
 */
import { pick, type Language } from 'cortico/core/language.ts';
import zh from './zh.ts';
import en from './en.ts';

export type CoreText = typeof zh;

export const coreText = (language: Language): CoreText => pick(language, { zh, en });
