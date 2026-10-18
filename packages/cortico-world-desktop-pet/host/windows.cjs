/**
 * Where the pet can stand: the top edges of the desktop windows under its window.
 *
 * `list()` answers the visible windows in z-order, front first, as `{ x, y, w, h }` in screen DIPs.
 * `ledgesFrom(rects, origin, view)` turns them into `{ x0, x1, y }` segments in page pixels for the
 * display the pet covers: a window's top edge is kept only where no window in front of it hides it,
 * and only where the body fits above it and it is far enough above the floor to be worth climbing.
 *
 * Windows only. Elsewhere `list()` answers nothing, the page gets no ledges, and the pet stays on
 * the floor.
 */
const { toDip } = require('./cursor.cjs');

const GW_HWNDNEXT = 2;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
/** Shell surfaces: the desktop, its wallpaper host, and the taskbars. */
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow', 'ForegroundStaging']);
const MAX_WINDOWS = 400;

/**
 * `screen` is Electron's screen module. `loadKoffi` is the module loader, injectable for tests; a
 * machine without the native module answers no windows rather than failing.
 */
function createWindowSource({ screen, platform = process.platform, loadKoffi = () => require('koffi') }) {
  if (platform !== 'win32') return { list: () => [] };
  let api;
  const open = () => {
    const koffi = loadKoffi();
    const user32 = koffi.load('user32.dll');
    const dwmapi = koffi.load('dwmapi.dll');
    koffi.struct('COOPANION_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    return {
      GetTopWindow: user32.func('void * __stdcall GetTopWindow(void *hwnd)'),
      GetWindow: user32.func('void * __stdcall GetWindow(void *hwnd, unsigned int cmd)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hwnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(void *hwnd)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hwnd, _Out_ COOPANION_RECT *rect)'),
      GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)'),
      GetWindowThreadProcessId: user32.func('unsigned long __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ unsigned long *pid)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(void *hwnd, _Out_ void *buf, int size)'),
      DwmFrame: dwmapi.func('long __stdcall DwmGetWindowAttribute(void *hwnd, unsigned long attr, _Out_ COOPANION_RECT *rect, unsigned long size)'),
      DwmCloaked: dwmapi.func('long __stdcall DwmGetWindowAttribute(void *hwnd, unsigned long attr, _Out_ unsigned int *value, unsigned long size)'),
    };
  };

  const list = () => {
    if (api === null) return [];
    if (!api) {
      try { api = open(); } catch { api = null; return []; }
    }
    const displays = screen.getAllDisplays();
    const own = process.pid;
    const pid = Buffer.alloc(4), name = Buffer.alloc(512), flag = Buffer.alloc(4);
    const out = [];
    let h = api.GetTopWindow(null);
    try {
      for (let i = 0; h && i < MAX_WINDOWS; i++, h = api.GetWindow(h, GW_HWNDNEXT)) {
        if (!api.IsWindowVisible(h) || api.IsIconic(h)) continue;
        if (api.GetWindowLongPtrW(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) continue;
        if (api.GetWindowThreadProcessId(h, pid) && pid.readUInt32LE(0) === own) continue;
        if (api.GetClassNameW(h, name, 256) > 0 && SHELL_CLASSES.has(name.toString('utf16le').replace(/\0.*$/, ''))) continue;
        // a window on another virtual desktop is cloaked, not closed
        if (api.DwmCloaked(h, DWMWA_CLOAKED, flag, 4) === 0 && flag.readUInt32LE(0) !== 0) continue;
        const rect = {};
        if (api.DwmFrame(h, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) !== 0 && !api.GetWindowRect(h, rect)) continue;
        const w = rect.right - rect.left, height = rect.bottom - rect.top;
        if (w < 120 || height < 80) continue;
        const p = toDip({ x: rect.left, y: rect.top }, displays);
        const q = toDip({ x: rect.right, y: rect.bottom }, displays);
        out.push({ x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y });
      }
    } catch { /* the call may fail while a window closes; keep what was read */ }
    return out;
  };

  return { list };
}

/** `[a, b]` minus `[c, d]`: the parts of the first interval the second does not cover. */
function cut([a, b], [c, d]) {
  if (d <= a || c >= b) return [[a, b]];
  const out = [];
  if (c > a) out.push([a, c]);
  if (d < b) out.push([d, b]);
  return out;
}

/**
 * The standable tops of `rects` (screen DIPs, front first), in page pixels: `origin` is the pet
 * window's top left and `view` its `{ width, floor }`. `minWidth` drops slivers, `minTop` leaves the
 * body room above the screen's top edge, and `minDrop` drops tops too close to the floor.
 */
function ledgesFrom(rects, origin, view, opts = {}) {
  const minWidth = opts.minWidth ?? 160, minTop = opts.minTop ?? 120, minDrop = opts.minDrop ?? 64;
  const out = [];
  const above = [];
  for (const r of rects) {
    const top = r.y - origin.y, h = r.h;
    let spans = [[Math.max(24, r.x - origin.x), Math.min(view.width - 24, r.x - origin.x + r.w)]];
    for (const a of above) {
      if (top < a.top || top >= a.top + a.h) continue;
      spans = spans.flatMap((s) => cut(s, [a.x0, a.x1]));
    }
    above.push({ top, h, x0: r.x - origin.x, x1: r.x - origin.x + r.w });
    if (top < minTop || top > view.floor - minDrop) continue;
    for (const [x0, x1] of spans) if (x1 - x0 >= minWidth) out.push({ x0, x1, y: top });
  }
  return out.sort((a, b) => a.y - b.y || a.x0 - b.x0);
}

module.exports = { createWindowSource, ledgesFrom };
