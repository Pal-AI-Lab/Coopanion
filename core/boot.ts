/**
 * Entry of the Core child process (run with `--import tsx`). Registers the `cortico/*` resolver
 * of the staged Cortico copy before anything imports it, points `<Cortico>/extensions` at the
 * per-user extensions directory, then starts `companion.ts`.
 *
 * Environment: `CORTICO_HOME` (deployments root) and `CORTICO_COMPANION_EXTENSIONS` (npm-installed
 * Worlds and providers; survives app reinstalls) are set by the Electron main process.
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = fileURLToPath(new URL('../', import.meta.url));
const CORTICO = process.env.CORTICO_COMPANION_ROOT ?? join(APP, 'build', 'cortico');
if (!existsSync(join(CORTICO, 'src', 'core'))) {
  console.error(`没有找到 Cortico:${CORTICO}(开发时先运行 pnpm run build:cortico)`);
  process.exit(2);
}
process.env.CORTICO_HOME ??= join(APP, 'build', 'home');

const userExtensions = process.env.CORTICO_COMPANION_EXTENSIONS;
const linked = join(CORTICO, 'extensions');
const link = lstatOrNull(linked);
if (userExtensions) {
  const target = resolve(userExtensions);
  mkdirSync(target, { recursive: true });
  if (link?.isSymbolicLink() && resolve(readlinkSync(linked)) !== target) unlinkSync(linked);
  // a directory junction needs no elevation on Windows
  if (!lstatOrNull(linked)) symlinkSync(target, linked, 'junction');
} else if (!link) {
  mkdirSync(linked, { recursive: true });
}

function lstatOrNull(path: string) {
  try { return lstatSync(path); } catch { return null; }
}

await import(pathToFileURL(join(CORTICO, 'src', 'extensions', 'runtime.ts')).href);
const { main } = await import('./companion.ts');
await main();
