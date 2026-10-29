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

  it('a frame that took no time leaves the swing a number', () => {
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

/** Runs `fn(made)` over a Web Audio that counts the tones and clips started (`made.rates`: the clips' playback rates). */
async function withAudio(fn) {
  const made = { tones: 0, clips: 0, rates: [] };
  const node = () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {} });
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8; this.destination = {}; }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { made.tones++; return node(); }
    createBufferSource() {
      made.clips++;
      const rate = { set value(v) { made.rates.push(v); } };
      return { ...node(), playbackRate: rate };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
    decodeAudioData() { return Promise.resolve({}); }
  }
  const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: { AudioContext: Ctx }, document: { hidden: false }, location: { href: 'http://127.0.0.1/' }, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) });
  try {
    await fn(made);
  } finally {
    Object.assign(globalThis, saved);
  }
}

describe('what the page holds a pack to', () => {
  it("a body's sounds are muted with the kind they are filed under, a pack's own with its manifest's kind", () => withAudio(async (made) => {
    const sfx = createSfx({ storageKey: 'test.sfx' });
    sfx.unlock();
    sfx.usePack('/packs/robot/', { boing: { file: 'boing.ogg', kind: 'move', volume: 1 } });
    await new Promise((r) => setTimeout(r, 0));
    sfx.configure({ kinds: { move: false } });
    // looking about borrows the 'hmm' tone, which belongs to no kind; the pack's boing is a move sound whatever the body files it under
    sfx.play('look', 'move'); sfx.play('boing', 'face');
    expect(made).toMatchObject({ tones: 0, clips: 0 });
    sfx.configure({ kinds: { move: true, face: false } });
    // a face that borrows the ui tone 'pop' is a face sound
    sfx.play('pop', 'face');
    expect(made.tones).toBe(0);
    sfx.play('boing', 'face'); sfx.play('look', 'move');
    expect(made.clips).toBe(1);
    expect(made.tones).toBeGreaterThan(0);
    // a hidden window plays nothing, though its page still reads as visible
    const before = { ...made };
    sfx.setShown(false);
    sfx.play('boing', 'move'); sfx.play('look', 'move'); sfx.pop();
    expect(made).toEqual(before);
  }));

  it("a pack's voice babbles with its own talk sounds at its pitch, muted with the talk kind; without them the tone babbles", () => withAudio(async (made) => {
    const sfx = createSfx({ storageKey: 'test.sfx' });
    sfx.unlock();
    sfx.usePack('/packs/robot/', { la: { file: 'la.ogg', kind: 'talk', volume: 1 } }, { pitch: 1.5 });
    await new Promise((r) => setTimeout(r, 0));
    sfx.babble('a');
    expect(made).toMatchObject({ tones: 0, clips: 1 });
    expect(made.rates[0]).toBeCloseTo(1.5, 0);
    sfx.configure({ kinds: { talk: false } });
    sfx.babble('a');
    expect(made.clips).toBe(1);
    sfx.configure({ kinds: { talk: true } });
    sfx.usePack('/packs/robot/', {}, { pitch: 1.5 });
    sfx.babble('a');
    expect(made).toMatchObject({ tones: 1, clips: 1 });
  }));

  it("a body's box is kept to the stage and to the most the kit stretches a body", () => {
    const size = { W: 1000, H: 600, S: .5 };
    const l = readLayout({ box: { x: -5000, y: -5000, w: 1e6, h: 1e6 }, hit: [{ x: 500, y: 300, r: 1e6 }], bubble: { x: -50, y: 9e9 } }, size);
    // a 256-unit square at S .5 is 128 pixels: no box past 1.5 × √2 of that
    expect(l.box.w).toBeLessThanOrEqual(128 * 1.5 * Math.SQRT2);
    expect(l.box.h).toBeLessThanOrEqual(128 * 1.5 * Math.SQRT2);
    expect(l.bubble).toEqual({ x: 0, y: 600 });
  });

  it("the halo blurs only the body's surroundings, not the whole stage", () => {
    const size = { W: 1470, H: 859, S: .42 };
    const l = readLayout({ box: { x: 970, y: 745, w: 120, h: 114 } }, size);
    // 40% of the box each side, cut off at the floor
    expect(haloRect(l, size)).toEqual({ x: 922, y: 699, w: 216, h: 160 });
    // a small body still gets the drop shadows' full reach, and the rect never leaves the stage
    expect(haloRect(readLayout({ box: { x: 2, y: 10, w: 20, h: 20 } }, size), size)).toEqual({ x: 0, y: 0, w: 46, h: 54 });
    expect(haloRect(readLayout({ box: { x: 10, y: 10, w: 0, h: 0 } }, size), size)).toBe(null);
    expect(haloRect(null, size)).toBe(null);
    // a wider glow (the 外发光 setting) needs a wider window: three times its reach, at least the default's
    const small = readLayout({ box: { x: 100, y: 100, w: 20, h: 20 } }, size);
    expect(haloRect(small, size)).toEqual({ x: 76, y: 76, w: 68, h: 68 });
    expect(haloRect(small, size, 16)).toEqual({ x: 52, y: 52, w: 116, h: 116 });
    // a pack whose effects reach one 256-unit square past its box (107.52 px at this scale) gets that much room
    const mid = readLayout({ box: { x: 300, y: 300, w: 20, h: 20 } }, size);
    expect(haloRect(mid, size, 7, 1)).toEqual({ x: 192, y: 192, w: 236, h: 236 });
  });

  it("a body's height is kept only when it gives one", () => {
    const size = { W: 1000, H: 600, S: .5 };
    expect(readLayout({ x: 10, y: 9e9, box: {} }, size).y).toBe(600);
    expect(readLayout({ x: 10, box: {} }, size)).not.toHaveProperty('y');
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

describe('a body that stands anywhere on the stage (ground: free)', () => {
  it('walks to a point above the floor, says how far down it got, and stays there through a jump', () => {
    const events = [];
    const pet = barePet((kind, d) => events.push({ kind, d }), { ground: 'free' });
    expect(pet.layout().y).toBe(380);
    pet.walkTo(300, false, 7, 200);
    run(pet, 10);
    // a walk ends within 1.5 px of its target
    const got = events.find((e) => e.kind === 'arrived')?.d;
    expect(got).toMatchObject({ walkId: 7 });
    expect(Math.hypot(got.x - 300, got.y - 200)).toBeLessThan(2);
    pet.act('jump');
    run(pet, 2);
    expect(pet.pet.fy).toBeCloseTo(200, 0);
    expect(pet.layout().y).toBeCloseTo(200, 0);
  });

  it('is set down where it is let go of, not dropped to the floor', () => {
    const pet = barePet(undefined, { ground: 'free' });
    run(pet, .5);
    const { W, H } = pet.bounds;
    let on = null;
    for (let y = 0; y < H && !on; y += 4) for (let x = 0; x < W && !on; x += 4) if (pet.hitPet({ x, y })) on = { x, y };
    pet.pointerDown({ ...on, t: 0 });
    const up = { x: on.x + 60, y: on.y - 150 };
    // a slow carry, held still before letting go: no throw
    for (let t = 20; t <= 600; t += 20) { pet.pointerMove({ x: on.x + 60 * Math.min(1, t / 300), y: on.y - 150 * Math.min(1, t / 300), t }); pet.step(1 / 50); pet.render(); }
    pet.pointerUp({ ...up, t: 620 });
    run(pet, 2);
    expect(['idle', 'land', 'look']).toContain(pet.pet.mode);
    expect(pet.pet.gy).toBeLessThan(380 - 50);
    expect(pet.pet.fy).toBeCloseTo(pet.pet.gy, 0);
  });

  it('a body on the floor walks along it whatever height it is asked for, and says none', () => {
    const events = [];
    const pet = barePet((kind, d) => events.push({ kind, d }));
    pet.walkTo(300, false, 8, 200);
    run(pet, 10);
    const got = events.find((e) => e.kind === 'arrived')?.d;
    expect(got).toMatchObject({ walkId: 8 });
    expect(got).not.toHaveProperty('y');
    expect(pet.pet.fy).toBe(380);
    expect(pet.layout()).not.toHaveProperty('y');
  });

  it("the figure hears what the bot is busy with from its frame", () => {
    const pet = barePet(), seen = [];
    pet.setFigure({ draw: (g, face, o) => seen.push(o.status) });
    pet.setStatus('read');
    run(pet, .1);
    expect(seen.at(-1)).toBe('read');
    pet.setStatus(null);
    run(pet, .1);
    expect(seen.at(-1)).toBe(null);
  });
});

describe('picking the body up', () => {
  it('a body falling through the air is held as soon as a press lands on it, and falls on when let go of', () => {
    const pet = barePet(undefined, { enter: 'drop' });
    run(pet, .25);
    expect(pet.pet.mode).toBe('air');
    const { W, H } = pet.bounds;
    let on = null;
    for (let y = 0; y < H && !on; y += 4) for (let x = 0; x < W && !on; x += 4) if (pet.hitPet({ x, y })) on = { x, y };
    expect(pet.pointerDown({ ...on, t: 0 })).toBe(true);
    expect(pet.pet.mode).toBe('drag');
    run(pet, 1);
    expect(pet.pet.mode).toBe('drag');
    pet.pointerUp({ ...on, t: 1000 });
    expect(pet.pet.mode).toBe('air');
    run(pet, 3);
    expect(['idle', 'look', 'dizzy']).toContain(pet.pet.mode);
  });
});
