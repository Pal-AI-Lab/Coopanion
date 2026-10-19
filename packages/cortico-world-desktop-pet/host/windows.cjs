/**
 * The tops of the other windows on the desktop, for a figure pack whose manifest `needs` `windows`.
 *
 * `createWindowSource({ screen }).list(own)` lists the visible top-level windows front first, as
 * `{ x, y, w, h }` in screen DIPs, leaving out `own` (the pet window), minimized and cloaked ones (on
 * another virtual desktop), tool and click-through windows, and the desktop and taskbars. Only their
 * geometry leaves this file. `ledgesFrom(rects, origin, view)` turns the list into the parts of each top
 * edge no window in front of it hides, as `{ x0, x1, y }` in the pet window's page pixels.
 *
 * Windows only: elsewhere `available` is false and nothing is read. koffi loads on the first `list`.
 */
const { toDip } = require('./cursor.cjs');

const GW_HWNDNEXT = 2;
const GWL_EXSTYLE = -20;
const WS_EX_TRANSPARENT = 0x00000020, WS_EX_TOOLWINDOW = 0x00000080;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
/** The desktop, its wallpaper host and the taskbars. */
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
/** Most windows walked in z-order on one read. */
const WINDOWS_MAX = 512;
/** Most tops one read reports. */
const LEDGES_MAX = 64;

function createWindowSource({ screen, platform = process.platform, loadKoffi = () => require('koffi') }) {
  if (platform !== 'win32') return { available: false, list: () => null };
  let api;
  const open = () => {
    const koffi = loadKoffi();
    const user32 = koffi.load('user32.dll'), dwmapi = koffi.load('dwmapi.dll');
    return {
      GetTopWindow: user32.func('intptr_t __stdcall GetTopWindow(intptr_t hwnd)'),
      GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
      IsWindowVisible: user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: user32.func('int __stdcall IsIconic(intptr_t hwnd)'),
      GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)'),
      GetWindowRect: user32.func('int __stdcall GetWindowRect(intptr_t hwnd, void *rect)'),
      DwmGetWindowAttribute: dwmapi.func('int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, void *value, uint32_t size)'),
    };
  };
  /** The windows in front first, or null when koffi or the calls will not load. */
  const list = (own) => {
    if (api === null) return null;
    if (!api) {
      try { api = open(); } catch { api = null; return null; }
    }
    const displays = screen.getAllDisplays();
    const rect = Buffer.alloc(16), flag = Buffer.alloc(4), name = Buffer.alloc(128);
    const out = [];
    try {
      let h = api.GetTopWindow(0);
      for (let i = 0; h && i < WINDOWS_MAX; i++, h = api.GetWindow(h, GW_HWNDNEXT)) {
        if (BigInt(h) === own || !api.IsWindowVisible(h) || api.IsIconic(h)) continue;
        if (api.GetWindowLongW(h, GWL_EXSTYLE) & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT)) continue;
        if (api.DwmGetWindowAttribute(h, DWMWA_CLOAKED, flag, 4) === 0 && flag.readUInt32LE(0) !== 0) continue;
        if (api.GetClassNameW(h, name, 64) > 0 && SHELL_CLASSES.has(name.toString('utf16le').split('\0')[0])) continue;
        // the frame DWM draws, without the invisible resize borders GetWindowRect counts in
        if (api.DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) !== 0 && !api.GetWindowRect(h, rect)) continue;
        const p = toDip({ x: rect.readInt32LE(0), y: rect.readInt32LE(4) }, displays);
        const q = toDip({ x: rect.readInt32LE(8), y: rect.readInt32LE(12) }, displays);
        if (q.x > p.x && q.y > p.y) out.push({ x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y });
      }
    } catch { /* a window closing mid-walk fails a call; what was read stands */ }
    return out;
  };
  return { available: true, list };
}

/** `[a, b]` less `[c, d]`. */
function cut([a, b], [c, d]) {
  if (d <= a || c >= b) return [[a, b]];
  const out = [];
  if (c > a) out.push([a, c]);
  if (d < b) out.push([d, b]);
  return out;
}

/**
 * The visible tops of `rects` (screen DIPs, front first) in page pixels of the pet window: `origin` is its top
 * left on screen, `view` its `{ width, floor }` (the floor's height in the page). A top counts where it is on the
 * page above the floor, and only the parts no window in front covers; tops come highest first.
 */
function ledgesFrom(rects, origin, view) {
  const out = [], front = [];
  for (const r of rects) {
    const x0 = r.x - origin.x, x1 = x0 + r.w, y = r.y - origin.y;
    let spans = [[Math.max(0, x0), Math.min(view.width, x1)]];
    for (const a of front) if (y >= a.y && y < a.y + a.h) spans = spans.flatMap((s) => cut(s, [a.x0, a.x1]));
    front.push({ x0, x1, y, h: r.h });
    if (y <= 0 || y >= view.floor) continue;
    for (const [a, b] of spans) if (b > a) out.push({ x0: a, x1: b, y });
  }
  return out.sort((a, b) => a.y - b.y || a.x0 - b.x0).slice(0, LEDGES_MAX);
}

module.exports = { createWindowSource, ledgesFrom };
