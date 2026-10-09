/** Package entry: the default export is the `WorldDefinition`. */
import { DESKTOP_PET } from './definition.ts';

export default DESKTOP_PET;

export { DESKTOP_PET };
export { desktopPetDefinition, type DesktopPetAssembly } from './definition.ts';
export { DESKTOP_PET_DEFAULTS, DESKTOP_PET_CONFIG_GROUP, DESKTOP_PET_SOUND_CONFIG_GROUP, DESKTOP_PET_ASR_CONFIG_GROUP } from './config.ts';
export type { DesktopPetConfigSection, PetSkin } from './config.ts';
export { DesktopPetWorld, type ConfirmResult, type PetBotControls, type PetDialog, type PetDialogAnswer, type PetDialogHandle, type PetDialogInput, type PetDialogUpdate } from './world.ts';
export { HOST_ENV, HOST_MAIN } from './window-host.ts';
export { numberArg, stringArg, type DescribeTool, type PetStatus, type ToolArgs } from './status.ts';
export { figurePacks, nameIn, type FigureManifest, type FigurePack, type FigurePreset } from './packs.ts';
export type { ModelLanguage } from './model-text.ts';
