// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderActivity } from '../console/features/cost/activity.ts';
import { createUsageTip } from '../console/features/cost/tooltip.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';

let life;
afterEach(() => { life?.dispose(); document.body.replaceChildren(); });

/** Two weeks ending on Sunday 2026-11-15, every day with tokens; jsdom has no layout, so the grid gets a 2-column, 7-row box of 12px cells and 3px gaps. */
function mountGrid() {
  life = new Lifecycle((err) => { throw err; });
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  const box = document.createElement('div');
  Object.defineProperty(box, 'clientWidth', { value: 27 });
  document.body.append(box);
  const tip = { show: vi.fn(), move: vi.fn(), hide: vi.fn() };
  const daily = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(2 + i).padStart(2, '0')}`, tokens: 100 + i }));
  renderActivity({ ui, box, tip }, daily, { from: '2026-11-02', to: '2026-11-15' }, null);
  const grid = box.querySelector('.ugrid');
  grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 27, height: 102, right: 27, bottom: 102 });
  const at = (x, y) => grid.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
  return { box, grid, tip, at };
}

it('points at the cell under the pointer, and a gap at the nearer of its two cells', () => {
  const { box, tip, at } = mountGrid();
  at(5, 5);
  expect(tip.show.mock.lastCall[1]).toBe('2026-11-02');
  // the 3px gap between the columns: its left half belongs to the first, its right half to the second
  at(12.5, 5);
  expect(tip.show.mock.lastCall[1]).toBe('2026-11-02');
  at(14, 5);
  expect(tip.show.mock.lastCall[1]).toBe('2026-11-09');
  // the gap under the first row
  at(20, 13);
  expect(tip.show.mock.lastCall[1]).toBe('2026-11-09');
  at(20, 101);
  expect(tip.show.mock.lastCall[1]).toBe('2026-11-15');
  expect(tip.hide).not.toHaveBeenCalled();
  // the lifted copy is the pointed day's cell, one at a time (no animation API here, so the old one goes at once)
  const lifts = box.querySelectorAll('.ulift');
  expect(lifts).toHaveLength(1);
  expect(lifts[0].querySelector('.ucell').dataset.level).toBe('4');
});

it('drops the lift and hides the tip when the pointer leaves the grid', () => {
  const { box, grid, tip, at } = mountGrid();
  at(5, 5);
  grid.dispatchEvent(new MouseEvent('mouseleave'));
  expect(box.querySelector('.ulift')).toBeNull();
  expect(tip.hide).toHaveBeenCalled();
});

it('measures the tip once per body, not on every move', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const tip = createUsageTip(document, host);
  const measure = vi.spyOn(tip.el, 'getBoundingClientRect');
  tip.show('<b>a</b>', 'a');
  tip.move({ clientX: 10, clientY: 10 });
  tip.move({ clientX: 20, clientY: 10 });
  tip.show('<b>a</b>', 'a');
  tip.move({ clientX: 30, clientY: 10 });
  expect(measure).toHaveBeenCalledTimes(1);
  tip.show('<b>b</b>', 'b');
  tip.move({ clientX: 40, clientY: 10 });
  expect(measure).toHaveBeenCalledTimes(2);
  tip.dispose();
});
