import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { setMotionChoice } from '../packages/cortico-world-desktop-pet/web/motion-level.js';
import { slideFrom } from '../console/base/motion.ts';

/** An element in a window at `level` whose animate() calls are recorded. */
function at(level) {
  const { window } = new JSDOM('<!doctype html><html><body><div></div></body></html>');
  setMotionChoice(window, level);
  const el = window.document.querySelector('div');
  const calls = [];
  el.animate = (frames, opts) => { calls.push({ frames, opts }); return { finished: Promise.resolve() }; };
  return { el, calls };
}

describe('slideFrom', () => {
  it('slides from the offset at full motion, as translateY along one axis', () => {
    const { el, calls } = at('high');
    slideFrom([[el, 0, 40]], { duration: 180, axis: 'y' });
    expect(calls).toEqual([{ frames: [{ transform: 'translateY(40px)' }, { transform: 'none' }], opts: { duration: 180 } }]);
    slideFrom([[el, 3, 4]]);
    expect(calls[1].frames[0].transform).toBe('translate(3px, 4px)');
  });

  it('below full motion slides, jumps or fades as asked', () => {
    for (const [medium, expected] of [['slide', 'translateX(10px)'], ['fade', 0], ['jump', undefined]]) {
      const { el, calls } = at('medium');
      slideFrom([[el, 10, 0]], { axis: 'x', medium });
      expect(calls[0]?.frames[0].transform ?? calls[0]?.frames[0].opacity).toBe(expected);
    }
  });

  it('does nothing at low motion or for an element that did not move', () => {
    const low = at('low');
    expect(slideFrom([[low.el, 0, 40]])).toEqual([undefined]);
    expect(low.calls).toEqual([]);
    const still = at('high');
    expect(slideFrom([[still.el, 0, 0]])).toEqual([undefined]);
  });
});
