/**
 * The app's language (`config.language`) and the language of the text the bot reads.
 *
 * Model text comes in two versions: Chinese for `zh` and `zh-Hant`, English for every other app
 * language. A value outside `AppLanguage` (absent, or edited by hand) reads as Chinese, the language
 * Coopanion seeded before it had a choice. For an app language that is neither `zh` nor `en`, the
 * desktop-pet World tells the bot in one line to talk to the person in it (`replyLanguage`).
 *
 * The bundled Worlds get both through their definitions (`modelLanguage`, `replyLanguage`) and read
 * them at each use; the prompt follows at the next prefix rebuild. Imports nothing from Cortico, so
 * `seed.ts` can use it.
 */

/** Stands in for Cortico's `Language` until the vendored Cortico widens that type to these eleven. */
export type AppLanguage = 'zh' | 'zh-Hant' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es-419' | 'pt-BR' | 'it' | 'ru';

export type ModelLanguage = 'zh' | 'en';

/** Each app language other than `zh` and `en`, named in its model-text language. */
const REPLY_NAMES: Record<Exclude<AppLanguage, 'zh' | 'en'>, string> = {
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
  return typeof language === 'string' && Object.hasOwn(REPLY_NAMES, language) ? REPLY_NAMES[language as keyof typeof REPLY_NAMES] : null;
}

export function modelLanguage(language: unknown): ModelLanguage {
  return language === 'en' || (language !== 'zh-Hant' && replyLanguage(language) !== null) ? 'en' : 'zh';
}
