import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { setMotionChoice } from '../packages/cortico-world-desktop-pet/web/motion-level.js';
import { dragRow } from '../packages/cortico-world-desktop-pet/web/drag-row.js';

/**
 * The dressing page's favourites row in a window at `level`: tiles 80px wide, 8px apart, laid out by their order in
 * the row (jsdom has no layout); a tile's `shift` (px) stands for a slide it is in the middle of.
 */
function strip(level = 'high') {
  const { window } = new JSDOM('<!doctype html><html><body><div id="slot"><div class="looks-strip"></div></div></body></html>', { pretendToBeVisual: true });
  setMotionChoice(window, level);
  const doc = window.document, row = doc.querySelector('.looks-strip');
  for (const id of ['a', 'b', 'c', 'd']) { const t = doc.createElement('div'); t.className = 'look-tile'; t.dataset.id = id; row.append(t); }
  const animations = [];
  window.HTMLElement.prototype.animate = function (frames, opts) { animations.push([this.dataset.id, frames[0].transform, opts.duration]); return { id: opts.id, cancel() {} }; };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === row) return { left: 0, right: 400, top: 0, bottom: 90, width: 400, height: 90 };
    if (this.classList.contains('look-drag-copy')) { const left = parseFloat(this.style.left) || 0; return { left, right: left + 80, top: 0, bottom: 90, width: 80, height: 90 }; }
    const i = [...row.children].filter((el) => !el.classList.contains('look-drag-copy')).indexOf(this), left = i * 88 + (this.shift ?? 0);
    return { left, right: left + 80, top: 0, bottom: 90, width: 80, height: 90 };
  };
  const drops = [];
  dragRow(doc.querySelector('#slot'), { item: (t) => t.closest('.looks-strip > .look-tile'), key: (t) => t.dataset.id, copyClass: 'look-drag-copy', drop: (order) => drops.push(order) });
  const pointer = (type, target, x) => { const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 40, button: 0 }); Object.defineProperty(e, 'pointerId', { value: 1 }); target.dispatchEvent(e); };
  const tile = (id) => row.querySelector(`[data-id="${id}"]`);
  const order = () => [...row.children].filter((el) => !el.classList.contains('look-drag-copy')).map((el) => el.dataset.id);
  return { window, doc, row, tile, order, drops, animations, pointer };
}

describe('the favourites row drag', () => {
  it('moves the lifted tile past the middle of the tiles the pointer crosses, and reports the new order', () => {
    const s = strip();
    s.pointer('pointerdown', s.tile('a'), 40);
    s.pointer('pointermove', s.window, 50);
    expect(s.doc.documentElement.classList.contains('is-list-dragging')).toBe(true);
    expect(s.row.querySelector('.look-drag-copy')).toBeNull();
    expect(s.doc.querySelector('.look-drag-copy')).not.toBeNull();
    // past b's middle (88 + 40) and c's (176 + 40), short of d's (264 + 40)
    s.pointer('pointermove', s.window, 230);
    expect(s.order()).toEqual(['b', 'c', 'a', 'd']);
    // the tiles it passed slid aside
    expect(s.animations.map(([id]) => id)).toEqual(expect.arrayContaining(['b', 'c']));
    s.pointer('pointerup', s.window, 230);
    expect(s.drops).toEqual([['b', 'c', 'a', 'd']]);
    expect(s.doc.querySelector('.look-drag-copy')).toBeNull();
    expect(s.doc.documentElement.classList.contains('is-list-dragging')).toBe(false);
  });

  it('reports nothing when the order is the same', () => {
    const s = strip();
    s.pointer('pointerdown', s.tile('b'), 120);
    s.pointer('pointermove', s.window, 126);
    s.pointer('pointerup', s.window, 126);
    expect(s.drops).toEqual([]);
  });

  it('slides the tile and the tiles it passed back where they were on Esc', () => {
    const s = strip();
    s.pointer('pointerdown', s.tile('a'), 40);
    s.pointer('pointermove', s.window, 230);
    expect(s.order()).toEqual(['b', 'c', 'a', 'd']);
    s.animations.length = 0;
    s.doc.dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(s.order()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.animations).toEqual(expect.arrayContaining([['a', 'translateX(176px)', 180], ['b', 'translateX(-88px)', 180], ['c', 'translateX(-88px)', 180]]));
    expect(s.drops).toEqual([]);
  });

  it('moves without sliding at low motion', () => {
    const s = strip('low');
    s.pointer('pointerdown', s.tile('a'), 40);
    s.pointer('pointermove', s.window, 230);
    s.pointer('pointerup', s.window, 230);
    expect(s.drops).toEqual([['b', 'c', 'a', 'd']]);
    expect(s.animations).toEqual([]);
  });

  it('places the gap by where the tiles settle, not where a slide shows them', () => {
    const s = strip();
    s.window.getComputedStyle = () => ({ transform: 'matrix(1, 0, 0, 1, -60, 0)' });
    s.window.DOMMatrixReadOnly = class { constructor() { this.m41 = -60; this.m42 = 0; } };
    // b shows 60px to the left of where it settles (its middle at 68 instead of 128): a pointer at 100 has not passed it
    s.tile('b').shift = -60;
    s.pointer('pointerdown', s.tile('a'), 40);
    s.pointer('pointermove', s.window, 100);
    expect(s.order()).toEqual(['a', 'b', 'c', 'd']);
  });
});
