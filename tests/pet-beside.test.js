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

describe('balancedWidth', () => {
  /** An element `text` wide on one line that wraps at its width (at most `max`), each line LINE high; jsdom lays nothing out. */
  const LINE = 20;
  function wrapping(text, max) {
    const el = doc.createElement('div');
    const width = () => Math.min(max, el.style.width ? parseFloat(el.style.width) : Infinity, text);
    Object.defineProperty(el, 'offsetWidth', { get: width });
    Object.defineProperty(el, 'offsetHeight', { get: () => Math.ceil(text / width()) * LINE });
    return el;
  }
  it('narrows a wrapped line to the least width that keeps its number of lines, and leaves its width as it was', async () => {
    const { balancedWidth } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
    const el = wrapping(100, 60);
    el.style.width = '7px';
    // 100 at 60 a line is two lines; two lines of 50 hold it (the search stops within a pixel, on the side that holds)
    const w = balancedWidth(el);
    expect(w).toBeGreaterThanOrEqual(50);
    expect(w).toBeLessThanOrEqual(51);
    expect(el.style.width).toBe('7px');
  });
  it('keeps a line that does not wrap as wide as its text', async () => {
    const { balancedWidth } = await import('../packages/cortico-world-desktop-pet/web/ui.js');
    expect(balancedWidth(wrapping(40, 60))).toBe(40);
  });
});
