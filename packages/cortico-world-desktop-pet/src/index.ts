/** Package entry: the default export is the `WorldDefinition`. */
import { DESKTOP_PET } from './definition.ts';

export default DESKTOP_PET;

export { DESKTOP_PET };
export { desktopPetDefinition, type DesktopPetAssembly } from './definition.ts';
export { DESKTOP_PET_DEFAULTS, MAX_HOVER_BUTTONS, PET_ACTIONS, SELF_KEYS, TOUCH_KINDS, USER_MAX, desktopPetConfigGroups, hoverButtonList, selfAdjustMode } from './config.ts';
export { capFor, charCount, cutChars, petText, type PetText } from './i18n/index.ts';
export type { DesktopPetConfigSection, PetAction, PetSkin } from './config.ts';
export { DesktopPetWorld, type ConfirmResult, type PetBotControls, type PetDialog, type PetDialogAnswer, type PetDialogHandle, type PetDialogInput, type PetDialogUpdate } from './world.ts';
export { numberArg, stringArg, type DescribeTool, type PetStatus, type ToolArgs } from './status.ts';
export { waitSeconds } from './cua/cua.ts';
export { figurePacks, nameIn, type FigureManifest, type FigurePack, type FigurePreset } from './packs.ts';
export type { ModelLanguage } from './model-text.ts';
