import { describe, expect, it } from 'vitest';
import { SOUND_KINDS as PAGE_KINDS } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { DESKTOP_PET_DEFAULTS, SOUND_KINDS, desktopPetConfigGroups } from '../packages/cortico-world-desktop-pet/src/config.ts';
import { PET_TEXT, petText } from '../packages/cortico-world-desktop-pet/src/i18n/index.ts';
import { en } from '../console/features/pet/strings.ts';
import { S as zhHant } from '../console/features/pet/strings.zh-Hant.ts';
import { S as ja } from '../console/features/pet/strings.ja.ts';
import { S as ko } from '../console/features/pet/strings.ko.ts';
import { S as fr } from '../console/features/pet/strings.fr.ts';
import { S as de } from '../console/features/pet/strings.de.ts';
import { S as es419 } from '../console/features/pet/strings.es-419.ts';
import { S as ptBR } from '../console/features/pet/strings.pt-BR.ts';
import { S as it_ } from '../console/features/pet/strings.it.ts';
import { S as ru } from '../console/features/pet/strings.ru.ts';

/** The settings window's sound switches in each language that has its own table; zh and en carry every key. */
const CONSOLE = { en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it: it_, ru };

describe('the kinds of the pet sounds, from the setting to the sound', () => {
  it('the World keeps a switch for every kind the page mutes by, each on by default', () => {
    expect([...SOUND_KINDS]).toEqual(Object.keys(PAGE_KINDS));
    for (const kind of SOUND_KINDS) expect(DESKTOP_PET_DEFAULTS.sounds[kind], kind).toBe(true);
  });

  it('every switch has its name in the config schema and the settings window, in every language', () => {
    for (const language of Object.keys(PET_TEXT)) {
      const properties = desktopPetConfigGroups(language).find((g) => g.schema.properties?.['worlds.desktop-pet.sound']).schema.properties;
      for (const kind of SOUND_KINDS) {
        expect(petText(language).config.sounds[kind]?.title, `${language} ${kind}`).toBeTruthy();
        expect(properties[`worlds.desktop-pet.sounds.${kind}`], `${language} ${kind}`).toBeDefined();
      }
    }
    for (const [language, table] of Object.entries(CONSOLE)) {
      if (!table.kinds) continue;
      for (const kind of SOUND_KINDS) expect(table.kinds[kind]?.[0], `${language} ${kind}`).toBeTruthy();
    }
  });
});
