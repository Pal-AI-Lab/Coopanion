import { describe, expect, it } from 'vitest';
import { springSize } from '../packages/cortico-world-desktop-pet/web/swap-motion.js';

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

  it('jumps without moving through the sizes between', () => {
    const s = springSize(1);
    s.jump(3);
    expect(s.value).toBe(3);
    expect(s.step(1 / 60)).toBe(false);
  });
});
