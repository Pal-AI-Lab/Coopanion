import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { LEAVE_MS, hideTip, showTip } from '../console/base/ui/tip.ts';

describe('hint boxes in the settings window (base/ui/tip.ts)', () => {
  let win;
  afterEach(() => { vi.useRealTimers(); win?.close(); });
  function box() {
    vi.useFakeTimers();
    win = new JSDOM('<!doctype html><body><div class="u-tip hidden"></div></body>').window;
    win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
    return win.document.querySelector('.u-tip');
  }

  it('fades out, then hides', () => {
    const el = box();
    showTip(el);
    hideTip(el);
    expect(el.classList.contains('leaving')).toBe(true);
    expect(el.classList.contains('hidden')).toBe(false);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(el.classList.contains('hidden')).toBe(true);
    expect(el.classList.contains('leaving')).toBe(false);
  });

  it('stays when shown again while fading out, and hides at once when asked', () => {
    const el = box();
    showTip(el);
    hideTip(el);
    showTip(el);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(el.className).toBe('u-tip');
    hideTip(el, true);
    expect(el.classList.contains('hidden')).toBe(true);
  });
});
