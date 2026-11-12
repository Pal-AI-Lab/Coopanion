import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { scaleSlider as petSlider } from '../packages/cortico-world-desktop-pet/web/scale-slider.js';
import { scaleSlider as consoleSlider } from '../console/features/pet/scale-slider.ts';

/** Both copies of the size slider: the pet's pages' and the settings window's, with their own class names. */
const copies = [
  { name: 'the pet pages’ slider', make: petSlider, thumb: '.ps-thumb', main: '.ps-main' },
  { name: 'the settings window’s slider', make: consoleSlider, thumb: '.cs-thumb', main: '.cs-main' },
];

const wins = [];
afterEach(() => { for (const w of wins.splice(0)) w.close(); });

function setup(make) {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const win = dom.window;
  wins.push(win);
  // the slider runs in the page's globals: its frames
  globalThis.requestAnimationFrame = (cb) => win.requestAnimationFrame(cb);
  const s = make(win.document, { min: .5, soft: 2, max: 10, label: '', room: () => 600, onInput() {}, onChange() {} });
  // the bar stands at the page's left edge: a pointer's clientX is its x on the bar
  s.el.getBoundingClientRect = () => ({ left: 0, top: 0 });
  s.el.setPointerCapture = () => {};
  win.document.body.append(s.el);
  // as a real drag: the button is held from the press until the release
  const pointer = (type, x) => s.el.dispatchEvent(new win.MouseEvent(type, { clientX: x, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
  return { s, pointer };
}
const widthOf = (el) => parseFloat(el.style.width);

describe.each(copies)('$name, dragged past the divider', ({ make, thumb, main }) => {
  it('keeps the thumb under the pointer and the main stretch as it was', () => {
    const { s, pointer } = setup(make);
    s.set(1);
    const mainBefore = widthOf(s.el.querySelector(main));
    pointer('pointerdown', 100);
    // values snap to steps (.05 below the divider, a step there being the widest): the thumb is at most half a step away
    const halfStep = mainBefore / ((2 - .5) / .05) / 2;
    for (const x of [200, mainBefore + 2, mainBefore + 60, mainBefore + 150]) {
      pointer('pointermove', x);
      expect(Math.abs(parseFloat(s.el.querySelector(thumb).style.left) - x)).toBeLessThanOrEqual(halfStep);
    }
    expect(s.value).toBeGreaterThan(2);
    expect(widthOf(s.el.querySelector(main))).toBeCloseTo(mainBefore, 5);
    pointer('pointerup', mainBefore + 150);
    expect(s.active).toBe(false);
  });
});

describe.each(copies)('$name, let go where the page does not hear it', ({ make }) => {
  it('ends the drag when the page loses the pointer, or a move comes with no button down', () => {
    for (const how of ['lostpointercapture', 'move']) {
      const { s, pointer } = setup(make);
      pointer('pointerdown', 100);
      expect(s.active).toBe(true);
      if (how === 'lostpointercapture') pointer('lostpointercapture', 100);
      else s.el.dispatchEvent(new s.el.ownerDocument.defaultView.MouseEvent('pointermove', { clientX: 120, buttons: 0, bubbles: true }));
      expect(s.active).toBe(false);
    }
  });
});

describe('the pet pages’ slider, stepped by the wheel', () => {
  it('shows the knob held while the steps come, as a drag does, and lets it go a moment after the last', async () => {
    const { s } = setup(petSlider);
    s.set(1);
    s.nudge(1);
    expect(s.el.classList.contains('stepping')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    s.nudge(1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    // 400 ms after the first step, 200 after the last: still held
    expect(s.el.classList.contains('stepping')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(s.el.classList.contains('stepping')).toBe(false);
    expect(s.value).toBeCloseTo(1.1, 5);
  });
});

describe('the pet pages’ slider, stepped past the divider by the wheel', () => {
  it('widens over time even when the page sets the size it just stepped to', () => {
    const { s } = setup(petSlider);
    s.set(2);
    const before = widthOf(s.el);
    s.nudge(1);
    // the pet page echoes each step back through set()
    s.set(s.value);
    expect(s.value).toBeCloseTo(2.1, 5);
    expect(widthOf(s.el)).toBeCloseTo(before, 0);
  });
});
