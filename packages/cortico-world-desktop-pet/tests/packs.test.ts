import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PACKS, figurePacks, lookOf, lookPatch, readManifest, scanPacks } from '../src/packs.ts';

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

  it('refuses a file path holding markup characters', () => {
    const markup = 't.png"><iframe src="x.html"></iframe>';
    expect(readManifest(pack({ ...base, thumb: markup }))).toMatch(/thumb/);
    const axis = { id: 'tone', name: { zh: '色调' }, options: [{ id: 'day', name: { zh: '白天' }, thumb: markup }] };
    expect(readManifest(pack({ ...base, axes: [axis] }))).toMatch(/day/);
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

  it('with a built-in pack\'s directory left out of the app, an installed pack with its id loads in its place', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    mkdirSync(join(root, '3401'));
    writeFileSync(join(root, '3401', 'figure.json'), JSON.stringify({ ...base, id: 'whale' }));
    const builtin = BUILTIN_PACKS.map((b) => (b.base === '/web/whale/' ? { ...b, dir: join(root, 'not-shipped') } : b));
    const { packs, problems } = scanPacks(builtin, [root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => [p.id, p.builtin, p.base])).toEqual([['coo', true, '/web/coo/'], ['whale', false, '/packs/whale/']]);
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
    expect(m).toMatchObject({ id: 'fixture-api2', api: 2, entry: 'figure.js', export: 'createFixtureBody', model: 'model.json', thumb: 'thumb.png', can: { walk: true }, moves: [], needs: [] });
    expect(m.vocab.map((w) => [w.id, w.kind, w.lasting ?? false])).toEqual([['happy', 'expression', false], ['sit', 'motion', true], ['salute', 'motion', false]]);
    expect(m.sounds).toEqual({ beep: { file: 'beep.wav', kind: 'touch', volume: .5 } });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['tone', ['day', 'night']]]);
    expect(m.presets).toMatchObject([{ id: 'dusk', pick: { tone: 'night' }, accent: '#996633' }]);
  });

  it("reads a pack's own move targets and the desktop data it asks for, leaving out data this version does not provide", () => {
    const skipped: string[] = [];
    const shelf = { id: 'shelf', name: { zh: '书架顶' }, about: { zh: '跳上书架' }, params: [{ id: 'height', about: { zh: '跳多高' }, min: 0, max: 1 }] };
    const m = readManifest(pack({ ...base, needs: ['windows', 'weather'], moves: [shelf] }), false, skipped);
    if (typeof m === 'string') throw new Error(m);
    expect(m.needs).toEqual(['windows']);
    expect(m.moves).toEqual([shelf]);
    expect(skipped).toHaveLength(1);
    // a default target's name or a number would never reach the pack; a number without bounds is not a parameter
    for (const id of ['left', 'cursor', '0.5']) expect(readManifest(pack({ ...base, moves: [{ ...shelf, id }] }))).toMatch(/moves/);
    expect(readManifest(pack({ ...base, moves: [{ ...shelf, params: [{ id: 'height', about: { zh: '跳多高' }, min: 1, max: 1 }] }] }))).toMatch(/params/);
    expect(readManifest(pack({ ...base, moves: [{ ...shelf, params: [1, 2, 3].map((i) => ({ id: `p${i}`, about: { zh: '量' }, min: 0, max: 1 })) }] }))).toMatch(/params/);
  });

  it("reads a pack's voice, how far its effects reach and its bubbles' colours, leaving out values out of range or incomplete", () => {
    const colours = { light: { fill: '#ffffff', text: '#111111', line: '#222222' }, dark: { fill: '#000000', text: '#eeeeee', line: '#dddddd' } };
    const m = readManifest(pack({
      ...base, voice: { pitch: 1.5 }, effects: { reach: .5 }, bubble: colours,
      presets: [{ id: 'dusk', pick: {}, bubble: colours }, { id: 'dawn', pick: {}, bubble: { ...colours, dark: { fill: '#000' } } }],
      sounds: { la: { file: 'la.ogg', kind: 'talk' } },
    }, ['la.ogg']));
    if (typeof m === 'string') throw new Error(m);
    expect(m).toMatchObject({ voice: { pitch: 1.5 }, effects: { reach: .5 }, bubble: colours, sounds: { la: { kind: 'talk' } } });
    expect(m.presets.map((p) => p.bubble)).toEqual([colours, undefined]);
    const off = readManifest(pack({ ...base, voice: { pitch: 9 }, effects: { reach: 5 }, bubble: { light: colours.light } }));
    if (typeof off === 'string') throw new Error(off);
    expect(off).toMatchObject({ voice: { pitch: 1 }, effects: { reach: 0 } });
    expect(off.bubble).toBeUndefined();
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
