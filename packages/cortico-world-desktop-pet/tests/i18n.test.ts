/**
 * `petText` is Cortico's `pick` written out, because the console bundle imports nothing from Cortico
 * at run time (src/i18n/index.ts); it has to choose what Cortico's chooses.
 */
import { describe, expect, it } from 'vitest';
import { LANGUAGES, pick } from 'cortico/core/language.ts';
import { PET_TEXT, petText } from '../src/i18n/index.ts';

describe('the text table of a language', () => {
  it('is the one Cortico\'s pick gives, for every language', () => {
    for (const language of LANGUAGES) expect(petText(language), language).toEqual(pick(language, PET_TEXT));
  });
});
