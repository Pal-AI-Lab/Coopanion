import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { setMotionChoice } from '../packages/cortico-world-desktop-pet/web/motion-level.js';
import { approachShare, cssMs, growFrom, tween, typeOut } from '../packages/cortico-world-desktop-pet/web/motion-frames.js';

const at = (level) => { const win = new JSDOM('<!doctype html><html></html>').window; setMotionChoice(win, level); return win; };

describe('frame motion', () => {
  it('eases by the time that passed, not by frames: two half frames close as much as one whole', () => {
    const win = at('high');
    const step = (x, dt) => x + (100 - x) * approachShare(12, dt, win);
    expect(step(step(0, 1 / 60), 1 / 60)).toBeCloseTo(step(0, 1 / 30), 9);
    expect(approachShare(12, 1 / 60, win)).toBeCloseTo(1 - Math.exp(-.2), 9);
  });

  it('lands at once at low motion', () => {
    const win = at('low');
    expect(approachShare(12, 1 / 60, win)).toBe(1);
    expect(tween(0, 10, 300, { start: 0, win }).at(0)).toBe(10);
    expect(typeOut(50, 20, 0, win)).toBe(50);
  });

  it('drops overshoot at medium motion and keeps the curve at high', () => {
    const back = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
    const peak = (win) => Math.max(...Array.from({ length: 50 }, (_, i) => tween(0, 1, 100, { ease: back, overshoots: true, start: 0, win }).at(i * 2)));
    expect(peak(at('high'))).toBeGreaterThan(1);
    expect(peak(at('medium'))).toBeLessThanOrEqual(1);
  });

  it('types out by elapsed seconds', () => {
    const win = at('high');
    expect(typeOut(100, 20, .5, win)).toBe(10);
    expect(typeOut(100, 20, 9, win)).toBe(100);
  });

  it('reads a duration from the stylesheet in ms or s, and falls back without one', () => {
    const el = (value) => ({ ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => value }) } } });
    expect(cssMs(el('160ms'), '--x', 1)).toBe(160);
    expect(cssMs(el(' .12s'), '--x', 1)).toBe(120);
    expect(cssMs(el(''), '--x', 99)).toBe(99);
    expect(cssMs(el('var(--y)'), '--x', 99)).toBe(99);
    expect(cssMs(null, '--x', 7)).toBe(7);
  });

  it('grows from the old size to the new one, steady below full motion and not at all at low', () => {
    const grown = (level, was, opts) => {
      const win = at(level), el = win.document.createElement('div'), calls = [];
      Object.defineProperties(el, { offsetWidth: { value: 120 }, offsetHeight: { value: 38 } });
      el.animate = (frames, o) => { calls.push([frames, o]); return {}; };
      return [growFrom(el, was, opts), calls];
    };
    expect(grown('high', { w: 38, h: 38 }, { duration: 200 })[1]).toEqual([[[{ width: '38px' }, { width: '120px' }], { duration: 200, easing: 'ease' }]]);
    expect(grown('medium', { h: 10 }, { duration: 320, easing: 'cubic-bezier(.3,1.1,.5,1)', overshoots: true })[1][0][1].easing).toBe('cubic-bezier(.2,.7,.3,1)');
    expect(grown('high', { h: 10 }, { duration: 320, easing: 'cubic-bezier(.3,1.1,.5,1)', overshoots: true })[1][0][1].easing).toBe('cubic-bezier(.3,1.1,.5,1)');
    expect(grown('low', { w: 38 }, { duration: 200 })).toEqual([undefined, []]);
    expect(grown('high', { w: 120, h: 38 }, { duration: 200 })).toEqual([undefined, []]);
  });
});
