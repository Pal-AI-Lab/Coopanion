/**
 * Installing figure packs from the dressing page (web/dress.js). The page sends a zip, or the files of the
 * folders it found a pack in; they are unpacked into a staging directory, every pack there is read as an
 * installed one would be (src/packs.ts), and the person picks which to install. Installing copies a pack to
 * `<packDir>/<id>/`, in place of an installed pack with that id; a built-in id is refused.
 *
 * A pack is a directory holding `figure.json`, found at most `PACK_DEPTH` levels below what was picked (the
 * zip's root, a picked or dropped folder: a zip from GitHub wraps its files in `<repo>-<branch>/`, and a
 * repository may keep its pack in a folder of its own). The search does not go into a pack.
 */
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { unzipSync } from 'fflate';
import { MANIFEST_FILE, readManifest, type FigurePack, type Names } from './packs.ts';

export const PACK_DEPTH = 3;
/**
 * The most an import may hold, unpacked or not: the request and the unpacked files are in memory at once while it is
 * staged. The largest pack shipped, the whale, is 12 MB.
 */
export const IMPORT_MAX = 128 * 1024 * 1024;
/** The page's own framing of a folder's files (`filesFromBundle`). */
export const BUNDLE_TYPE = 'application/x-figure-files';
/** A thumbnail bigger than this is left out of the list sent to the page, which shows the pack without one. */
const THUMB_MAX = 1024 * 1024;
const IMAGE: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export interface ImportFile { path: string; bytes: Uint8Array }

/** A pack found in what was sent, as the page lists it for the person to pick. */
export interface StagedPack {
  /** Where it was found, `/`-separated, '' for the root of what was sent. */
  dir: string;
  id: string;
  name: Names;
  version: string;
  author: string | null;
  credits: Array<{ role: string; name: string }>;
  /** A data URL of its thumbnail. */
  thumb: string | null;
  axes: number;
  words: number;
  sounds: number;
  /** Parts of it this version leaves out (src/packs.ts `readManifest`). */
  skipped: string[];
  /** The version of the installed pack it would replace. */
  installed: string | null;
}

export interface StageResult {
  token: string;
  packs: StagedPack[];
  /** Directories with a `figure.json` that cannot be installed, and why. */
  problems: Array<{ dir: string; reason: string }>;
}

/** A path inside what was sent: its segments, or null when it is empty, absolute, or climbs out. */
function segments(path: string): string[] | null {
  const parts = path.split(/[\\/]/).filter((p) => p !== '' && p !== '.');
  if (!parts.length || /^[a-z]:/i.test(path) || path.startsWith('/') || path.startsWith('\\')) return null;
  return parts.some((p) => p === '..' || /[<>:"|?*\u0000-\u001f]/.test(p)) ? null : parts;
}

/** The files of a zip, its directories left out; a string says why it cannot be read. */
export function filesFromZip(bytes: Uint8Array): ImportFile[] | string {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      // sizes as the zip states them; what was unpacked is counted again below
      filter: (f) => { total += f.originalSize; return !f.name.endsWith('/') && total <= IMPORT_MAX; },
    });
  } catch (err) {
    return `这不是能读的 zip:${(err as Error).message}`;
  }
  if (total > IMPORT_MAX) return `解开后超过 ${IMPORT_MAX / 1048576} MB`;
  const files = Object.entries(entries).map(([path, data]) => ({ path, bytes: data }));
  if (files.reduce((n, f) => n + f.bytes.length, 0) > IMPORT_MAX) return `解开后超过 ${IMPORT_MAX / 1048576} MB`;
  return files;
}

/**
 * The files the page framed (`BUNDLE_TYPE`): for each, the byte length of its path as uint32 little-endian, the
 * path in UTF-8, the byte length of its contents as uint32, the contents.
 */
export function filesFromBundle(bytes: Uint8Array): ImportFile[] | string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  const files: ImportFile[] = [];
  let at = 0;
  while (at < bytes.length) {
    if (at + 4 > bytes.length) return '上传的内容不完整';
    const pathLen = view.getUint32(at, true); at += 4;
    if (at + pathLen + 4 > bytes.length) return '上传的内容不完整';
    const path = text.decode(bytes.subarray(at, at + pathLen)); at += pathLen;
    const size = view.getUint32(at, true); at += 4;
    if (at + size > bytes.length) return '上传的内容不完整';
    files.push({ path, bytes: bytes.subarray(at, at + size) });
    at += size;
  }
  return files;
}

/** The directories under `root` holding a figure.json, `depth` levels down at most, not looking inside one. */
async function findPacks(root: string, depth: number, rel = ''): Promise<string[]> {
  const here = join(root, ...rel.split('/').filter(Boolean));
  const entries = await readdir(here, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === MANIFEST_FILE)) return [rel];
  if (depth === 0) return [];
  const found: string[] = [];
  for (const e of entries) if (e.isDirectory()) found.push(...await findPacks(root, depth - 1, rel ? `${rel}/${e.name}` : e.name));
  return found;
}

async function thumbOf(dir: string, file: string | undefined): Promise<string | null> {
  const type = file ? IMAGE[extname(file).toLowerCase()] : undefined;
  if (!file || !type) return null;
  try {
    const full = join(dir, file);
    if ((await stat(full)).size > THUMB_MAX) return null;
    return `data:${type};base64,${(await readFile(full)).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Whether `dir` is a directory inside `root` (not `root` itself). */
const within = (root: string, dir: string) => normalize(dir).startsWith(normalize(root).replace(/[\\/]+$/, '') + sep);

/**
 * One import at a time: staging a new one drops the one before. `packDir` is where packs are installed (one of
 * the World's pack roots); `packs` the packs as the World scans them, built-in ones first.
 */
export class PackImporter {
  private staged: { token: string; root: string; packs: StagedPack[] } | null = null;

  constructor(private readonly opts: { packDir: () => string; packs: () => FigurePack[] }) {}

  /** Unpacks `files` into a staging directory and reads the packs in it; `fromFolders`: each file's path starts with the folder picked. */
  async stage(files: ImportFile[], fromFolders: boolean): Promise<StageResult | { error: string }> {
    await this.cancel();
    const root = await mkdtemp(join(tmpdir(), 'figure-import-'));
    try {
      for (const f of files) {
        const parts = segments(f.path);
        if (!parts) { await rm(root, { recursive: true, force: true }); return { error: `有一个路径不能用:${f.path}` }; }
        await mkdir(join(root, ...parts.slice(0, -1)), { recursive: true });
        await writeFile(join(root, ...parts), f.bytes);
      }
      const dirs = await findPacks(root, PACK_DEPTH + (fromFolders ? 1 : 0));
      const installed = this.opts.packs();
      const packs: StagedPack[] = [];
      const problems: StageResult['problems'] = [];
      for (const dir of dirs) {
        const full = join(root, ...dir.split('/').filter(Boolean));
        const skipped: string[] = [];
        const m = readManifest(full, false, skipped);
        if (typeof m === 'string') { problems.push({ dir, reason: m }); continue; }
        const same = installed.find((p) => p.id === m.id);
        if (same?.builtin) { problems.push({ dir, reason: `id ${m.id} 是内置形象的,换个 id 才能导入` }); continue; }
        if (packs.some((p) => p.id === m.id)) { problems.push({ dir, reason: `id ${m.id} 和这次导入的另一个形象包重复` }); continue; }
        packs.push({
          dir, id: m.id, name: m.name, version: m.version, author: m.author ?? null,
          credits: (m.credits ?? []).filter((c) => typeof c?.role === 'string' && typeof c?.name === 'string').map(({ role, name }) => ({ role, name })),
          thumb: await thumbOf(full, m.thumb), axes: m.axes.length, words: m.vocab.length, sounds: Object.keys(m.sounds).length,
          skipped, installed: same ? same.manifest.version : null,
        });
      }
      if (!packs.length) await rm(root, { recursive: true, force: true });
      else this.staged = { token: randomUUID(), root, packs };
      return { token: this.staged?.token ?? '', packs, problems };
    } catch (err) {
      await rm(root, { recursive: true, force: true });
      return { error: `没能解开:${(err as Error).message}` };
    }
  }

  /** Installs the staged packs found at `dirs`; resolves to their ids. */
  async install(token: string, dirs: readonly string[]): Promise<{ installed: string[] } | { error: string }> {
    const staged = this.staged;
    if (!staged || staged.token !== token) return { error: '这次导入已经过期,请重新选择' };
    const chosen = staged.packs.filter((p) => dirs.includes(p.dir));
    if (!chosen.length) return { error: '没有选要导入的形象包' };
    const packDir = this.opts.packDir();
    await mkdir(packDir, { recursive: true });
    const installed = this.opts.packs();
    for (const p of chosen) {
      // the pack it replaces may sit in a folder named otherwise; one in another pack root is left alone
      const old = installed.find((x) => x.id === p.id && !x.builtin && within(packDir, x.dir));
      if (old) await rm(old.dir, { recursive: true, force: true });
      const target = join(packDir, p.id);
      await rm(target, { recursive: true, force: true });
      await cp(join(staged.root, ...p.dir.split('/').filter(Boolean)), target, { recursive: true });
    }
    await this.cancel();
    return { installed: chosen.map((p) => p.id) };
  }

  /** Drops the staged import, if any. */
  async cancel(): Promise<void> {
    const staged = this.staged;
    this.staged = null;
    if (staged) await rm(staged.root, { recursive: true, force: true });
  }
}
