import { join } from 'node:path';
import { runtimesRoot, modelsRoot } from 'cortico/paths.ts';
import type { WorldDefinition } from 'cortico/world.ts';
import { DESKTOP_PET_DEFAULTS, DESKTOP_PET_ID, type DesktopPetConfigSection, type PetSkin } from './config.ts';
import { DesktopPetWorld, modelsDirFor, type PetBotControls } from './world.ts';

/** The console keeps the bot's avatar here, in the deployment directory. */
const AVATAR_FILE = 'avatar.png';

export interface DesktopPetAssembly {
  /** Run controls for the menu header; see `PetBotControls`. */
  controls?: PetBotControls;
  /** Called with each World instance Core creates, for an app that calls `confirm` on it. */
  onCreate?(world: DesktopPetWorld): void;
  /** Called after the dressing page saves a look, with that look as saved. */
  onSkin?(skin: PetSkin): void;
}

/** The definition, with what an embedding app lends the World. */
export function desktopPetDefinition(assembly: DesktopPetAssembly = {}): WorldDefinition<DesktopPetConfigSection> {
  return {
    id: DESKTOP_PET_ID,
    label: '桌宠',
    defaults: () => structuredClone(DESKTOP_PET_DEFAULTS),
    // ctx.cfg is the live `worlds.desktop-pet` section: hot keys are read at use
    create: (ctx) => {
      const world = new DesktopPetWorld({
        cfg: ctx.cfg,
        timezone: ctx.timezone,
        persist: (patch) => {
          ctx.persist(patch);
          if (patch.skin) assembly.onSkin?.(patch.skin as PetSkin);
        },
        runtimesRoot,
        modelsDir: () => modelsDirFor(modelsRoot()),
        botName: ctx.botName,
        avatarFile: join(ctx.botDir, AVATAR_FILE),
        controls: assembly.controls,
      });
      assembly.onCreate?.(world);
      return world;
    },
  };
}

export const DESKTOP_PET = desktopPetDefinition();
