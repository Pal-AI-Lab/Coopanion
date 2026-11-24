import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setMotionChoice } from '../packages/cortico-world-desktop-pet/web/motion-level.js';
import { showHide } from '../packages/cortico-world-desktop-pet/web/show-hide.js';

function box(level = 'high', opts) {
  const { window } = new JSDOM('<!doctype html><html><body><div hidden></div></body></html>', { pretendToBeVisual: true });
  setMotionChoice(window, level);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], global: window });
  const el = window.document.querySelector('div');
  return { el, sh: showHide(el, opts), window };
}

afterEach(() => vi.useRealTimers());

describe('showHide', () => {
  it('enters for enterMs, then leaves for the given ms before it hides', () => {
    const { el, sh } = box('high', { enterMs: () => 600 });
    sh.show();
    expect(el.hidden).toBe(false);
    expect(el.classList.contains('entering')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(el.classList.contains('entering')).toBe(false);
    sh.hide(160);
    expect(sh.leaving).toBe(true);
    expect(el.hidden).toBe(false);
    vi.advanceTimersByTime(160);
    expect(el.hidden).toBe(true);
    expect(sh.leaving).toBe(false);
  });

  it('stays when called back mid-exit, and hides at once at low motion or when asked', () => {
    const { el, sh } = box();
    sh.show(); sh.hide(160); sh.stay();
    vi.advanceTimersByTime(500);
    expect(el.hidden).toBe(false);
    sh.hide(160, true);
    expect(el.hidden).toBe(true);
    const low = box('low');
    low.sh.show(); low.sh.hide(160);
    expect(low.el.hidden).toBe(true);
    expect(low.sh.leaving).toBe(false);
  });

  it('hides by a class when given one', () => {
    const { el, sh } = box('high', { hiddenClass: 'hidden' });
    el.hidden = false;
    sh.reveal();
    expect(el.classList.contains('hidden')).toBe(false);
    sh.hide(120);
    vi.advanceTimersByTime(120);
    expect(el.classList.contains('hidden')).toBe(true);
    expect(el.hidden).toBe(false);
  });
});
