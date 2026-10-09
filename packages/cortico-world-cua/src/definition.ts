import type { WorldDefinition } from 'cortico/world.ts';
import { CUA_DEFAULTS, CUA_ID, type CuaConfigSection } from './config.ts';
import { CuaWorld, type CuaWorldOptions } from './world.ts';

/** The definition, with how an embedding app asks the person for permission and which language the bot reads (see `CuaWorldOptions`). */
export function cuaDefinition(assembly: Pick<CuaWorldOptions, 'askPermission' | 'modelLanguage'> = {}): WorldDefinition<CuaConfigSection> {
  return {
    id: CUA_ID,
    label: '电脑操作',
    defaults: () => structuredClone(CUA_DEFAULTS),
    preflight: () => {
      if (process.platform === 'linux' && !process.env.DISPLAY) throw new Error('电脑操作 World 在 Linux 上需要 X11(或 Wayland 下的 XWayland):没有找到 DISPLAY。');
      if (!['win32', 'darwin', 'linux'].includes(process.platform)) throw new Error('电脑操作 World 只支持 Windows、macOS 和 Linux。');
    },
    // ctx.cfg is the live `worlds.cua` section: every key is read at use
    create: (ctx) => new CuaWorld({ cfg: ctx.cfg, timezone: ctx.timezone, botName: ctx.botName, askPermission: assembly.askPermission, modelLanguage: assembly.modelLanguage }),
  };
}

export const CUA = cuaDefinition();
