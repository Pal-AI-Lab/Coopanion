import type { WorldDefinition } from 'cortico/world.ts';
import { CUA_DEFAULTS, CUA_ID, type CuaConfigSection } from './config.ts';
import { CuaWorld, type CuaWorldOptions } from './world.ts';
import { cuaText } from './i18n/index.ts';

/** The definition, with how an embedding app asks the person for permission and the languages the bot and the person read (see `CuaWorldOptions`). */
export function cuaDefinition(assembly: Pick<CuaWorldOptions, 'askPermission' | 'modelLanguage' | 'language'> = {}): WorldDefinition<CuaConfigSection> {
  return {
    id: CUA_ID,
    // read when Core assembles the Worlds, in the app language of that moment
    get label() { return cuaText(assembly.language?.()).console.label; },
    defaults: () => structuredClone(CUA_DEFAULTS),
    preflight: () => {
      const t = cuaText(assembly.language?.()).preflight;
      if (process.platform === 'linux' && !process.env.DISPLAY) throw new Error(t.noDisplay);
      if (!['win32', 'darwin', 'linux'].includes(process.platform)) throw new Error(t.unsupported);
    },
    // ctx.cfg is the live `worlds.cua` section: every key is read at use
    create: (ctx) => new CuaWorld({ cfg: ctx.cfg, timezone: ctx.timezone, botName: ctx.botName, askPermission: assembly.askPermission, modelLanguage: assembly.modelLanguage, language: assembly.language }),
  };
}

export const CUA = cuaDefinition();
