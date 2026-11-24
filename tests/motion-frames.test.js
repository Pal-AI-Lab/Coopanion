import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { setMotionChoice } from '../packages/cortico-world-desktop-pet/web/motion-level.js';
import { approach, approachShare, cssMs, tween, typeOut } from '../packages/cortico-world-desktop-pet/web/motion-frames.js';

const at = (level) => { const win = new JSDOM('<!doctype html><html></html>').window; setMotionChoice(win, level); return win; };

describe('frame motion', () => {
  it('eases by the time that passed, not by frames: two half frames close as much as one whole', () => {
    const win = at('high');
    const once = approach(0, 100, 12, 1 / 30, win);
    const twice = approach(approach(0, 100, 12, 1 / 60, win), 100, 12, 1 / 60, win);
    expect(twice).toBeCloseTo(once, 9);
    expect(approachShare(12, 1 / 60, win)).toBeCloseTo(1 - Math.exp(-.2), 9);
  });

  it('lands at once at low motion', () => {
    const win = at('low');
    expect(approach(0, 100, 12, 1 / 60, win)).toBe(100);
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
});
