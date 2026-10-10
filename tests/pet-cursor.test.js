import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createCursorSource } = require('../packages/cortico-world-desktop-pet/host/cursor.cjs');
const primary = { nativeOrigin: { x: 0, y: 0 }, scaleFactor: 2, bounds: { x: 0, y: 0, width: 1440, height: 900 } };
const secondary = { nativeOrigin: { x: 2880, y: 0 }, scaleFactor: 1, bounds: { x: 1440, y: 0, width: 1920, height: 1080 } };

/** Xlib with only the native calls replaced; `point` is where the X server puts the pointer. */
function nativePointer() {
  const native = { point: { x: 40, y: 100 } };
  const calls = {
    XOpenDisplay: () => ({}),
    XDefaultRootWindow: () => 42,
    XQueryPointer: vi.fn((dpy, win, r, c, rx, ry) => { rx[0] = native.point.x; ry[0] = native.point.y; return 1; }),
    XCloseDisplay: () => 0,
  };
  native.loadKoffi = vi.fn(() => ({ load: () => ({ func: (signature) => calls[signature.match(/\b(X\w+)\(/)[1]] }) }));
  return native;
}

// Electron's stale value from #119, whatever the pointer does.
const screen = { getAllDisplays: () => [primary, secondary], getCursorScreenPoint: () => ({ x: 20, y: 50 }) };

describe('pet cursor source', () => {
  it('follows the X server while Electron keeps returning its first position', () => {
    const native = nativePointer();
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual({ x: 20, y: 50 });
    native.point = { x: 2016, y: 1688 };
    expect(source.read()).toEqual({ x: 1008, y: 844 });
    source.close();
  });

  it.each([
    [{ x: 2879, y: 100 }, { x: 1439, y: 50 }],
    [{ x: 2880, y: 100 }, { x: 1440, y: 100 }],
    [{ x: 3200, y: 200 }, { x: 1760, y: 200 }],
  ])('selects the monitor using physical coordinates: %j', (point, expected) => {
    const native = nativePointer(); native.point = point;
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual(expected);
    source.close();
  });

  it('falls back to Electron when Xlib does not load', () => {
    const native = nativePointer();
    native.loadKoffi.mockImplementation(() => { throw new Error('missing Xlib'); });
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual({ x: 20, y: 50 });
  });
});
