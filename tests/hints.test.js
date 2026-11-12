import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { mountHints } from '../packages/cortico-world-desktop-pet/web/hints.js';

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
    vi.advanceTimersByTime(450);
    expect(box.hidden).toBe(false);
    expect(box.textContent).toBe('大小');
    vi.advanceTimersByTime(2500);
    expect(box.hidden).toBe(true);
    // moving within the button does not bring it back
    over(size.querySelector('.ic'), size);
    vi.advanceTimersByTime(3000);
    expect(box.hidden).toBe(true);
  });

  it('shows again once the pointer has left the button and come back', () => {
    const { size, dress, box, over, out } = page();
    over(size);
    vi.advanceTimersByTime(450 + 2500);
    out(size, dress);
    over(size, dress);
    vi.advanceTimersByTime(450);
    expect(box.hidden).toBe(false);
  });
});
