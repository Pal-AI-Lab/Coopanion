import { describe, expect, it } from 'vitest';
import { springSize, swapIn, swapOut } from '../packages/cortico-world-desktop-pet/web/swap-motion.js';

describe('the drawn size on a spring', () => {
  /** Steps `s` at 60 frames a second for `seconds`; the largest value it passed through. */
  function run(s, seconds) {
    let top = s.value;
    for (let t = 0; t < seconds; t += 1 / 60) { s.step(1 / 60); top = Math.max(top, s.value); }
    return top;
  }

  it('reaches a new size within half a second and rests exactly on it', () => {
    const s = springSize(1);
    s.set(2);
    const top = run(s, .5);
    expect(s.value).toBe(2);
    // a little past it on the way, so a large change lands with some life
    expect(top).toBeGreaterThan(2);
    expect(top).toBeLessThan(2.1);
    expect(s.step(1 / 60)).toBe(false);
  });
});

describe('a figure switch at another size', () => {
  /** A body whose frame window records the animation run on it, on a stage that moves freely. */
  function body(scale) {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    const el = { getBoundingClientRect: () => rect, animate(frames) { this.frames = frames; return { finished: new Promise(() => {}) }; } };
    return { el, scale, layout: { box: { x: 380, y: 400, w: 40 * scale, h: 50 * scale } }, setHalo() {}, dispose() {} };
  }
  const stage = { getBoundingClientRect: () => ({ left: 0, top: 0 }), ownerDocument: { defaultView: { matchMedia: () => ({ matches: false }) } } };
  const scaleOf = (frame) => Number(/scale\(([\d.]+)\)/.exec(frame.transform)[1]);

  it('draws the body going and the body coming at the same size on screen at every step', () => {
    const old = body(1), next = body(2), ratio = next.scale / old.scale;
    swapOut(old, stage, ratio);
    swapIn(next, stage, next.layout, ratio);
    expect(old.el.frames.map((f) => f.offset)).toEqual(next.el.frames.map((f) => f.offset));
    old.el.frames.forEach((f, i) => expect(scaleOf(f) * old.scale).toBeCloseTo(scaleOf(next.el.frames[i]) * next.scale, 3));
    // from the old size to the new one
    expect(scaleOf(old.el.frames[0]) * old.scale).toBe(old.scale);
    expect(scaleOf(next.el.frames.at(-1)) * next.scale).toBe(next.scale);
  });
});
