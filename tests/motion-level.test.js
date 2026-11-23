import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { motionLevel, setMotionChoice, watchMotion } from '../packages/cortico-world-desktop-pet/web/motion-level.js';

/** A window whose system reduced-motion setting the test flips, firing `change` as the browser does. */
function windowWithSystem(reduce) {
  const win = new JSDOM('<!doctype html><html><body></body></html>').window;
  const listeners = [];
  const query = { get matches() { return reduce; }, addEventListener: (_, fn) => listeners.push(fn) };
  win.matchMedia = () => query;
  return { win, flip(next) { reduce = next; for (const fn of listeners) fn(); } };
}

describe('motion level', () => {
  it('follows the system by default: low when it asks for reduced motion, high otherwise', () => {
    expect(motionLevel(windowWithSystem(true).win)).toBe('low');
    expect(motionLevel(windowWithSystem(false).win)).toBe('high');
    expect(motionLevel(undefined)).toBe('high');
  });

  it('writes the level on the root and keeps it current as the system setting changes', () => {
    const { win, flip } = windowWithSystem(false);
    watchMotion(win);
    expect(win.document.documentElement.dataset.motion).toBe('high');
    flip(true);
    expect(win.document.documentElement.dataset.motion).toBe('low');
    flip(false);
    expect(win.document.documentElement.dataset.motion).toBe('high');
  });

  it('takes a chosen level over the system, and goes back to the system on "system" or anything unknown', () => {
    const { win, flip } = windowWithSystem(true);
    watchMotion(win);
    setMotionChoice(win, 'medium');
    expect(motionLevel(win)).toBe('medium');
    expect(win.document.documentElement.dataset.motion).toBe('medium');
    flip(false);
    expect(win.document.documentElement.dataset.motion).toBe('medium');
    setMotionChoice(win, 'loud');
    expect(motionLevel(win)).toBe('high');
    setMotionChoice(win, 'system');
    flip(true);
    expect(win.document.documentElement.dataset.motion).toBe('low');
  });
});
