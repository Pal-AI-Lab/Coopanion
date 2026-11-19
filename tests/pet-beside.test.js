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
