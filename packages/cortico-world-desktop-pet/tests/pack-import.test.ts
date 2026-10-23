import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PackImporter, filesFromBundle, filesFromZip, type ImportFile } from '../src/pack-import.ts';
import { figurePacks } from '../src/packs.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/api2-pack/', import.meta.url));
const fixture = (prefix: string): Record<string, Uint8Array> =>
  Object.fromEntries(readdirSync(FIXTURE).map((n) => [`${prefix}${n}`, new Uint8Array(readFileSync(join(FIXTURE, n)))]));

function importer() {
  const packDir = mkdtempSync(join(tmpdir(), 'figures-'));
  return { packDir, imp: new PackImporter({ packDir: () => packDir, packs: () => figurePacks([packDir]).packs }) };
}

/** The dressing page's framing of a folder's files (web/dress.js `bundle`). */
function bundle(files: Record<string, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    const name = new TextEncoder().encode(path);
    const head = new DataView(new ArrayBuffer(4));
    head.setUint32(0, name.length, true);
    const size = new DataView(new ArrayBuffer(4));
    size.setUint32(0, bytes.length, true);
    parts.push(new Uint8Array(head.buffer), name, new Uint8Array(size.buffer), bytes);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const read = (files: ImportFile[] | string): ImportFile[] => { if (typeof files === 'string') throw new Error(files); return files; };

describe('importing figure packs', () => {
  it('finds the packs in a zip some folders down, not a folder inside a pack, and installs the picked one under its id', async () => {
    const { imp, packDir } = importer();
    const whale = { ...JSON.parse(readFileSync(join(FIXTURE, 'figure.json'), 'utf8')), id: 'whale' };
    const zip = zipSync({
      ...fixture('repo-main/packs/fixture/'),
      'repo-main/packs/fixture/extra/figure.json': strToU8('{}'),
      ...fixture('repo-main/whale/'), 'repo-main/whale/figure.json': strToU8(JSON.stringify(whale)),
    });
    const staged = await imp.stage(read(filesFromZip(zip)), false);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs.map((p) => [p.dir, p.id, p.installed])).toEqual([['repo-main/packs/fixture', 'fixture-api2', null]]);
    expect(staged.packs[0]!.thumb).toMatch(/^data:image\/png;base64,/);
    expect(staged.problems).toEqual([{ dir: 'repo-main/whale', reason: expect.stringContaining('内置') }]);
    expect(await imp.install(staged.token, ['repo-main/packs/fixture'])).toEqual({ installed: ['fixture-api2'] });
    expect(figurePacks([packDir]).packs.find((p) => p.id === 'fixture-api2')?.dir).toBe(join(packDir, 'fixture-api2'));
  });

  it('preserves an installed pack until its replacement is approved, including a differently named folder', async () => {
    const { imp, packDir } = importer();
    await cp(FIXTURE, join(packDir, 'old-name'), { recursive: true });
    writeFileSync(join(packDir, 'old-name', 'kept.txt'), 'original');
    const staged = await imp.stage(read(filesFromBundle(bundle(fixture('picked/')))), true);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs.map((p) => [p.dir, p.installed])).toEqual([['picked', '1.0.0']]);
    expect(await imp.install(staged.token, ['picked'])).toEqual({ conflicts: ['fixture-api2'] });
    expect(await imp.install(staged.token, ['picked'], ['another-id'])).toEqual({ conflicts: ['fixture-api2'] });
    expect(readFileSync(join(packDir, 'old-name', 'kept.txt'), 'utf8')).toBe('original');
    expect(readdirSync(packDir)).toEqual(['old-name']);
    expect(await imp.install(staged.token, ['picked'], ['fixture-api2'])).toEqual({ installed: ['fixture-api2'] });
    expect(readdirSync(packDir)).toEqual(['fixture-api2']);
    expect(readFileSync(join(packDir, 'fixture-api2', 'figure.json'), 'utf8')).toBe(readFileSync(join(FIXTURE, 'figure.json'), 'utf8'));
  });

  it('refuses a path that climbs out', async () => {
    const { imp } = importer();
    const outside = join(tmpdir(), `climbed-${process.pid}.txt`);
    expect(await imp.stage([{ path: `../climbed-${process.pid}.txt`, bytes: strToU8('x') }], true)).toMatchObject({ error: expect.stringContaining('路径') });
    expect(existsSync(outside)).toBe(false);
  });

  it('checks all selected packs before writing and detects packs installed after staging', async () => {
    const { imp, packDir } = importer();
    const second = { ...JSON.parse(readFileSync(join(FIXTURE, 'figure.json'), 'utf8')), id: 'second-fixture' };
    const files = { ...fixture('one/'), ...fixture('two/'), 'two/figure.json': strToU8(JSON.stringify(second)) };
    const staged = await imp.stage(read(filesFromBundle(bundle(files))), true);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs.every((p) => p.installed === null)).toBe(true);
    await cp(FIXTURE, join(packDir, 'old-name'), { recursive: true });
    expect(await imp.install(staged.token, ['one', 'two'])).toEqual({ conflicts: ['fixture-api2'] });
    expect(readdirSync(packDir)).toEqual(['old-name']);
    await imp.cancel();
    expect(await imp.install(staged.token, ['one', 'two'], ['fixture-api2'])).toHaveProperty('error');
    expect(readdirSync(packDir)).toEqual(['old-name']);
  });

  it('requires approval before replacing an existing directory that is not a loadable pack', async () => {
    const { imp, packDir } = importer();
    const target = join(packDir, 'fixture-api2');
    mkdirSync(target);
    writeFileSync(join(target, 'kept.txt'), 'original');
    const staged = await imp.stage(read(filesFromBundle(bundle(fixture('picked/')))), true);
    if ('error' in staged) throw new Error(staged.error);
    expect(await imp.install(staged.token, ['picked'])).toEqual({ conflicts: ['fixture-api2'] });
    expect(readFileSync(join(target, 'kept.txt'), 'utf8')).toBe('original');
    expect(await imp.install(staged.token, ['picked'], ['fixture-api2'])).toEqual({ installed: ['fixture-api2'] });
    expect(existsSync(join(target, 'kept.txt'))).toBe(false);
  });

  it('consumes an installation token once when two installs arrive together', async () => {
    const { imp, packDir } = importer();
    const staged = await imp.stage(read(filesFromBundle(bundle(fixture('picked/')))), true);
    if ('error' in staged) throw new Error(staged.error);
    const [first, second] = await Promise.all([imp.install(staged.token, ['picked']), imp.install(staged.token, ['picked'])]);
    expect(first).toEqual({ installed: ['fixture-api2'] });
    expect(second).toHaveProperty('error');
    expect(figurePacks([packDir]).packs.some((p) => p.id === 'fixture-api2')).toBe(true);
  });
});
