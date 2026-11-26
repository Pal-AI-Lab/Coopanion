/**
 * The desktop's icons, for a figure pack whose manifest `needs` `icons`.
 *
 * `createIconSource({ screen }).list()` lists the icons on the desktop as `{ id, x, y, w, h }` in Electron's
 * screen DIPs, or null where they cannot be read. `id` is the icon's position in the desktop's list as a
 * string: it stays the icon's while the desktop is not re-sorted and nothing is added or removed. Only the
 * geometry leaves this file: no label, file name or path (the pack's code is not trusted, and the windows
 * leave their titles behind for the same reason). `iconsFrom(icons, windows, origin, view)` puts them on the
 * pet window's page and works out which windows hide them; see there.
 *
 * - Windows: the desktop is a ListView (`SysListView32`) under `SHELLDLL_DefView`, itself under `Progman` or,
 *   once the wallpaper has been animated or changed, under one of the `WorkerW` windows. The ListView lives in
 *   explorer.exe, so its item rects are asked for with a RECT allocated in explorer (`VirtualAllocEx`), filled
 *   by `LVM_GETITEMRECT` (`LVIR_ICON`: the image, not its label) and read back (`ReadProcessMemory`). Every
 *   message goes through `SendMessageTimeoutW` with `SMTO_ABORTIFHUNG`, so a hung explorer costs one timeout
 *   and never hangs the window process. The rects are in the ListView's client pixels: `ClientToScreen` gives
 *   physical screen pixels, and each corner goes to DIPs with the scale of the display it is on, as the windows
 *   do. Hidden desktop icons (the ListView not visible) read as none. A 32-bit build skips the read: its
 *   pointers cannot reach a 64-bit explorer's memory.
 * - macOS and Linux: not read yet (Finder's and the file managers' desktops are not windows one can ask), so
 *   `available` is false and a pack gets no `icons`.
 *
 * The cross-process read is kept for `ICONS_CACHE_MS` (icons seldom move), so a caller polling faster than that
 * costs only the copy. Any failure answers an empty list for that read; one that keeps the native calls from
 * loading answers null for good.
 */

/** Milliseconds a read of the icons is kept before explorer is asked again. */
const ICONS_CACHE_MS = 2000;
/** Most icons asked for on one read. */
const ICONS_MAX = 256;
/** Most icons one read reports on the page. */
const ICONS_PAGE_MAX = 128;
/** Most tops of icons one read reports. */
const ICON_LEDGES_MAX = 128;
/** Most `WorkerW` windows looked through for the desktop. */
const WORKERW_MAX = 64;

/**
 * Windows: `() => icons` in DIPs. `koffi` and `screen` may be fakes (tests/icons.test.ts): the calls are bound by
 * their signatures below and nothing else of koffi is used.
 */
function openWin32Icons(koffi, screen, arch = process.arch) {
  if (arch === 'ia32' || arch === 'arm') throw new Error('32-bit build: explorer is out of reach');
  const LVM_GETITEMCOUNT = 0x1004, LVM_GETITEMRECT = 0x100e, LVIR_ICON = 1;
  const PROCESS_VM_OPERATION = 0x0008, PROCESS_VM_READ = 0x0010, PROCESS_VM_WRITE = 0x0020;
  const MEM_COMMIT = 0x1000, MEM_RESERVE = 0x2000, MEM_RELEASE = 0x8000, PAGE_READWRITE = 0x04;
  const SMTO_BLOCK = 0x0001, SMTO_ABORTIFHUNG = 0x0002, SEND_TIMEOUT_MS = 200;
  const user32 = koffi.load('user32.dll'), kernel32 = koffi.load('kernel32.dll');
  const FindWindowW = user32.func('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *title)');
  const FindWindowExW = user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *title)');
  const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)');
  const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, void *pid)');
  const ClientToScreen = user32.func('int __stdcall ClientToScreen(intptr_t hwnd, void *point)');
  // LRESULT, WPARAM and LPARAM are pointer sized; the result is written to an 8-byte buffer (DWORD_PTR)
  const SendMessageTimeoutW = user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam, uint32_t flags, uint32_t timeout, void *result)');
  const OpenProcess = kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)');
  const CloseHandle = kernel32.func('int __stdcall CloseHandle(intptr_t handle)');
  const VirtualAllocEx = kernel32.func('intptr_t __stdcall VirtualAllocEx(intptr_t process, intptr_t address, uintptr_t size, uint32_t type, uint32_t protect)');
  const VirtualFreeEx = kernel32.func('int __stdcall VirtualFreeEx(intptr_t process, intptr_t address, uintptr_t size, uint32_t type)');
  const WriteProcessMemory = kernel32.func('int __stdcall WriteProcessMemory(intptr_t process, intptr_t address, void *buf, uintptr_t size, void *written)');
  const ReadProcessMemory = kernel32.func('int __stdcall ReadProcessMemory(intptr_t process, intptr_t address, void *buf, uintptr_t size, void *read)');
  const dip = (x, y) => { const p = screen.screenToDipPoint({ x, y }); return { x: Math.floor(p.x), y: Math.floor(p.y) }; };

  /** The desktop's ListView, or 0. */
  const listView = () => {
    let def = 0;
    const progman = FindWindowW('Progman', null);
    if (progman) def = FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
    for (let w = 0, i = 0; !def && i < WORKERW_MAX; i++) {
      w = FindWindowExW(0, w, 'WorkerW', null);
      if (!w) break;
      def = FindWindowExW(w, 0, 'SHELLDLL_DefView', null);
    }
    return def ? FindWindowExW(def, 0, 'SysListView32', null) : 0;
  };

  return () => {
    const lv = listView();
    if (!lv || !IsWindowVisible(lv)) return [];
    const pidBuf = Buffer.alloc(4), result = Buffer.alloc(8), rect = Buffer.alloc(16), origin = Buffer.alloc(8);
    /** Sends `msg`; the answer, or null when explorer did not answer in time. */
    const send = (msg, wParam, lParam) => {
      result.fill(0);
      if (!SendMessageTimeoutW(lv, msg, wParam, lParam, SMTO_BLOCK | SMTO_ABORTIFHUNG, SEND_TIMEOUT_MS, result)) return null;
      return Number(result.readBigInt64LE(0));
    };
    const count = Math.min(ICONS_MAX, send(LVM_GETITEMCOUNT, 0, 0) ?? 0);
    if (count <= 0) return [];
    if (!ClientToScreen(lv, origin)) return [];
    const ox = origin.readInt32LE(0), oy = origin.readInt32LE(4);
    if (!GetWindowThreadProcessId(lv, pidBuf)) return [];
    const proc = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, 0, pidBuf.readUInt32LE(0));
    if (!proc) return [];
    const out = [];
    let remote = 0;
    try {
      remote = VirtualAllocEx(proc, 0, 16, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
      if (!remote) return [];
      for (let i = 0; i < count; i++) {
        // LVM_GETITEMRECT reads which part to measure from the RECT's left
        rect.fill(0);
        rect.writeInt32LE(LVIR_ICON, 0);
        if (!WriteProcessMemory(proc, remote, rect, 16, null)) break;
        if (!send(LVM_GETITEMRECT, i, remote)) continue;
        if (!ReadProcessMemory(proc, remote, rect, 16, null)) break;
        const l = rect.readInt32LE(0), t = rect.readInt32LE(4), r = rect.readInt32LE(8), b = rect.readInt32LE(12);
        const p = dip(ox + l, oy + t), q = dip(ox + r, oy + b);
        if (q.x > p.x && q.y > p.y) out.push({ id: String(i), x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y });
      }
    } finally {
      if (remote) VirtualFreeEx(proc, remote, 0, MEM_RELEASE);
      CloseHandle(proc);
    }
    return out;
  };
}

const OPENERS = { win32: openWin32Icons };

function createIconSource({ screen, platform = process.platform, loadKoffi = () => require('koffi'), now = Date.now, arch = process.arch }) {
  const opener = OPENERS[platform];
  if (!opener) return { available: false, list: () => null };
  let read, cached = null, at = -Infinity;
  /** The desktop's icons (kept `ICONS_CACHE_MS`), [] when a read fails, null when the native calls will not load. */
  const list = () => {
    if (read === null) return null;
    if (!read) {
      try { read = opener(loadKoffi(), screen, arch); } catch { read = null; return null; }
    }
    const t = now();
    if (cached && t - at < ICONS_CACHE_MS) return cached;
    try { cached = read(); } catch { cached = []; }
    at = t;
    return cached;
  };
  return { available: true, list };
}

/** Rect `r` less rect `a`, as up to four rects (all `{ x0, y0, x1, y1 }`). */
function subtract(r, a) {
  if (a.x1 <= r.x0 || a.x0 >= r.x1 || a.y1 <= r.y0 || a.y0 >= r.y1) return [r];
  const out = [];
  if (a.y0 > r.y0) out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: a.y0 });
  if (a.y1 < r.y1) out.push({ x0: r.x0, y0: a.y1, x1: r.x1, y1: r.y1 });
  const y0 = Math.max(r.y0, a.y0), y1 = Math.min(r.y1, a.y1);
  if (a.x0 > r.x0) out.push({ x0: r.x0, y0, x1: a.x0, y1 });
  if (a.x1 < r.x1) out.push({ x0: a.x1, y0, x1: r.x1, y1 });
  return out;
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
 * The icons of `icons` (screen DIPs) on the page of the pet window, with what the windows `windows` (screen DIPs,
 * the other windows as host/windows.cjs lists them; the desktop is below every one of them) hide of them.
 * `origin` is the pet window's top left on screen and `view` its `{ width, floor }`, as for `ledgesFrom`.
 *
 * - `icons`: `[{ id, x0, y0, x1, y1 }]` in page pixels, every icon that reaches onto the page above the floor and
 *   is not wholly behind windows, in the desktop's order, at most 128; `occluded: true` on one a window covers in part.
 * - `ledges`: the visible parts of those icons' top edges, `[{ id, x0, x1, y }]` (the shape of the windows' `ledges`
 *   with the icon's `id`), on the page and above the floor, highest first.
 */
function iconsFrom(icons, windows, origin, view) {
  const covers = (windows ?? []).map((w) => ({ x0: w.x - origin.x, y0: w.y - origin.y, x1: w.x - origin.x + w.w, y1: w.y - origin.y + w.h }));
  const out = [], ledges = [];
  for (const { id, x, y, w, h } of icons ?? []) {
    const r = { x0: x - origin.x, y0: y - origin.y, x1: x - origin.x + w, y1: y - origin.y + h };
    if (r.x1 <= 0 || r.x0 >= view.width || r.y1 <= 0 || r.y0 >= view.floor) continue;
    let left = [r];
    for (const a of covers) left = left.flatMap((p) => subtract(p, a));
    if (!left.length) continue;
    const occluded = left.length !== 1 || left[0] !== r;
    out.push(occluded ? { id, ...r, occluded: true } : { id, ...r });
    if (r.y0 > 0 && r.y0 < view.floor) {
      let spans = [[Math.max(0, r.x0), Math.min(view.width, r.x1)]];
      for (const a of covers) if (r.y0 >= a.y0 && r.y0 < a.y1) spans = spans.flatMap((s) => cut(s, [a.x0, a.x1]));
      for (const [a, b] of spans) if (b > a) ledges.push({ id, x0: a, x1: b, y: r.y0 });
    }
    if (out.length === ICONS_PAGE_MAX) break;
  }
  return { icons: out, ledges: ledges.sort((a, b) => a.y - b.y || a.x0 - b.x0).slice(0, ICON_LEDGES_MAX) };
}

module.exports = { createIconSource, iconsFrom, ICONS_CACHE_MS };
