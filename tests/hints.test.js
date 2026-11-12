import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { DELAY_MS, LEAVE_MS, SHOW_MS, mountHints } from '../packages/cortico-world-desktop-pet/web/hints.js';

describe('hover hints on the pet pages', () => {
  let win;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); win?.close(); });

  function page() {
    win = new JSDOM('<!doctype html><body><button data-tip="大小"><span class="ic"></span></button><button data-tip="装扮"></button></body>').window;
    // jsdom's timers are the window's: the fake clock drives them through the page's own setTimeout
    win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
    mountHints(win.document);
    const [size, dress] = win.document.querySelectorAll('button');
    const box = win.document.querySelector('.hint');
    const over = (el, from = null) => el.dispatchEvent(new win.MouseEvent('pointerover', { bubbles: true, relatedTarget: from }));
    const out = (el, to = null) => el.dispatchEvent(new win.MouseEvent('pointerout', { bubbles: true, relatedTarget: to }));
    return { size, dress, box, over, out };
  }

  it('shows a moment after the pointer arrives and closes on its own while the pointer stays', () => {
    const { size, box, over } = page();
    over(size);
    vi.advanceTimersByTime(DELAY_MS);
    expect(box.hidden).toBe(false);
    expect(box.textContent).toBe('大小');
    vi.advanceTimersByTime(SHOW_MS - 1);
    expect(box.hidden).toBe(false);
    // fading out, then gone
    vi.advanceTimersByTime(1);
    expect(box.classList.contains('leaving')).toBe(true);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(box.hidden).toBe(true);
    expect(box.classList.contains('leaving')).toBe(false);
    // moving within the button does not bring it back
    over(size.querySelector('.ic'), size);
    vi.advanceTimersByTime(2 * SHOW_MS);
    expect(box.hidden).toBe(true);
  });

  it('shows again once the pointer has left the button and come back', () => {
    const { size, dress, box, over, out } = page();
    over(size);
    vi.advanceTimersByTime(DELAY_MS + SHOW_MS + LEAVE_MS);
    out(size, dress);
    over(size, dress);
    vi.advanceTimersByTime(DELAY_MS);
    expect(box.hidden).toBe(false);
  });

  it('fades out when the pointer leaves, and goes at once on a press', () => {
    const { size, dress, box, over, out } = page();
    over(size);
    vi.advanceTimersByTime(DELAY_MS);
    out(size, null);
    expect(box.classList.contains('leaving')).toBe(true);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(box.hidden).toBe(true);
    over(dress);
    vi.advanceTimersByTime(DELAY_MS);
    dress.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true }));
    expect(box.hidden).toBe(true);
  });
});
