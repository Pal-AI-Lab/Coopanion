/** Package entry: the default export is the `WorldDefinition`; the loader recognizes it by `cortico.kind === 'world'`. */
import { BILISCRIPT } from './definition.ts';

export default BILISCRIPT;
export { BILISCRIPT };
export { BiliScriptWorld, BILISCRIPT_TOOL_DECLS } from './world.ts';
export type { BiliScriptConfigSection } from './config.ts';
