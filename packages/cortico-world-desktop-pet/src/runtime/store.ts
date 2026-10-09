/**
 * Managed downloads: the FunASR speech model (SenseVoiceSmall int8 in sherpa-onnx's format) and
 * the Electron runtime that hosts the pet window when it runs outside an app. Every artifact is
 * pinned. Files land at `<CORTICO_HOME>/runtimes/<id>/<version>/` and
 * `<CORTICO_HOME>/models/desktop-pet/<model id>/`, are written to `.partial` first and renamed
 * into place when complete; model files are checked against their published SHA-256.
 *
 * The model is fetched from ModelScope first, which answers from mainland China, and from Hugging
 * Face when ModelScope does not; the files are the same (their SHA-256 match).
 *
 * Archives are unpacked with the system `tar` (bsdtar on Windows and macOS reads zip too);
 * Linux zips go through `unzip`.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { downloadFile, type DownloadOptions } from './download.ts';
import { petText, type PetText } from '../i18n/index.ts';

/** The words of the download steps, in the language at the time of each step. */
type StoreText = () => PetText['store'];

export type Phase = 'absent' | 'working' | 'ready' | 'error';

export interface ArtifactState {
  phase: Phase;
  /** Where the artifact lives (a directory for runtimes, a file for models). */
  path: string;
  done: number;
  total: number | null;
  detail: string | null;
}

const platformKey = (): string => `${process.platform}-${process.arch}`;

/** A model: its files with their sizes and SHA-256, and where to fetch them from, in order. */
export interface ModelSpec {
  id: string;
  /** `role` is what the recognizer loads the file as (`src/asr/sherpa.ts`). */
  files: ReadonlyArray<{ role: string; name: string; bytes: number; sha256: string }>;
  sources: ReadonlyArray<(file: string) => string>;
}

/** FunASR's SenseVoiceSmall, int8, as sherpa-onnx loads it (Apache-2.0 export by k2-fsa). */
export const FUNASR_MODEL: ModelSpec = {
  id: 'sensevoice-small-int8-2024-07-17',
  files: [
    { role: 'model', name: 'model.int8.onnx', bytes: 239_233_841, sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51' },
    { role: 'tokens', name: 'tokens.txt', bytes: 315_894, sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc' },
  ],
  /** Tried in order for each file. */
  sources: [
    (file: string) => `https://modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master/${file}`,
    (file: string) => `https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/${file}`,
  ],
};

export const ELECTRON_RUNTIME = {
  id: 'electron',
  version: '44.4.4',
  assets: {
    'win32-x64': { file: 'electron-v44.4.4-win32-x64.zip', bytes: 158_149_795 },
    'darwin-arm64': { file: 'electron-v44.4.4-darwin-arm64.zip', bytes: 130_390_806 },
    'darwin-x64': { file: 'electron-v44.4.4-darwin-x64.zip', bytes: 134_174_708 },
    'linux-x64': { file: 'electron-v44.4.4-linux-x64.zip', bytes: 122_970_570 },
  } as Record<string, { file: string; bytes: number }>,
  url: (file: string) => `https://github.com/electron/electron/releases/download/v44.4.4/${file}`,
  executable: process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron' : 'electron',
} as const;

/** Depth-first search for a file name under `dir`. */
export function findFile(dir: string, name: string, depth = 5): string | null {
  if (!existsSync(dir) || depth < 0) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.endsWith('.partial')) continue;
    const hit = findFile(join(dir, entry.name), name, depth - 1);
    if (hit) return hit;
  }
  return null;
}

function run(cmd: string, args: string[], cwd: string, t: PetText['store']): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(t.exitCode(cmd, code, err.trim().slice(0, 300))))));
  });
}

export async function extract(archive: string, into: string, t: PetText['store'] = petText().store): Promise<void> {
  mkdirSync(into, { recursive: true });
  if (process.platform === 'win32') {
    // bsdtar ships with Windows 10+; GNU tar earlier on PATH (Git's) cannot read zip
    const tar = resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    await run(tar, ['-xf', archive, '-C', into], into, t);
  } else if (archive.endsWith('.zip') && process.platform === 'linux') {
    await run('unzip', ['-q', '-o', archive, '-d', into], into, t);
  } else {
    await run('tar', ['-xf', archive, '-C', into], into, t);
  }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

interface Job { state: ArtifactState; promise: Promise<void> | null }

/** Tracks one runtime directory: present when its executable is found inside. */
class RuntimeSlot {
  private job: Job;
  constructor(
    private readonly root: () => string,
    private readonly spec: typeof ELECTRON_RUNTIME,
    private readonly text: StoreText,
    private readonly fetchImpl?: typeof fetch,
  ) {
    this.job = { state: { phase: 'absent', path: '', done: 0, total: null, detail: null }, promise: null };
  }

  get dir(): string {
    return join(this.root(), this.spec.id, this.spec.version);
  }

  get supported(): boolean {
    return platformKey() in this.spec.assets;
  }

  /** The executable inside the installed runtime, or null. */
  executable(): string | null {
    if (process.platform === 'darwin' && this.spec.id === 'electron') {
      const app = join(this.dir, 'Electron.app', 'Contents', 'MacOS', 'Electron');
      return existsSync(app) ? app : null;
    }
    return findFile(this.dir, this.spec.executable);
  }

  state(): ArtifactState {
    if (this.job.promise) return { ...this.job.state };
    const exe = this.executable();
    if (exe) return { phase: 'ready', path: this.dir, done: 0, total: null, detail: null };
    return { ...this.job.state, phase: this.job.state.phase === 'error' ? 'error' : 'absent', path: this.dir };
  }

  install(): Promise<void> {
    if (this.job.promise) return this.job.promise;
    const asset = this.spec.assets[platformKey()];
    if (!asset) {
      this.job.state = { phase: 'error', path: this.dir, done: 0, total: null, detail: this.text().noBuild(platformKey()) };
      return Promise.resolve();
    }
    this.job.state = { phase: 'working', path: this.dir, done: 0, total: asset.bytes, detail: this.text().downloading(asset.file) };
    const partial = `${this.dir}.partial`;
    const work = (async () => {
      rmSync(partial, { recursive: true, force: true });
      mkdirSync(partial, { recursive: true });
      const archive = join(partial, asset.file);
      const opts: DownloadOptions = { fetchImpl: this.fetchImpl, onProgress: (done, total) => { this.job.state.done = done; this.job.state.total = total ?? asset.bytes; } };
      await downloadFile(this.spec.url(asset.file), archive, opts);
      this.job.state.detail = this.text().unpacking;
      await extract(archive, partial, this.text());
      rmSync(archive, { force: true });
      writeFileSync(join(partial, 'cortico-runtime.json'), JSON.stringify({ id: this.spec.id, version: this.spec.version, source: this.spec.url(asset.file) }, null, 2));
      rmSync(this.dir, { recursive: true, force: true });
      renameSync(partial, this.dir);
      this.job.state = { phase: 'ready', path: this.dir, done: asset.bytes, total: asset.bytes, detail: null };
    })().catch((err: Error) => {
      rmSync(partial, { recursive: true, force: true });
      this.job.state = { phase: 'error', path: this.dir, done: 0, total: null, detail: err.message };
    }).finally(() => { this.job.promise = null; });
    this.job.promise = work;
    return work;
  }
}

/** A speech model: present when every file is there at its full size. */
class ModelSlot {
  private job: Job;
  readonly bytes: number;
  constructor(private readonly root: () => string, private readonly spec: ModelSpec, private readonly text: StoreText, private readonly fetchImpl?: typeof fetch) {
    this.bytes = spec.files.reduce((n, f) => n + f.bytes, 0);
    this.job = { state: { phase: 'absent', path: '', done: 0, total: null, detail: null }, promise: null };
  }

  get dir(): string {
    return join(this.root(), this.spec.id);
  }

  file(name: string): string {
    return join(this.dir, name);
  }

  /** Where each file lives, by role. */
  paths(): Record<string, string> {
    return Object.fromEntries(this.spec.files.map((f) => [f.role, this.file(f.name)]));
  }

  private has(f: { name: string; bytes: number }): boolean {
    const path = this.file(f.name);
    return existsSync(path) && statSync(path).size === f.bytes;
  }

  state(): ArtifactState {
    if (this.job.promise) return { ...this.job.state };
    if (this.spec.files.every((f) => this.has(f))) return { phase: 'ready', path: this.dir, done: this.bytes, total: this.bytes, detail: null };
    return { ...this.job.state, phase: this.job.state.phase === 'error' ? 'error' : 'absent', path: this.dir };
  }

  install(): Promise<void> {
    if (this.job.promise) return this.job.promise;
    this.job.state = { phase: 'working', path: this.dir, done: 0, total: this.bytes, detail: this.text().downloadingModel };
    const work = (async () => {
      mkdirSync(this.dir, { recursive: true });
      let before = 0;
      for (const f of this.spec.files) {
        if (this.has(f)) { before += f.bytes; this.job.state.done = before; continue; }
        const partial = `${this.file(f.name)}.partial`;
        const errors: string[] = [];
        for (const source of this.spec.sources) {
          const url = source(f.name);
          try {
            this.job.state.detail = this.text().downloadingFrom(f.name, new URL(url).host);
            await downloadFile(url, partial, { fetchImpl: this.fetchImpl, onProgress: (done) => { this.job.state.done = before + done; } });
            this.job.state.detail = this.text().verifying(f.name);
            const sum = await sha256File(partial);
            if (sum !== f.sha256) throw new Error(this.text().mismatch(sum.slice(0, 12)));
            renameSync(partial, this.file(f.name));
            break;
          } catch (err) {
            rmSync(partial, { force: true });
            errors.push(`${new URL(url).host}: ${(err as Error).message}`);
          }
        }
        if (!this.has(f)) throw new Error(this.text().failed(f.name, errors.join('; ')));
        before += f.bytes;
        this.job.state.done = before;
      }
      this.job.state = { phase: 'ready', path: this.dir, done: this.bytes, total: this.bytes, detail: null };
    })().catch((err: Error) => {
      this.job.state = { phase: 'error', path: this.dir, done: 0, total: null, detail: err.message };
    }).finally(() => { this.job.promise = null; });
    this.job.promise = work;
    return work;
  }
}

export interface RuntimeStoreOptions {
  runtimesRoot: () => string;
  modelsDir: () => string;
  fetchImpl?: typeof fetch;
  /** The speech model; tests pass a small one. */
  funasrModel?: ModelSpec;
  /** The text table of the app language, read at each step; Chinese when absent. */
  text?: () => PetText;
}

export class RuntimeStore {
  readonly electron: RuntimeSlot;
  readonly funasr: ModelSlot;

  constructor(opts: RuntimeStoreOptions) {
    const text = () => (opts.text?.() ?? petText()).store;
    this.electron = new RuntimeSlot(opts.runtimesRoot, ELECTRON_RUNTIME, text, opts.fetchImpl);
    this.funasr = new ModelSlot(opts.modelsDir, opts.funasrModel ?? FUNASR_MODEL, text, opts.fetchImpl);
  }
}
