/**
 * Loads the native parts of a packed app (scripts/pack.ts) in the Node that runs this file: esbuild, koffi and
 * sherpa-onnx, and on Windows the app's MinGit. The release workflow runs it on an Arm runner with the Windows on
 * Arm build's own Coopanion.exe, because that build is made on an x64 runner, which cannot start it.
 *
 * Run: `ELECTRON_RUN_AS_NODE=1 <unpacked app>/Coopanion.exe scripts/check-native.cjs <unpacked app>/resources/app <arch>`.
 * Prints one line per part and exits 1 when this Node is not of that architecture or a part fails.
 */
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');

const [dir, arch] = process.argv.slice(2);
if (!dir || !arch) {
  console.error('usage: check-native.cjs <app directory> <arch>');
  process.exit(2);
}
const app = resolve(dir);
const load = createRequire(join(app, 'package.json'));

const checks = {
  arch: () => {
    if (process.arch !== arch) throw new Error(`this Node is ${process.arch}, not ${arch}`);
    return `${process.platform}-${process.arch}, Node ${process.versions.node}`;
  },
  // starts the esbuild binary of this platform, as tsx does for the Core's sources
  esbuild: async () => (await load('esbuild').transform('const n: number = 1', { loader: 'ts' })).code.trim(),
  // one call through koffi into a system library
  koffi: () => {
    const koffi = load('koffi');
    if (process.platform !== 'win32') return `koffi ${koffi.version}`;
    const ticks = koffi.load('kernel32.dll').func('uint32_t GetTickCount()')();
    if (!(ticks > 0)) throw new Error(`GetTickCount returned ${ticks}`);
    return `koffi ${koffi.version}, GetTickCount ${ticks}`;
  },
  'sherpa-onnx': () => {
    const sherpa = load('sherpa-onnx-node');
    return `sherpa-onnx ${sherpa.version}, onnxruntime ${sherpa.onnxruntimeVersion}`;
  },
  ...process.platform === 'win32' ? { git: () => execFileSync(join(app, 'mingit', 'cmd', 'git.exe'), ['--version'], { encoding: 'utf8' }).trim() } : {},
};

(async () => {
  let failed = false;
  for (const [name, check] of Object.entries(checks)) {
    try {
      console.log(`ok   ${name}: ${await check()}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL ${name}: ${err && err.message ? err.message : err}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
