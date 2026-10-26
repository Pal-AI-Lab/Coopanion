/**
 * The other windows on the desktop, for a figure pack whose manifest `needs` `windows`.
 *
 * `createWindowSource({ screen }).list(own)` lists the visible top-level windows front first, as
 * `{ id, x, y, w, h, active }` in Electron's screen DIPs, leaving out `own` (the pet window's native handle)
 * and what is not an ordinary window on the current desktop. `id` is the window's native number as a string
 * (HWND, CGWindowID, X11 window id); `active` marks the foreground window and is absent on macOS. Only that
 * leaves this file: no title, class or program name. `ledgesFrom(rects, origin, view)` turns the list into the
 * parts of each top edge no window in front of it hides, as `{ x0, x1, y }` in the pet window's page pixels;
 * `windowsFrom(rects, origin, view)` gives the whole windows on the page, as `{ id, x0, y0, x1, y1, active }`.
 *
 * Each platform reads what the computer-use engine reads (src/cua/engine), here in the window process:
 * - Windows: the z-order from GetTopWindow/GetWindow and the frame DWM draws, in physical pixels, each
 *   display at its own scale (`screen.screenToDipPoint` picks the display a corner is on; not `toDip`: on
 *   Windows Electron's `nativeOrigin` is a display's pixel origin divided by its scale, so a display off the
 *   origin at other than 100% would come out shifted); minimized, cloaked (another virtual desktop), tool
 *   and click-through windows and the shell's own are left out. The foreground window is GetForegroundWindow's.
 * - macOS: CGWindowListCopyWindowInfo, front to back, layer 0 only (ordinary app windows; the pet
 *   window floats above it), reading `kCGWindowLayer`, `kCGWindowNumber` and `kCGWindowBounds` and
 *   never the window's name, which is what the Screen Recording permission guards. Bounds are points of
 *   the global display space, which is what Electron's DIPs are on macOS, so they need no conversion.
 * - Linux: the window manager's `_NET_CLIENT_LIST_STACKING` over X11, in physical pixels of the whole
 *   X screen (one scale for all displays), with the frame the manager draws (`_NET_FRAME_EXTENTS`) put
 *   back and a client-side frame's shadow (`_GTK_FRAME_EXTENTS`) taken off; hidden windows, windows on
 *   another workspace, docks and the desktop are left out; the foreground window is `_NET_ACTIVE_WINDOW`.
 *   Under Wayland the app runs through XWayland and sees only the X11 programs' windows.
 * Elsewhere, or where the native calls do not load, `list` answers null and nothing is read. koffi
 * loads on the first `list`, so the window process reads nothing until a pack asks.
 */
const { toDip } = require('./cursor.cjs');

/** Most windows walked in z-order on one read. */
const WINDOWS_MAX = 512;
/** Most tops one read reports. */
const LEDGES_MAX = 64;
/** Most whole windows one read reports, the frontmost kept. */
const RECTS_MAX = 64;

/** Windows: `(own) => rects` in DIPs. */
function openWin32(koffi, screen) {
  const GW_HWNDNEXT = 2, GWL_EXSTYLE = -20;
  const WS_EX_TRANSPARENT = 0x00000020, WS_EX_TOOLWINDOW = 0x00000080;
  const DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
  // the desktop, its wallpaper host and the taskbars
  const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
  const user32 = koffi.load('user32.dll'), dwmapi = koffi.load('dwmapi.dll');
  const GetTopWindow = user32.func('intptr_t __stdcall GetTopWindow(intptr_t hwnd)');
  const GetWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)');
  const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)');
  const IsIconic = user32.func('int __stdcall IsIconic(intptr_t hwnd)');
  const GetWindowLongW = user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)');
  const GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)');
  const GetWindowRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, void *rect)');
  const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
  const DwmGetWindowAttribute = dwmapi.func('int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, void *value, uint32_t size)');
  const dip = (x, y) => { const p = screen.screenToDipPoint({ x, y }); return { x: Math.floor(p.x), y: Math.floor(p.y) }; };
  return (own) => {
    const rect = Buffer.alloc(16), flag = Buffer.alloc(4), name = Buffer.alloc(128);
    const out = [];
    try {
      const fg = GetForegroundWindow();
      let h = GetTopWindow(0);
      for (let i = 0; h && i < WINDOWS_MAX; i++, h = GetWindow(h, GW_HWNDNEXT)) {
        if (BigInt(h) === own || !IsWindowVisible(h) || IsIconic(h)) continue;
        if (GetWindowLongW(h, GWL_EXSTYLE) & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT)) continue;
        if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, flag, 4) === 0 && flag.readUInt32LE(0) !== 0) continue;
        if (GetClassNameW(h, name, 64) > 0 && SHELL_CLASSES.has(name.toString('utf16le').split('\0')[0])) continue;
        // the frame DWM draws, without the invisible resize borders GetWindowRect counts in
        if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) !== 0 && !GetWindowRect(h, rect)) continue;
        const p = dip(rect.readInt32LE(0), rect.readInt32LE(4)), q = dip(rect.readInt32LE(8), rect.readInt32LE(12));
        if (q.x > p.x && q.y > p.y) out.push({ id: String(h), x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y, active: h === fg });
      }
    } catch { /* a window closing mid-walk fails a call; what was read stands */ }
    return out;
  };
}

/** macOS: `() => rects` in points (DIPs); the pet window floats above layer 0, so it never shows in them. */
function openDarwin(koffi) {
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  // a name of its own: koffi type names are per process
  koffi.struct('PetWindowsCGRect', { x: 'double', y: 'double', width: 'double', height: 'double' });
  const CGWindowListCopyWindowInfo = cg.func('void *CGWindowListCopyWindowInfo(uint32_t option, uint32_t relativeToWindow)');
  const CGRectMakeWithDictionaryRepresentation = cg.func('bool CGRectMakeWithDictionaryRepresentation(void *dict, _Out_ PetWindowsCGRect *rect)');
  const CFRelease = cf.func('void CFRelease(void *ref)');
  const CFArrayGetCount = cf.func('long CFArrayGetCount(void *array)');
  const CFArrayGetValueAtIndex = cf.func('void *CFArrayGetValueAtIndex(void *array, long index)');
  const CFDictionaryGetValue = cf.func('void *CFDictionaryGetValue(void *dict, void *key)');
  const CFStringCreateWithCString = cf.func('void *CFStringCreateWithCString(void *alloc, const char *s, uint32_t encoding)');
  const CFNumberGetValue = cf.func('bool CFNumberGetValue(void *n, long type, _Out_ int64_t *value)');
  // kCFStringEncodingUTF8; the keys live as long as the process
  const LAYER = CFStringCreateWithCString(null, 'kCGWindowLayer', 0x08000100);
  const BOUNDS = CFStringCreateWithCString(null, 'kCGWindowBounds', 0x08000100);
  const NUMBER = CFStringCreateWithCString(null, 'kCGWindowNumber', 0x08000100);
  // kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements; kCFNumberSInt64Type
  const ON_SCREEN = 1 | 16, SINT64 = 4;
  return () => {
    const list = CGWindowListCopyWindowInfo(ON_SCREEN, 0);
    if (!list) return [];
    const out = [];
    try {
      const n = Math.min(WINDOWS_MAX, Number(CFArrayGetCount(list)));
      for (let i = 0; i < n; i++) {
        const w = CFArrayGetValueAtIndex(list, i);
        const layer = CFDictionaryGetValue(w, LAYER), v = [0n];
        if (!layer || !CFNumberGetValue(layer, SINT64, v) || Number(v[0]) !== 0) continue;
        const bounds = CFDictionaryGetValue(w, BOUNDS);
        const r = { x: 0, y: 0, width: 0, height: 0 };
        if (!bounds || !CGRectMakeWithDictionaryRepresentation(bounds, r) || !(r.width > 0) || !(r.height > 0)) continue;
        const number = CFDictionaryGetValue(w, NUMBER), id = [0n];
        if (!number || !CFNumberGetValue(number, SINT64, id)) continue;
        out.push({ id: String(id[0]), x: r.x, y: r.y, w: r.width, h: r.height });
      }
    } finally {
      CFRelease(list);
    }
    return out;
  };
}

/** Linux (X11): `(own) => rects` in DIPs, or a throw when there is no X server to open. */
function openX11(koffi, screen) {
  const x11 = koffi.load('libX11.so.6');
  const XOpenDisplay = x11.func('void *XOpenDisplay(const char *name)');
  const XDefaultRootWindow = x11.func('unsigned long XDefaultRootWindow(void *dpy)');
  const XInternAtom = x11.func('unsigned long XInternAtom(void *dpy, const char *name, int onlyIfExists)');
  const XGetWindowProperty = x11.func('int XGetWindowProperty(void *dpy, unsigned long w, unsigned long prop, long offset, long length, int del, unsigned long type, _Out_ unsigned long *actualType, _Out_ int *actualFormat, _Out_ unsigned long *nitems, _Out_ unsigned long *after, _Out_ void **data)');
  const XFree = x11.func('int XFree(void *data)');
  const XGetGeometry = x11.func('int XGetGeometry(void *dpy, unsigned long d, _Out_ unsigned long *root, _Out_ int *x, _Out_ int *y, _Out_ unsigned int *w, _Out_ unsigned int *h, _Out_ unsigned int *border, _Out_ unsigned int *depth)');
  const XTranslateCoordinates = x11.func('int XTranslateCoordinates(void *dpy, unsigned long src, unsigned long dst, int x, int y, _Out_ int *dx, _Out_ int *dy, _Out_ unsigned long *child)');
  const XSync = x11.func('int XSync(void *dpy, int discard)');
  const XSetErrorHandler = x11.func('void *XSetErrorHandler(void *handler)');
  const dpy = XOpenDisplay(null);
  if (!dpy) throw new Error('no X display');
  const root = XDefaultRootWindow(dpy);
  // a window closing between being listed and being read raises BadWindow, and Xlib's default handler exits
  // the process: the read runs under a handler that ignores errors, and the one before it comes back afterwards
  const ignore = koffi.register(() => 0, koffi.pointer(koffi.proto('int PetWindowsXErrorHandler(void *dpy, void *event)')));
  const atoms = new Map();
  const atom = (name) => {
    if (!atoms.has(name)) atoms.set(name, Number(XInternAtom(dpy, name, 0)));
    return atoms.get(name);
  };
  /** A 32-bit window property as numbers, [] when absent. */
  const prop = (w, name) => {
    const type = [0], format = [0], n = [0], after = [0], data = [null];
    if (XGetWindowProperty(dpy, w, atom(name), 0, 1024, 0, 0, type, format, n, after, data) !== 0 || !data[0]) return [];
    try {
      const count = Number(n[0]);
      return format[0] === 32 && count ? Array.from(koffi.decode(data[0], koffi.array('unsigned long', count)), Number) : [];
    } finally {
      XFree(data[0]);
    }
  };
  const ALL_DESKTOPS = 0xffffffff;
  return (own) => {
    const displays = screen.getAllDisplays();
    const previous = XSetErrorHandler(ignore);
    const out = [];
    try {
      const stack = prop(root, '_NET_CLIENT_LIST_STACKING');
      const current = prop(root, '_NET_CURRENT_DESKTOP')[0], active = prop(root, '_NET_ACTIVE_WINDOW')[0];
      const hidden = atom('_NET_WM_STATE_HIDDEN'), skipTypes = [atom('_NET_WM_WINDOW_TYPE_DOCK'), atom('_NET_WM_WINDOW_TYPE_DESKTOP')];
      // the stacking list runs bottom to top
      for (const w of stack.reverse().slice(0, WINDOWS_MAX)) {
        if (BigInt(w) === own || prop(w, '_NET_WM_STATE').includes(hidden)) continue;
        const desk = prop(w, '_NET_WM_DESKTOP')[0];
        if (desk !== undefined && current !== undefined && desk !== current && desk !== ALL_DESKTOPS) continue;
        if (prop(w, '_NET_WM_WINDOW_TYPE').some((t) => skipTypes.includes(t))) continue;
        const r = [0], gx = [0], gy = [0], gw = [0], gh = [0], b = [0], d = [0];
        if (!XGetGeometry(dpy, w, r, gx, gy, gw, gh, b, d)) continue;
        const ax = [0], ay = [0], child = [0];
        if (!XTranslateCoordinates(dpy, w, root, 0, 0, ax, ay, child)) continue;
        // [left, right, top, bottom]: the manager's frame outside the client, a client-side frame's shadow inside it
        const [fl = 0, fr = 0, ft = 0, fb = 0] = prop(w, '_NET_FRAME_EXTENTS');
        const [sl = 0, sr = 0, st = 0, sb = 0] = prop(w, '_GTK_FRAME_EXTENTS');
        const x = ax[0] - fl + sl, y = ay[0] - ft + st, wd = gw[0] + fl + fr - sl - sr, ht = gh[0] + ft + fb - st - sb;
        const p = toDip({ x, y }, displays), q = toDip({ x: x + wd, y: y + ht }, displays);
        if (q.x > p.x && q.y > p.y) out.push({ id: String(w), x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y, active: w === active });
      }
    } finally {
      // errors the server sends late arrive while ours is still the handler
      XSync(dpy, 0);
      XSetErrorHandler(previous);
    }
    return out;
  };
}

const OPENERS = { win32: openWin32, darwin: openDarwin, linux: openX11 };

function createWindowSource({ screen, platform = process.platform, loadKoffi = () => require('koffi') }) {
  const opener = OPENERS[platform];
  if (!opener) return { available: false, list: () => null };
  let read;
  /** The windows in front first, or null when the native calls will not load (no X server, say). */
  const list = (own) => {
    if (read === null) return null;
    if (!read) {
      try { read = opener(loadKoffi(), screen); } catch { read = null; return null; }
    }
    try { return read(own); } catch { return null; }
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

/**
 * The windows of `rects` (screen DIPs, front first) that reach onto the page of the pet window above its floor,
 * front first, as `{ id, x0, y0, x1, y1 }` in page pixels and whole (parts off the page and behind other windows
 * included), with `active` where the platform reports it; `origin` and `view` as for `ledgesFrom`.
 */
function windowsFrom(rects, origin, view) {
  const out = [];
  for (const { id, x, y, w, h, active } of rects) {
    const x0 = x - origin.x, y0 = y - origin.y, x1 = x0 + w, y1 = y0 + h;
    if (x1 <= 0 || x0 >= view.width || y1 <= 0 || y0 >= view.floor) continue;
    out.push(active === undefined ? { id, x0, y0, x1, y1 } : { id, x0, y0, x1, y1, active });
    if (out.length === RECTS_MAX) break;
  }
  return out;
}

module.exports = { createWindowSource, ledgesFrom, windowsFrom };
