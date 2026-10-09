/**
 * The app's language (`config.language`) and the language of the text the bot reads.
 *
 * The app language is Cortico's console language (`Language` in `cortico/core/language.ts`), and
 * the settings window shows the console in it. A new install takes the operating system's language
 * (`COOPANION_SYSTEM_LANGUAGE`, read by the Electron main process in `app/i18n/index.cjs`); the
 * person changes it on the 「习惯」 page or on Cortico's own settings page. A value outside
 * `Language` (absent, or edited by hand) reads as Chinese, the language Coopanion seeded before it
 * had a choice.
 *
 * Text the person reads comes from a table per language (`core/i18n/`, `app/i18n/`, and the bundled
 * Worlds' own); a language without its table reads `zh`'s for `zh-Hant` and `en`'s for the rest
 * (Cortico's `baseLanguage`).
 *
 * Model text comes in two versions: Chinese for `zh` and `zh-Hant`, English for every other app
 * language. For an app language that is neither `zh` nor `en`, the desktop-pet World tells the bot
 * in one line to talk to the person in it (`replyLanguage`). The bundled Worlds get both through
 * their definitions (`modelLanguage`, `replyLanguage`) and read them at each use; the prompt follows
 * at the next prefix rebuild.
 */
import { isLanguage, type Language, type OptionalLanguage } from 'cortico/core/language.ts';

export type ModelLanguage = 'zh' | 'en';

/** The app language a stored value stands for. */
export const appLanguage = (value: unknown): Language => (isLanguage(value) ? value : 'zh');

/** Each app language other than `zh` and `en`, named in its model-text language. */
const REPLY_NAMES: Record<OptionalLanguage, string> = {
  'zh-Hant': '繁体中文',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  'es-419': 'Latin American Spanish',
  'pt-BR': 'Brazilian Portuguese',
  it: 'Italian',
  ru: 'Russian',
};

/** The language the bot is to talk to the person in, named in the model-text language; null for `zh`, `en` and anything unknown. */
export function replyLanguage(language: unknown): string | null {
  return typeof language === 'string' && Object.hasOwn(REPLY_NAMES, language) ? REPLY_NAMES[language as OptionalLanguage] : null;
}

export function modelLanguage(language: unknown): ModelLanguage {
  return language === 'en' || (language !== 'zh-Hant' && replyLanguage(language) !== null) ? 'en' : 'zh';
}
