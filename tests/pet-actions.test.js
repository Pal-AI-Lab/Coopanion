import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPet, FACES, KIT_EXPRESSIONS, KIT_MOTIONS, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { cooFigure, defaultSkin, figure } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { createSfx } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { haloRect, readLayout, touchGate } from '../packages/cortico-world-desktop-pet/web/body-host.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const vocabOf = (pack) => JSON.parse(readFileSync(new URL(`web/${pack}/figure.json`, PKG), 'utf8')).vocab;

/** A pet with no page under it: the elements and the sound only take calls. */
function barePet(onEvent, opts = {}) {
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const sfx = { play() {} };
  const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx, onEvent, figure: cooFigure(), skin: defaultSkin(), roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }), ...opts });
  pet.resize();
  return pet;
}
const run = (pet, seconds) => { for (let i = 0; i < seconds * 60; i++) { pet.step(1 / 60); pet.render(); } };

describe('the words the model can use', () => {
  it('Coo and the whale do every word of their vocabularies on the kit, and the kit does no word they leave out', () => {
    for (const pack of ['coo', 'whale']) {
      const words = (kind) => vocabOf(pack).filter((v) => v.kind === kind).map((v) => v.id).sort();
      expect(words('expression'), pack).toEqual([...KIT_EXPRESSIONS].sort());
      expect(words('motion'), pack).toEqual([...KIT_MOTIONS].sort());
    }
  });

  it('automatic thinking drops the thought trail only while the page shows the thought, and explicit thinking keeps the rings', () => {
    const pet = barePet(), frames = [];
    pet.setFigure({ draw: (g, face, o) => frames.push({ face, name: o.face }) });
    run(pet, 1);
    pet.setThinking(true);
    run(pet, .2);
    expect(frames.at(-1)).toMatchObject({ name: 'thinking', face: { think: true } });
    pet.setThoughtShown(true);
    run(pet, .2);
    expect(frames.at(-1)).toMatchObject({ name: 'thinking', face: { think: false } });
    pet.setThinking(false);
    pet.doWord('thinking');
    run(pet, .2);
    expect(frames.at(-1)).toMatchObject({ name: 'thinking', face: { think: true } });
  });

  it('every expression has a face Coo can draw', () => {
    for (const n of KIT_EXPRESSIONS) {
      const fc = FACES[n].f(.5);
      expect(fc.eyes).toHaveLength(2);
      expect(figure(fc, { look: fc.lookAt || [0, 0], legs: STAND, low: 0, t: .5, blink: 0, acc: defaultSkin() })).toContain('class="eye"');
    }
  });

  it('every motion is one the body takes, and plays out without getting stuck', () => {
    for (const m of KIT_MOTIONS) {
      const pet = barePet();
      run(pet, 1);
      expect(pet.doWord(m), m).toBe(true);
      run(pet, 5);
      // everything but sitting and sleeping ends back on its feet
      if (m !== 'sit' && m !== 'sleep' && m !== 'walk' && m !== 'run') expect(pet.pet.mode, m).toBe('idle');
    }
  });

  it('a frame that took no time leaves the swing a number (#87: the whale lost her hair, tail and skirt for good)', () => {
    const pet = barePet();
    run(pet, 1);
    pet.doWord('sleep');
    run(pet, 1);
    pet.step(0);
    run(pet, 1);
    expect(Number.isFinite(pet.pet.swing)).toBe(true);
  });

  it('a walk asked for as a word reports done once it stops, so the next word need not wait out its seconds', () => {
    const events = [];
    const pet = barePet((kind, d) => events.push([kind, d.word]));
    run(pet, 1);
    pet.doWord('walk');
    run(pet, 12);
    expect(events).toContainEqual(['done', 'walk']);
  });

  it('a motion that stops an ordered walk reports the walk as interrupted', () => {
    for (const m of ['bow', 'turn', 'spin']) {
      const events = [];
      const pet = barePet((kind, d) => events.push([kind, d.walkId]));
      run(pet, 1);
      pet.walkTo(100, false, 'w1');
      run(pet, .3);
      pet.act(m);
      expect(events, m).toContainEqual(['interrupted', 'w1']);
    }
  });

  it("a pack's own expression borrows a kit face's marks, and its own motion is a gesture its figure draws", () => {
    const frames = [];
    const pet = barePet(undefined, { words: { facepalm: { expression: { like: 'worried' } }, salute: { motion: { seconds: 1.2 } } } });
    pet.setFigure({ draw: (g, face, o) => frames.push({ face, o }) });
    run(pet, 1);
    expect(pet.doWord('facepalm')).toBe(true);
    run(pet, .2);
    expect(frames.at(-1).o.face).toBe('facepalm');
    expect(frames.at(-1).face.sweat).toBe(true);
    expect(pet.doWord('salute')).toBe(true);
    run(pet, .5);
    expect(frames.at(-1).o.gesture.kind).toBe('salute');
    expect(pet.doWord('fly')).toBe(false);
  });

  it('a figure that draws a gesture itself takes it whole from the frame, and the body leaves it out', () => {
    const pet = barePet(), frames = [];
    pet.setFigure({ gestures: ['nod'], draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    pet.act('nod');
    run(pet, .35);
    const o = frames.at(-1);
    expect(o.gesture.kind).toBe('nod');
    expect(o.gesture.k).toBeGreaterThan(.3);
    expect(Math.abs(o.lean)).toBeLessThan(.01);
    run(pet, 1);
    expect(frames.at(-1).gesture).toBeNull();
  });
});

describe('what the page holds a pack to', () => {
  it("a body's sounds are muted with the kind they are filed under, a pack's own with its manifest's kind", async () => {
    const made = { tones: 0, clips: 0 };
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {} });
    class Ctx {
      constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8; this.destination = {}; }
      createGain() { return node(); }
      createDynamicsCompressor() { return node(); }
      createBiquadFilter() { return node(); }
      createOscillator() { made.tones++; return node(); }
      createBufferSource() { made.clips++; return node(); }
      createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
      decodeAudioData() { return Promise.resolve({}); }
    }
    const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
    Object.assign(globalThis, { window: { AudioContext: Ctx }, document: { hidden: false }, location: { href: 'http://127.0.0.1/' }, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) });
    try {
      const sfx = createSfx({ storageKey: 'test.sfx' });
      sfx.unlock();
      sfx.usePack('/packs/robot/', { boing: { file: 'boing.ogg', kind: 'move', volume: 1 } });
      await new Promise((r) => setTimeout(r, 0));
      sfx.configure({ kinds: { move: false } });
      // looking about borrows the 'hmm' tone, which belongs to no kind; the pack's boing is a move sound whatever the body files it under
      sfx.play('look', 'move'); sfx.play('boing', 'face');
      expect(made).toEqual({ tones: 0, clips: 0 });
      sfx.configure({ kinds: { move: true, face: false } });
      // a face that borrows the ui tone 'pop' is a face sound
      sfx.play('pop', 'face');
      expect(made.tones).toBe(0);
      sfx.play('boing', 'face'); sfx.play('look', 'move');
      expect(made.clips).toBe(1);
      expect(made.tones).toBeGreaterThan(0);
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  it("a body's box is kept to the stage and to the most the kit stretches a body", () => {
    const size = { W: 1000, H: 600, S: .5 };
    const l = readLayout({ box: { x: -5000, y: -5000, w: 1e6, h: 1e6 }, hit: [{ x: 500, y: 300, r: 1e6 }], bubble: { x: -50, y: 9e9 } }, size);
    // a 256-unit square at S .5 is 128 pixels: no box past 1.5 × √2 of that
    expect(l.box.w).toBeLessThanOrEqual(128 * 1.5 * Math.SQRT2);
    expect(l.box.h).toBeLessThanOrEqual(128 * 1.5 * Math.SQRT2);
    expect(l.bubble).toEqual({ x: 0, y: 600 });
  });

  it("the halo blurs only the body's surroundings, not the whole stage (#86: the whale kept a Mac's GPU busy)", () => {
    const size = { W: 1470, H: 859, S: .42 };
    const l = readLayout({ box: { x: 970, y: 745, w: 120, h: 114 } }, size);
    // 40% of the box each side, cut off at the floor
    expect(haloRect(l, size)).toEqual({ x: 922, y: 699, w: 216, h: 160 });
    // a small body still gets the drop shadows' full reach, and the rect never leaves the stage
    expect(haloRect(readLayout({ box: { x: 2, y: 10, w: 20, h: 20 } }, size), size)).toEqual({ x: 0, y: 0, w: 46, h: 54 });
    expect(haloRect(readLayout({ box: { x: 10, y: 10, w: 0, h: 0 } }, size), size)).toBe(null);
    expect(haloRect(null, size)).toBe(null);
  });

  it('a touch counts only right after pointer input, a crash only after a throw', () => {
    const gate = touchGate();
    expect(gate.take('pet', 0)).toBe(false);
    gate.input(100);
    expect(gate.take('poke', 300)).toBe(true);
    expect(gate.take('pet', 5000)).toBe(false);
    expect(gate.take('crash', 5000)).toBe(false);
    gate.input(6000);
    expect(gate.take('throw', 6100)).toBe(true);
    expect(gate.take('crash', 7500)).toBe(true);
    expect(gate.take('crash', 7600)).toBe(false);
  });
});
