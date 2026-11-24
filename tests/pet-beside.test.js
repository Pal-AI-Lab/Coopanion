import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { layBeside } from '../packages/cortico-world-desktop-pet/web/ui.js';

const doc = new JSDOM('').window.document;
/** A grid of buttons `w` wide; jsdom lays nothing out, so the width is given. */
const grid = (w) => Object.defineProperty(doc.createElement('div'), 'offsetWidth', { value: w });

describe('buttons laid beside the body', () => {
  it('go on the right, `reach` out from the body, with their columns left to right while they fit there', () => {
    const el = grid(100);
    expect(layBeside(el, 500, 60, 1000)).toBe(true);
    expect([el.style.left, el.style.direction]).toEqual(['560px', '']);
  });

  it('go on the left near the right edge with their columns mirrored, and drop the mirroring back on the right', () => {
    const el = grid(100);
    expect(layBeside(el, 900, 60, 1000)).toBe(false);
    expect([el.style.left, el.style.direction]).toEqual(['740px', 'rtl']);
    layBeside(el, 500, 60, 1000);
    expect(el.style.direction).toBe('');
  });
});

it("draws a tail's line as wide as the border is drawn: whole device pixels of the 2.5px border, at least one", async () => {
  const { BUBBLE_BORDER, tailLine } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
  expect(tailLine(1)).toBe(Math.floor(BUBBLE_BORDER));
  expect(tailLine(2)).toBe(BUBBLE_BORDER);
  expect(tailLine(1.25) * 1.25).toBe(Math.floor(BUBBLE_BORDER * 1.25));
  expect(tailLine(.25)).toBe(4);
});

it("keeps a tail's base on a bubble's straight bottom edge, off the rounded corners, at any bubble size", async () => {
  const { TAIL_EDGE, tailAt } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
  const css = readFileSync(new URL('../packages/cortico-world-desktop-pet/web/pet.css', import.meta.url), 'utf8');
  const unit = (re) => Number(css.match(re)?.[1]);
  // pet.css: the corner's radius, the narrowest bubble, and the tail's base either side of its tip, all at size 1
  const radius = unit(/\.bubble\{[^}]*border-radius:calc\((\d+(?:\.\d+)?)px \* var\(--bubble-size/);
  const narrowest = unit(/\.bubble\{[^}]*min-width:calc\((\d+(?:\.\d+)?)px \* var\(--bubble-size/);
  const base = 11 - unit(/\.bubble::before\{[^}]*path\('M(\d+(?:\.\d+)?) /);
  expect(TAIL_EDGE - base).toBeGreaterThanOrEqual(radius);
  expect(narrowest).toBeGreaterThanOrEqual(2 * TAIL_EDGE);
  for (const size of [.8, 1, 1.6]) {
    // Coo past either side of a wide bubble: the tip stops short of the corner
    expect(tailAt(300, -50, size)).toBeCloseTo(TAIL_EDGE * size);
    expect(tailAt(300, 400, size)).toBeCloseTo(300 - TAIL_EDGE * size);
    // in between, it sits over Coo; the narrowest bubble points from its middle
    expect(tailAt(300, 150, size)).toBe(150);
    expect(tailAt(narrowest * size, 0, size)).toBeCloseTo(narrowest * size / 2);
  }
});

describe('balancedWidth', () => {
  /** An element `text` wide on one line that wraps at its width (at most `max`), each line LINE high; jsdom lays nothing out. */
  const LINE = 20;
  function wrapping(text, max) {
    const el = doc.createElement('div');
    const px = (v) => (v ? parseFloat(v) : Infinity);
    const width = () => Math.min(max, px(el.style.width), px(el.style.maxWidth), text);
    Object.defineProperty(el, 'offsetWidth', { get: width });
    Object.defineProperty(el, 'offsetHeight', { get: () => Math.ceil(text / width()) * LINE });
    return el;
  }
  it('narrows a wrapped line to the least width that keeps its number of lines, and leaves its width as it was', async () => {
    const { balancedWidth } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
    const el = wrapping(100, 60);
    el.style.width = '7px';
    el.style.maxWidth = '9px';
    // 100 at 60 a line is two lines; two lines of 50 hold it (the search stops within a pixel, on the side that holds)
    const w = balancedWidth(el);
    expect(w).toBeGreaterThanOrEqual(50);
    expect(w).toBeLessThanOrEqual(51);
    expect([el.style.width, el.style.maxWidth]).toEqual(['7px', '9px']);
  });
  it('keeps a line that does not wrap as wide as its text', async () => {
    const { balancedWidth } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
    expect(balancedWidth(wrapping(40, 60))).toBe(40);
  });
  it('holds a line whose width offsetWidth rounds down: checked as a max-width, it grows past the rounded width', async () => {
    const { balancedWidth } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
    // 40.4 wide: offsetWidth says 40, and at 40 the line wraps
    const el = doc.createElement('div');
    const px = (v) => (v ? parseFloat(v) : Infinity);
    const laid = () => Math.min(60, px(el.style.width), px(el.style.maxWidth), 40.4);
    Object.defineProperty(el, 'offsetWidth', { get: () => Math.floor(laid()) });
    Object.defineProperty(el, 'offsetHeight', { get: () => Math.ceil(40.4 / laid() - 1e-9) * 20 });
    expect(balancedWidth(el)).toBe(41);
  });
});
