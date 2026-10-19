import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ledgesFrom } = require('../packages/cortico-world-desktop-pet/host/windows.cjs');

describe('window tops', () => {
  it('keeps only the parts of a top edge no window in front covers, and only tops on the page above the floor', () => {
    // the pet window covers x 1000–3000, y 0–1400 on screen; its floor is at page y 1300
    const origin = { x: 1000, y: 0 }, view = { width: 2000, floor: 1300 };
    const rects = [
      { x: 1400, y: 300, w: 400, h: 500 }, // in front, over the middle of the next one's top
      { x: 1200, y: 500, w: 1000, h: 600 },
      { x: 1100, y: 900, w: 300, h: 200 }, // its top is behind the second window, where that one starts
      { x: 2500, y: 1350, w: 300, h: 40 }, // below the floor
      { x: 0, y: 0, w: 5000, h: 1400 }, // a maximized window behind them all, top at the page's top
    ];
    expect(ledgesFrom(rects, origin, view)).toEqual([
      { x0: 400, x1: 800, y: 300 },
      { x0: 200, x1: 400, y: 500 },
      { x0: 800, x1: 1200, y: 500 },
      { x0: 100, x1: 200, y: 900 },
    ]);
  });
});
