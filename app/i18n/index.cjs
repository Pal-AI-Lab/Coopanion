/**
 * The main process's text, and the language a new install starts in.
 *
 * Each language's text is a file beside this one named for its code (`zh.cjs`, `en.cjs`; a new
 * language is a new `<code>.cjs` with the keys of `en.cjs`). A language without its file, and a key its
 * file leaves out, read `zh.cjs` for `zh-Hant` and `en.cjs` for every other language.
 */
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** The app's languages: Cortico's console languages, as `LANGUAGES` in `cortico/core/language.ts` lists them. */
const LANGUAGES = ['zh', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es-419', 'pt-BR', 'it', 'ru'];
/** Plain language subtags that map onto an app language of their own name. */
const PLAIN = new Set(['en', 'ja', 'ko', 'fr', 'de', 'it', 'ru']);

/** The app language for one BCP 47 locale tag, or null when the app has none for it. */
function languageOfLocale(tag) {
  const parts = String(tag ?? '').toLowerCase().replaceAll('_', '-').split('-');
  const [base, ...rest] = parts;
  if (base === 'zh') {
    if (rest.includes('hans')) return 'zh';
    return rest.some((p) => p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo') ? 'zh-Hant' : 'zh';
  }
  if (base === 'es') return 'es-419';
  if (base === 'pt') return 'pt-BR';
  return PLAIN.has(base) ? base : null;
}

/** The first of the system's preferred languages the app has, else its UI locale's, else English. Call after `ready`. */
function systemLanguage(app) {
  for (const tag of [...app.getPreferredSystemLanguages(), app.getLocale()]) {
    const language = languageOfLocale(tag);
    if (language) return language;
  }
  return 'en';
}

/** `language` in `<home>/companion/config.json` (the deployment `core/seed.ts` writes), or null before the first start. */
function configuredLanguage(home) {
  const file = join(home, 'companion', 'config.json');
  if (!existsSync(file)) return null;
  try {
    const language = JSON.parse(readFileSync(file, 'utf8')).language;
    return LANGUAGES.includes(language) ? language : 'zh';
  } catch {
    return null;
  }
}

const tables = new Map();
function table(language) {
  if (!tables.has(language)) {
    let t = null;
    try { t = require(`./${language}.cjs`); } catch { /* no file for it */ }
    tables.set(language, t);
  }
  return tables.get(language);
}

/** The text table of `language`. */
function textOf(language) {
  const fallback = language === 'zh' || language === 'zh-Hant' ? 'zh' : 'en';
  return { ...table('en'), ...table(fallback), ...(LANGUAGES.includes(language) ? table(language) : null) };
}

module.exports = { LANGUAGES, languageOfLocale, systemLanguage, configuredLanguage, textOf };
