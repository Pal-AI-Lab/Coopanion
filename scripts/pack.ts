/**
 * Assembles `build/app/`, the directory electron-builder packages, then runs electron-builder.
 *
 * The workspace's pnpm layout (symlinked packages) is not what an installed app should carry, so
 * the app directory is built flat: the app code, the staged Cortico copy, a `package.json` with
 * only the runtime dependencies installed by npm, and the three workspace packages copied into
 * `node_modules/` as real directories.
 *
 * Run: `pnpm run build:installer` (builds build/cortico first). Output: `dist/CortiCompanion-Setup-<version>.exe` on
 * Windows, `dist/CortiCompanion-<version>-mac-<arch>.dmg` and `.zip` on a Mac. `PACK_ARCH` (x64 or arm64) builds for
 * another architecture than the machine's: npm installs that architecture's native packages (esbuild, sherpa-onnx) and
 * electron-builder packs that Electron, so one Apple silicon Mac builds both Mac downloads.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'build', 'app');
const run = (cmd: string, args: string[], cwd: string) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const ARCH = process.env.PACK_ARCH || process.arch;
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown> & { version: string };
const WORKSPACE = ['cortico-world-desktop-pet', 'cortico-world-cua', 'cortico-provider-deepseek'];
/** Runtime dependencies: Core (express, ws), the TypeScript loader, pnpm for extension installs, and the workspace packages' own. */
const DEPS: Record<string, string> = { express: '^4.22.3', ws: '^8.21.3', tsx: '^4.23.15', pnpm: '11.5.0' };
for (const name of WORKSPACE) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', name, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  Object.assign(DEPS, pkg.dependencies ?? {});
}

const skip = (base: string) => (src: string) => {
  const rel = relative(base, src).split(sep);
  // the top-level extensions/ of the staged Cortico is a junction to the developer's own data
  if (rel[0] === 'extensions') return false;
  return !rel.some((p) => ['node_modules', '.git', 'tests', 'scratch'].includes(p));
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'app'), join(OUT, 'app'), { recursive: true });
cpSync(join(ROOT, 'core'), join(OUT, 'core'), { recursive: true });
cpSync(join(ROOT, 'build', 'cortico'), join(OUT, 'build', 'cortico'), { recursive: true, filter: skip(join(ROOT, 'build', 'cortico')) });
writeFileSync(join(OUT, 'package.json'), JSON.stringify({
  name: rootPkg.name, productName: rootPkg.productName, version: rootPkg.version, description: rootPkg.description,
  license: rootPkg.license, author: rootPkg.author, homepage: rootPkg.homepage, type: 'module', main: 'app/main.cjs',
  dependencies: DEPS,
}, null, 2));
run('npm', ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--loglevel=error', `--os=${process.platform}`, `--cpu=${ARCH}`], OUT);
const manifest = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
for (const name of WORKSPACE) {
  const from = join(ROOT, 'packages', name);
  cpSync(from, join(OUT, 'node_modules', name), { recursive: true, filter: skip(from) });
  // listed only now: npm must not fetch them, but electron-builder ships only listed dependencies
  manifest.dependencies[name] = (JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')) as { version: string }).version;
}
writeFileSync(join(OUT, 'package.json'), JSON.stringify(manifest, null, 2));
console.log(`app directory ready: ${relative(ROOT, OUT)}`);

const target = process.platform === 'darwin' ? '--mac' : '--win';
run(join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'), [target, `--${ARCH}`, '--publish', 'never', ...process.argv.slice(2)], ROOT);
