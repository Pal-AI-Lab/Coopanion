/**
 * `petText` is Cortico's `pick` written out, because the console bundle imports nothing from Cortico
 * at run time (src/i18n/index.ts); it has to choose what Cortico's chooses.
 */
import { describe, expect, it } from 'vitest';
import { LANGUAGES, pick } from 'cortico/core/language.ts';
import { PET_TEXT, petText } from '../src/i18n/index.ts';
import { desktopPetConfigGroups } from '../src/config.ts';
import { coerceGroupValues } from 'cortico/core/config-schema.ts';

describe('the text table of a language', () => {
  it('declares the recognition service preference as a writable hot boolean in every language', () => {
    const key = 'worlds.desktop-pet.asr.serviceEnabled';
    for (const language of LANGUAGES) {
      const group = desktopPetConfigGroups(language).find((g) => g.id === 'world:desktop-pet:asr')!;
      expect(group.schema.properties[key]).toMatchObject({ type: 'boolean', 'x-hot': true, title: petText(language).config.asrServiceEnabled.title });
      expect(coerceGroupValues(group, { [key]: false }, language)).toEqual({ values: { [key]: false } });
    }
  });
  it('is the one Cortico\'s pick gives, for every language', () => {
    for (const language of LANGUAGES) expect(petText(language), language).toEqual(pick(language, PET_TEXT));
  });
});
