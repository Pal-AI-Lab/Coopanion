import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sizeEcho } from '../packages/cortico-world-desktop-pet/web/scale-slider.js';

describe('sizes heard back from the World', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }); });
  afterEach(() => { vi.useRealTimers(); });

  function echo() {
    const taken = [];
    return { taken, e: sizeEcho((v) => taken.push(v), 1000) };
  }

  it('holds an older size heard after a send, and drops it when the echo of the send comes', () => {
    const { taken, e } = echo();
    e.sent(2);
    e.heard(1.2);
    expect(taken).toEqual([]);
    e.heard(2);
    vi.advanceTimersByTime(1000);
    expect(taken).toEqual([2]);
  });

  it('takes a size set elsewhere: at once when the page sent none, else once the window after its send passes without an echo', () => {
    const { taken, e } = echo();
    e.heard(1.5);
    expect(taken).toEqual([1.5]);
    taken.length = 0;
    e.sent(2);
    e.heard(3);
    expect(taken).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(taken).toEqual([3]);
  });

  it('holds what it hears while the page is busy, and a send then replaces it', () => {
    const { taken, e } = echo();
    e.heard(1.4, true);
    e.sent(1.8);
    vi.advanceTimersByTime(1000);
    expect(taken).toEqual([]);
  });
});
