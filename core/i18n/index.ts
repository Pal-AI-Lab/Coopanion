/**
 * The Core process's text for people, one file per language named for its code. `zh.ts` and `en.ts`
 * have every key; another language's file has the top-level keys translated so far, each group in it
 * whole, and the keys it leaves out read `zh.ts` for `zh-Hant` and `en.ts` for the rest (Cortico's `pick`).
 */
import { pick, type Language, type LanguageTable } from 'cortico/core/language.ts';
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

export type CoreText = typeof zh;

const CORE_TEXT: LanguageTable<CoreText> = { zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru };

export const coreText = (language: Language): CoreText => pick(language, CORE_TEXT);
