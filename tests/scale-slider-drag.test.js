import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { scaleSlider } from '../packages/cortico-world-desktop-pet/web/scale-slider.js';

/** The slider as the pet's pages make it, and as the settings window does: its own root class, the same parts. */
const pages = [
  { name: 'the pet pages’ slider', root: 'pet-scale', extra: {} },
  { name: 'the settings window’s slider', root: 'companion-scale', extra: { className: 'companion-scale' } },
];
const thumb = '.ps-thumb', main = '.ps-main';

const wins = [];
afterEach(() => { for (const w of wins.splice(0)) w.close(); });

function setup(extra = {}, options = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const win = dom.window;
  wins.push(win);
  // the slider runs in the page's globals: its frames
  globalThis.requestAnimationFrame = (cb) => win.requestAnimationFrame(cb);
  const s = scaleSlider(win.document, { min: .5, soft: 2, max: 10, label: '', room: () => 600, onInput() {}, onChange() {}, ...extra, ...options });
  // the bar stands at the page's left edge: a pointer's clientX is its x on the bar
  s.el.getBoundingClientRect = () => ({ left: 0, top: 0 });
  s.el.setPointerCapture = () => {};
  win.document.body.append(s.el);
  // as a real drag: the button is held from the press until the release
  const pointer = (type, x) => s.el.dispatchEvent(new win.MouseEvent(type, { clientX: x, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
  return { s, pointer };
}
const widthOf = (el) => parseFloat(el.style.width);

describe.each(pages)('$name, dragged past the divider', ({ root, extra }) => {
  it('keeps the thumb under the pointer and the main stretch as it was', () => {
    const { s, pointer } = setup(extra);
    expect(s.el.className).toBe(root);
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

describe.each(pages)('$name, let go where the page does not hear it', ({ extra }) => {
  it('ends the drag when the page loses the pointer, or a move comes with no button down', () => {
    for (const how of ['lostpointercapture', 'move']) {
      const { s, pointer } = setup(extra);
      pointer('pointerdown', 100);
      expect(s.active).toBe(true);
      if (how === 'lostpointercapture') pointer('lostpointercapture', 100);
      else s.el.dispatchEvent(new s.el.ownerDocument.defaultView.MouseEvent('pointermove', { clientX: 120, buttons: 0, bubbles: true }));
      expect(s.active).toBe(false);
    }
  });
});

describe('the slider, stepped by the wheel', () => {
  it('shows the knob held while the steps come, as a drag does, and lets it go a moment after the last', async () => {
    const { s } = setup();
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

describe('the slider, stepped past the divider by the wheel', () => {
  it('widens over time even when the page sets the size it just stepped to', () => {
    const { s } = setup();
    s.set(2);
    const before = widthOf(s.el);
    s.nudge(1);
    // the pet page echoes each step back through set()
    s.set(s.value);
    expect(s.value).toBeCloseTo(2.1, 5);
    expect(widthOf(s.el)).toBeCloseTo(before, 0);
  });
});

describe('a value set from outside', () => {
  it('opens at rest with the first, and moves the bar as a step does for a later one, on every page', () => {
    for (const { extra } of pages) {
      const { s } = setup(extra);
      const narrow = widthOf(s.el);
      // the value the page opens with, past the divider: the bar is drawn widened at once
      s.set(3);
      const wide = widthOf(s.el);
      expect(wide).not.toBeCloseTo(narrow, 0);
      // a size set elsewhere later, back under the divider: the bar narrows over time, not at once
      s.set(1);
      expect(s.value).toBe(1);
      expect(widthOf(s.el)).toBeCloseTo(wide, 0);
    }
  });
});

describe('one plain stretch (soft at max), as the settings window’s 外发光 and 音量', () => {
  const plain = { min: 0, soft: 100, max: 100, step: 1, format: (v) => `${v}%` };

  it('has no divider or tail, steps by `step`, and reads the value its own way', () => {
    const { s } = setup(pages[1].extra, plain);
    expect(s.el.querySelector('.ps-tail').hidden).toBe(true);
    expect(s.el.querySelector('.ps-divider').hidden).toBe(true);
    s.set(40);
    s.el.dispatchEvent(new s.el.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(s.value).toBe(41);
    expect(s.el.getAttribute('aria-valuetext')).toBe('41%');
  });

  it('takes a drag past the bar’s end as its end', () => {
    const { s, pointer } = setup(pages[1].extra, plain);
    s.set(10);
    pointer('pointerdown', 5000);
    expect(s.value).toBe(100);
    pointer('pointerup', 5000);
  });
});
