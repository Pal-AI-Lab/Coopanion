import { describe, expect, it } from 'vitest';
import { createPet, createSfx, EXPRESSIONS, FACES, figure, MOTIONS, STAND, defaultSkin } from '../packages/cortico-world-desktop-pet/web/pet-core.js';
import { VOCAB } from '../packages/cortico-world-desktop-pet/src/script.ts';

/** A pet with no page under it: the elements and the sound only take calls. */
function barePet(onEvent) {
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const sfx = new Proxy({}, { get: () => () => {} });
  const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx, onEvent, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
  pet.resize();
  return pet;
}
const run = (pet, seconds) => { for (let i = 0; i < seconds * 60; i++) { pet.step(1 / 60); pet.render(); } };

describe('the words the model can use', () => {
  it('match what the body knows, both ways', () => {
    const words = kind => VOCAB.filter(v => v.kind === kind).map(v => v.id).sort();
    expect(words('expression')).toEqual([...EXPRESSIONS].sort());
    expect(words('motion')).toEqual([...MOTIONS].sort());
  });

  it('every expression has a face Coo can draw', () => {
    for (const n of EXPRESSIONS) {
      const fc = FACES[n].f(.5);
      expect(fc.eyes).toHaveLength(2);
      expect(figure(fc, { look: fc.lookAt || [0, 0], legs: STAND, low: 0, t: .5, blink: 0, acc: defaultSkin() })).toContain('class="eye"');
    }
  });

  it('every motion is one the body takes, and plays out without getting stuck', () => {
    for (const m of MOTIONS) {
      const pet = barePet();
      run(pet, 1);
      if (m !== 'walk' && m !== 'run') expect(pet.act(m), m).toBe(true);
      run(pet, 5);
      // everything but sitting and sleeping ends back on its feet
      if (m !== 'sit' && m !== 'sleep' && m !== 'walk' && m !== 'run') expect(pet.pet.mode, m).toBe('idle');
    }
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

  it('looking about is silenced with the motion sounds', () => {
    // look borrows the 'hmm' tone, which belongs to no kind: watch it to see whether look played
    const played = [];
    const sfx = createSfx({ storageKey: 'test.sfx' });
    sfx.hmm = () => played.push('hmm');
    sfx.configure({ kinds: { move: false } });
    sfx.look();
    expect(played).toEqual([]);
    sfx.configure({ kinds: { move: true } });
    sfx.look();
    expect(played).toEqual(['hmm']);
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
