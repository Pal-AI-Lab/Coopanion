import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { figurePacks, lookOf, lookPatch, readManifest } from '../src/packs.ts';

function pack(manifest: Record<string, unknown>, files: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  writeFileSync(join(dir, 'figure.json'), JSON.stringify(manifest));
  for (const f of files) writeFileSync(join(dir, f), '');
  return dir;
}
const word = { id: 'beep', kind: 'motion', names: { zh: ['哔'] }, about: { zh: '亮一下灯' }, seconds: 1 };
const base = { manifest: 2, api: 2, id: 'robot', name: { zh: '机器人' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [], vocab: [word] };

describe('figure packs', () => {
  it('reads the built-in Coo and whale', () => {
    const { packs, problems } = figurePacks([]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale']);
  });

  it('refuses a pack whose files lie outside it', () => {
    expect(readManifest(pack({ ...base, entry: '../../web/pet-app.js' }))).toMatch(/entry/);
    expect(readManifest(pack({ ...base, model: 'C:/secrets.json' }))).toMatch(/model/);
    expect(readManifest(pack({ ...base, sounds: { boing: { file: '../boing.ogg', kind: 'move' } } }))).toMatch(/sounds/);
  });

  it('a built-in id is not taken over by an installed pack, Coo\'s included', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    for (const id of ['whale', 'coo']) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'figure.json'), JSON.stringify({ ...base, id }));
    }
    const { packs, problems } = figurePacks([root]);
    expect(packs.filter((p) => p.id === 'whale' || p.id === 'coo').map((p) => p.builtin)).toEqual([true, true]);
    expect(problems).toHaveLength(2);
  });

  it('refuses a word name a script could never write: a marker\'s separator in it, longer than an inline marker, or naming two words', () => {
    expect(readManifest(pack({ ...base, vocab: [{ ...word, names: { zh: ['哔 哔'] } }] }))).toMatch(/名字/);
    expect(readManifest(pack({ ...base, vocab: [{ ...word, names: { zh: ['哔'.repeat(33)] } }] }))).toMatch(/名字/);
    expect(readManifest(pack({ ...base, vocab: [word, { ...word, id: 'boop' }] }))).toMatch(/不止一个词/);
  });

  it('loads a pack without what this version does not know (a sound\'s kind or file type, a word\'s kind) and without a sound file that is not there', () => {
    const skipped: string[] = [];
    const m = readManifest(pack({
      ...base,
      vocab: [word, { ...word, id: 'pose', kind: 'pose', names: { zh: ['摆姿势'] } }],
      sounds: {
        boing: { file: 'boing.ogg', kind: 'move' }, chime: { file: 'chime.ogg', kind: 'ui' },
        hum: { file: 'hum.flac', kind: 'move' }, clunk: { file: 'clunk.wav', kind: 'touch' },
      },
    }, ['boing.ogg', 'chime.ogg', 'hum.flac']), false, skipped);
    if (typeof m === 'string') throw new Error(m);
    expect(Object.keys(m.sounds)).toEqual(['boing']);
    expect(m.vocab.map((w) => w.id)).toEqual(['beep']);
    expect(skipped).toHaveLength(4);
  });

  it('reads the frozen api 2 pack as it was published (tests/fixtures/api2-pack)', () => {
    const skipped: string[] = [];
    const m = readManifest(fileURLToPath(new URL('./fixtures/api2-pack/', import.meta.url)), false, skipped);
    if (typeof m === 'string') throw new Error(m);
    expect(skipped).toEqual([]);
    expect(m).toMatchObject({ id: 'fixture-api2', api: 2, entry: 'figure.js', export: 'createFixtureBody', model: 'model.json', thumb: 'thumb.png', can: { walk: true } });
    expect(m.vocab.map((w) => [w.id, w.kind, w.lasting ?? false])).toEqual([['happy', 'expression', false], ['sit', 'motion', true], ['salute', 'motion', false]]);
    expect(m.sounds).toEqual({ beep: { file: 'beep.wav', kind: 'touch', volume: .5 } });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['tone', ['day', 'night']]]);
    expect(m.presets).toMatchObject([{ id: 'dusk', pick: { tone: 'night' }, accent: '#996633' }]);
  });

  it('says a pack made for a newer manifest or contract needs the app updated', () => {
    expect(readManifest(pack({ ...base, manifest: 3 }))).toMatch(/更新应用/);
    expect(readManifest(pack({ ...base, api: 3 }))).toMatch(/更新应用/);
  });

  it('Coo\'s pick is its skin\'s own fields, a pack\'s is the scheme', () => {
    const { packs } = figurePacks([]);
    const coo = packs.find((p) => p.id === 'coo')!, whale = packs.find((p) => p.id === 'whale')!;
    const skin = { scheme: 'deepseek', palette: 'fox', head: 'cat', side: 'none', glasses: 'round', neck: 'none' };
    expect(lookOf(coo, skin)).toBe('fox-cat-none-round-none');
    expect(lookPatch(coo, 'mint-none-bow-none-bell')).toEqual({ palette: 'mint', head: 'none', side: 'bow', glasses: 'none', neck: 'bell' });
    expect(lookOf(whale, skin)).toBe('deepseek');
    expect(lookPatch(whale, 'claude')).toEqual({ scheme: 'claude' });
  });
});
