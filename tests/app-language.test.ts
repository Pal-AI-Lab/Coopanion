import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { APP_LANGUAGES } from '../core/language.ts';

const require = createRequire(import.meta.url);
const { LANGUAGES, systemLanguage } = require('../app/i18n/index.cjs') as {
  LANGUAGES: string[];
  systemLanguage(app: { getPreferredSystemLanguages(): string[]; getLocale(): string }): string;
};
const system = (preferred: string[], locale = '') => systemLanguage({ getPreferredSystemLanguages: () => preferred, getLocale: () => locale });

describe('the language a new install starts in', () => {
  it('lists the languages core/language.ts lists', () => {
    expect(LANGUAGES).toEqual([...APP_LANGUAGES]);
  });

  it('reads Traditional Chinese from the script, else the region, and Simplified otherwise', () => {
    expect(['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-CN'].map((tag) => system([tag]))).toEqual(['zh-Hant', 'zh-Hant', 'zh-Hant', 'zh-Hant']);
    expect(['zh-CN', 'zh-SG', 'zh-Hans-HK', 'zh'].map((tag) => system([tag]))).toEqual(['zh', 'zh', 'zh', 'zh']);
  });

  it('takes the first preferred language the app has, then the locale, then English', () => {
    expect(system(['nl-NL', 'pt-PT', 'en-US'])).toBe('pt-BR');
    expect(system(['es-ES'])).toBe('es-419');
    expect(system(['nl-NL'], 'ko')).toBe('ko');
    expect(system(['nl-NL'], 'sv')).toBe('en');
  });
});
