import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createWindowSource, ledgesFrom, windowsFrom } = require('../packages/cortico-world-desktop-pet/host/windows.cjs');

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

  it('lists whole windows front first in page pixels with their ids, leaving out those off the page or below the floor', () => {
    const origin = { x: 1000, y: 0 }, view = { width: 2000, floor: 1300 };
    const rects = [
      { id: 'a', x: 1400, y: 300, w: 400, h: 500, active: false },
      { id: 'b', x: 2500, y: 1350, w: 300, h: 40, active: false }, // below the floor
      { id: 'c', x: 200, y: 100, w: 500, h: 300, active: false }, // left of the page
      { id: 'd', x: 2800, y: 1200, w: 600, h: 400, active: true }, // over the page's right edge and the floor
      { id: 'e', x: 0, y: 0, w: 5000, h: 1400, active: false },
    ];
    expect(windowsFrom(rects, origin, view)).toEqual([
      { id: 'a', x0: 400, y0: 300, x1: 800, y1: 800, active: false },
      { id: 'd', x0: 1800, y0: 1200, x1: 2400, y1: 1600, active: true },
      { id: 'e', x0: -1000, y0: 0, x1: 4000, y1: 1400, active: false },
    ]);
  });

  it('reads X11 windows front first from the stacking list with their ids and the active one, frames put back, leaving out the pet, other workspaces and docks', () => {
    // root 1; stacking bottom to top: 10 on workspace 2, 11 a dock, 12 framed by the manager, 13 drawn with its own shadow, 14 the pet
    const atoms = new Map();
    const atomOf = (name) => { if (!atoms.has(name)) atoms.set(name, atoms.size + 100); return atoms.get(name); };
    const props = {
      1: { _NET_CLIENT_LIST_STACKING: [10, 11, 12, 13, 14], _NET_CURRENT_DESKTOP: [0], _NET_ACTIVE_WINDOW: [12] },
      10: { _NET_WM_DESKTOP: [2] },
      11: { _NET_WM_WINDOW_TYPE: [atomOf('_NET_WM_WINDOW_TYPE_DOCK')] },
      12: { _NET_WM_DESKTOP: [0], _NET_FRAME_EXTENTS: [4, 4, 30, 4] },
      13: { _NET_WM_DESKTOP: [0xffffffff], _GTK_FRAME_EXTENTS: [20, 20, 16, 24] },
    };
    // each client's size and its top left on the root
    const geometry = { 10: [0, 0, 300, 300], 11: [0, 1040, 1920, 40], 12: [200, 330, 800, 500], 13: [1000, 200, 640, 480], 14: [0, 0, 1920, 1080] };
    const calls = {
      XOpenDisplay: () => ({}),
      XDefaultRootWindow: () => 1,
      XInternAtom: (dpy, name) => atomOf(name),
      XGetWindowProperty: (dpy, w, prop, off, len, del, type, outType, format, n, after, data) => {
        const name = [...atoms].find(([, id]) => id === prop)[0];
        const v = props[w]?.[name];
        if (!v) { data[0] = null; return 0; }
        format[0] = 32; n[0] = v.length; data[0] = { v };
        return 0;
      },
      XFree: () => 0,
      XGetGeometry: (dpy, w, r, x, y, wd, ht) => { const g = geometry[w]; if (!g) return 0; wd[0] = g[2]; ht[0] = g[3]; return 1; },
      XTranslateCoordinates: (dpy, w, root, sx, sy, ax, ay) => { const g = geometry[w]; ax[0] = g[0]; ay[0] = g[1]; return 1; },
      XSync: () => 0,
      XSetErrorHandler: () => null,
    };
    const koffi = {
      load: () => ({ func: (signature) => calls[signature.match(/\b(X\w+)\(/)[1]] }),
      decode: (data) => data.v, array: () => null, register: () => ({}), pointer: () => null, proto: () => null,
    };
    const screen = { getAllDisplays: () => [{ nativeOrigin: { x: 0, y: 0 }, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }] };
    const source = createWindowSource({ screen, platform: 'linux', loadKoffi: () => koffi });
    expect(source.list(14n)).toEqual([
      { id: '13', x: 1020, y: 216, w: 600, h: 440, active: false },
      { id: '12', x: 196, y: 300, w: 808, h: 534, active: true },
    ]);
  });
});
