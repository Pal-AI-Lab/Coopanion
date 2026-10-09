/** Package entry: the default export is the `WorldDefinition`. */
import { CUA } from './definition.ts';

export default CUA;

export { CUA };
export { cuaDefinition } from './definition.ts';
export { CUA_DEFAULTS, CUA_CONFIG_GROUP } from './config.ts';
export type { CuaConfigSection } from './config.ts';
export { CuaWorld, type CuaWorldOptions } from './world.ts';
export type { Answer } from './engine-ipc.ts';
export type { ModelLanguage } from './model-text.ts';
