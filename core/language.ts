/**
 * The app's language (`config.language`) and the language of the text the bot reads.
 *
 * A new install takes the operating system's language (`COOPANION_SYSTEM_LANGUAGE`, read by the
 * Electron main process in `app/i18n/index.cjs`); the person changes it on the 「习惯」 page. A value
 * outside `AppLanguage` (absent, or edited by hand) reads as Chinese, the language Coopanion seeded
 * before it had a choice.
 *
 * Text the person reads comes from a table per language (`core/i18n/`, `app/i18n/`, and the bundled
 * Worlds' own); a language without its table reads `zh`'s for `zh-Hant` and `en`'s for the rest.
 *
 * Model text comes in two versions: Chinese for `zh` and `zh-Hant`, English for every other app
 * language. For an app language that is neither `zh` nor `en`, the desktop-pet World tells the bot
 * in one line to talk to the person in it (`replyLanguage`). The bundled Worlds get both through
 * their definitions (`modelLanguage`, `replyLanguage`) and read them at each use; the prompt follows
 * at the next prefix rebuild. Imports nothing from Cortico, so `seed.ts` can use it.
 */

/** Stands in for Cortico's `Language` until the vendored Cortico widens that type to these eleven. */
export const APP_LANGUAGES = ['zh', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es-419', 'pt-BR', 'it', 'ru'] as const;
export type AppLanguage = typeof APP_LANGUAGES[number];

export type ModelLanguage = 'zh' | 'en';

export const isAppLanguage = (value: unknown): value is AppLanguage => (APP_LANGUAGES as readonly unknown[]).includes(value);

/** The app language a stored value stands for. */
export const appLanguage = (value: unknown): AppLanguage => (isAppLanguage(value) ? value : 'zh');

/** The language whose table a language without its own reads. */
export const fallbackLanguage = (language: AppLanguage): 'zh' | 'en' => (language === 'zh' || language === 'zh-Hant' ? 'zh' : 'en');

/** Each language named in itself, as the language setting lists them. */
export const ENDONYMS: Record<AppLanguage, string> = {
  zh: '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  'es-419': 'Español (Latinoamérica)',
  'pt-BR': 'Português (Brasil)',
  it: 'Italiano',
  ru: 'Русский',
};

/**
 * The language Cortico's console shows for an app language: it has Chinese and English only
 * (`cortico/core/language.ts`). Becomes the app language itself once the vendored Cortico takes all eleven.
 */
export const consoleLanguage = (language: AppLanguage): 'zh' | 'en' => fallbackLanguage(language);

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
