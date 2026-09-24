/**
 * Entry of the Core child process (run with `--import tsx`). Registers the `cortico/*` resolver
 * of the staged Cortico copy before anything imports it, then starts `companion.ts`.
 *
 * Environment: `CORTICO_HOME` (deployments root) and `CORTICO_EXTENSIONS_DIR` (npm-installed
 * Worlds and providers, kept in the data directory so they survive app reinstalls and never write
 * into the program, which is read-only in a macOS .app) are set by the Electron main process.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = fileURLToPath(new URL('../', import.meta.url));
const CORTICO = process.env.CORTICO_COMPANION_ROOT ?? join(APP, 'build', 'cortico');
if (!existsSync(join(CORTICO, 'src', 'core'))) {
  console.error(`没有找到 Cortico:${CORTICO}(开发时先运行 pnpm run build:cortico)`);
  process.exit(2);
}
process.env.CORTICO_HOME ??= join(APP, 'build', 'home');
process.env.CORTICO_EXTENSIONS_DIR ??= join(APP, 'build', 'data', 'extensions');

await import(pathToFileURL(join(CORTICO, 'src', 'extensions', 'runtime.ts')).href);
const { main } = await import('./companion.ts');
await main();
