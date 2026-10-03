'use strict';

/**
 * Enumerates visible Windows windows that can act as horizontal surfaces for the pet.
 * Standard opaque windows expose their visible top frame. Layered / transparent windows are
 * rasterised on their own (never from the composed desktop) and only long, nearly-horizontal
 * parts of their visible top contour become platforms. This keeps wallpaper pixels out of the
 * physics world while supporting arbitrary docks, clocks, widgets and overlay tools without
 * hard-coding application names.
 */

const SKIP_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'SHELLDLL_DefView',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'DV2ControlHost',
  'tooltips_class32',
  'SysShadow',
  '#32768',
  'IME',
  'MSCTFIME UI',
]);
const DESKTOP_HOST_CLASSES = new Set(['Progman', 'WorkerW', 'SHELLDLL_DefView']);
const SHAPE_CACHE_MS = 700;
const MAX_NATIVE_CAPTURE_PIXELS = 4_500_000;
const MAX_SAMPLE_W = 640;
const MAX_SAMPLE_H = 360;
const MIN_SURFACE_WIDTH = 44;
const shapeCache = new Map();

const native = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll'), gdi32 = koffi.load('gdi32.dll');
    let DwmGetWindowAttribute = null;
    try {
      const dwmapi = koffi.load('dwmapi.dll');
      DwmGetWindowAttribute = dwmapi.func('int __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, void *value, uint32_t size)');
    } catch {
      // GetWindowRect remains a usable fallback when DWM attributes are unavailable.
    }
    return {
      GetTopWindow: user32.func('intptr_t __stdcall GetTopWindow(intptr_t hwnd)'),
      GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
      GetParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
      IsWindowVisible: user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: user32.func('int __stdcall IsIconic(intptr_t hwnd)'),
      IsZoomed: user32.func('int __stdcall IsZoomed(intptr_t hwnd)'),
      GetWindowRect: user32.func('int __stdcall GetWindowRect(intptr_t hwnd, void *rect)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *text, int maxCount)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, void *text, int maxCount)'),
      GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)'),
      GetWindowDC: user32.func('void * __stdcall GetWindowDC(intptr_t hwnd)'),
      GetDC: user32.func('void * __stdcall GetDC(intptr_t hwnd)'),
      ReleaseDC: user32.func('int __stdcall ReleaseDC(intptr_t hwnd, void *hdc)'),
      PrintWindow: user32.func('int __stdcall PrintWindow(intptr_t hwnd, void *hdc, uint32_t flags)'),
      CreateCompatibleDC: gdi32.func('void * __stdcall CreateCompatibleDC(void *hdc)'),
      CreateCompatibleBitmap: gdi32.func('void * __stdcall CreateCompatibleBitmap(void *hdc, int w, int h)'),
      SelectObject: gdi32.func('void * __stdcall SelectObject(void *hdc, void *obj)'),
      StretchBlt: gdi32.func('int __stdcall StretchBlt(void *dst, int dx, int dy, int dw, int dh, void *src, int sx, int sy, int sw, int sh, uint32_t rop)'),
      PatBlt: gdi32.func('int __stdcall PatBlt(void *hdc, int x, int y, int w, int h, uint32_t rop)'),
      GetDIBits: gdi32.func('int __stdcall GetDIBits(void *hdc, void *hbm, uint32_t start, uint32_t lines, void *bits, void *bmi, uint32_t usage)'),
      DeleteObject: gdi32.func('int __stdcall DeleteObject(void *obj)'),
      DeleteDC: gdi32.func('int __stdcall DeleteDC(void *hdc)'),
      DwmGetWindowAttribute,
    };
  } catch {
    return null;
  }
})();

function wideText(fn, hwnd, max = 512) {
  const buf = Buffer.alloc(max * 2);
  const n = fn(hwnd, buf, max);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

function className(hwnd) {
  return wideText(native.GetClassNameW, hwnd, 256);
}

function readRect(hwnd) {
  const rect = Buffer.alloc(16);
  // Visible frame bounds omit the invisible resize border on normal application windows.
  if (native.DwmGetWindowAttribute && native.DwmGetWindowAttribute(hwnd, 9, rect, rect.length) === 0) {
    return {
      left: rect.readInt32LE(0), top: rect.readInt32LE(4),
      right: rect.readInt32LE(8), bottom: rect.readInt32LE(12),
    };
  }
  if (!native.GetWindowRect(hwnd, rect)) return null;
  return {
    left: rect.readInt32LE(0), top: rect.readInt32LE(4),
    right: rect.readInt32LE(8), bottom: rect.readInt32LE(12),
  };
}

function isCloaked(hwnd) {
  if (!native.DwmGetWindowAttribute) return false;
  const value = Buffer.alloc(4);
  return native.DwmGetWindowAttribute(hwnd, 14, value, value.length) === 0 && value.readUInt32LE(0) !== 0;
}

/** True when the window is actually hosted by the Windows desktop/wallpaper hierarchy. */
function isDesktopHosted(hwnd) {
  const seen = new Set();
  const queue = [];
  const parent = native.GetParent(hwnd);
  const owner = native.GetWindow(hwnd, 4); // GW_OWNER
  if (parent) queue.push(parent);
  if (owner) queue.push(owner);
  for (let i = 0; i < queue.length && i < 12; i++) {
    const h = queue[i];
    const id = BigInt(h).toString();
    if (seen.has(id)) continue;
    seen.add(id);
    if (DESKTOP_HOST_CLASSES.has(className(h))) return true;
    const p = native.GetParent(h), o = native.GetWindow(h, 4);
    if (p) queue.push(p);
    if (o) queue.push(o);
  }
  return false;
}

function bitmapBits(hdc, bitmap, w, h) {
  const bmi = Buffer.alloc(44);
  bmi.writeUInt32LE(40, 0);
  bmi.writeInt32LE(w, 4);
  bmi.writeInt32LE(-h, 8); // top-down rows
  bmi.writeUInt16LE(1, 12);
  bmi.writeUInt16LE(32, 14);
  const bits = Buffer.alloc(w * h * 4);
  return native.GetDIBits(hdc, bitmap, 0, h, bits, bmi, 0) === h ? bits : null;
}

/** Cheap window-local capture. It never samples the wallpaper behind the window. */
function captureFromWindowDC(hwnd, width, height, ow, oh) {
  const src = native.GetWindowDC(hwnd);
  if (!src) return null;
  const dc = native.CreateCompatibleDC(src), bmp = native.CreateCompatibleBitmap(src, ow, oh);
  if (!dc || !bmp) {
    if (bmp) native.DeleteObject(bmp);
    if (dc) native.DeleteDC(dc);
    native.ReleaseDC(hwnd, src);
    return null;
  }
  const old = native.SelectObject(dc, bmp);
  try {
    const ok = native.StretchBlt(dc, 0, 0, ow, oh, src, 0, 0, width, height, 0x00CC0020); // SRCCOPY
    if (!ok) return null;
    return bitmapBits(dc, bmp, ow, oh);
  } finally {
    native.SelectObject(dc, old);
    native.DeleteObject(bmp);
    native.DeleteDC(dc);
    native.ReleaseDC(hwnd, src);
  }
}

/**
 * More reliable fallback for classic layered windows. The target bitmap is cleared first, so
 * untouched transparent pixels stay black instead of containing random memory or wallpaper data.
 */
function captureViaPrintWindow(hwnd, width, height, ow, oh) {
  if (width * height > MAX_NATIVE_CAPTURE_PIXELS) return null;
  const screen = native.GetDC(0);
  if (!screen) return null;
  const fullDc = native.CreateCompatibleDC(screen), fullBmp = native.CreateCompatibleBitmap(screen, width, height);
  const smallDc = native.CreateCompatibleDC(screen), smallBmp = native.CreateCompatibleBitmap(screen, ow, oh);
  if (!fullDc || !fullBmp || !smallDc || !smallBmp) {
    if (fullBmp) native.DeleteObject(fullBmp);
    if (fullDc) native.DeleteDC(fullDc);
    if (smallBmp) native.DeleteObject(smallBmp);
    if (smallDc) native.DeleteDC(smallDc);
    native.ReleaseDC(0, screen);
    return null;
  }
  const oldFull = native.SelectObject(fullDc, fullBmp), oldSmall = native.SelectObject(smallDc, smallBmp);
  try {
    native.PatBlt(fullDc, 0, 0, width, height, 0x00000042); // BLACKNESS
    if (!native.PrintWindow(hwnd, fullDc, 2) && !native.PrintWindow(hwnd, fullDc, 0)) return null;
    if (!native.StretchBlt(smallDc, 0, 0, ow, oh, fullDc, 0, 0, width, height, 0x00CC0020)) return null;
    return bitmapBits(smallDc, smallBmp, ow, oh);
  } finally {
    native.SelectObject(fullDc, oldFull);
    native.SelectObject(smallDc, oldSmall);
    native.DeleteObject(fullBmp);
    native.DeleteObject(smallBmp);
    native.DeleteDC(fullDc);
    native.DeleteDC(smallDc);
    native.ReleaseDC(0, screen);
  }
}

function sampleGeometry(width, height) {
  const k = Math.min(1, MAX_SAMPLE_W / width, MAX_SAMPLE_H / height);
  return {
    w: Math.max(1, Math.round(width * k)),
    h: Math.max(1, Math.round(height * k)),
  };
}

function dominantBorderColor(bits, w, h) {
  const bins = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    const b = bits[i] >> 4, g = bits[i + 1] >> 4, r = bits[i + 2] >> 4;
    const key = (r << 8) | (g << 4) | b;
    bins.set(key, (bins.get(key) || 0) + 1);
  };
  const sx = Math.max(1, Math.floor(w / 80)), sy = Math.max(1, Math.floor(h / 50));
  for (let x = 0; x < w; x += sx) { add(x, 0); if (h > 1) add(x, h - 1); }
  for (let y = 1; y < h - 1; y += sy) { add(0, y); if (w > 1) add(w - 1, y); }
  let best = 0, count = -1;
  for (const [key, n] of bins) if (n > count) { best = key; count = n; }
  return { r: ((best >> 8) & 15) * 17, g: ((best >> 4) & 15) * 17, b: (best & 15) * 17 };
}

function imageVariance(bits, w, h) {
  let min = 255, max = 0;
  const step = Math.max(1, Math.floor((w * h) / 3000));
  for (let p = 0; p < w * h; p += step) {
    const i = p * 4;
    const l = Math.max(bits[i], bits[i + 1], bits[i + 2]);
    min = Math.min(min, l); max = Math.max(max, l);
  }
  return max - min;
}

/**
 * Converts the window-local image into a few stable horizontal support segments. Only the topmost
 * visible pixel of each sampled column participates, so internal wallpaper/image edges can never
 * turn into arbitrary mid-air floors.
 */
function contourSurfaces(bits, w, h, width, height, baseId) {
  if (!bits || imageVariance(bits, w, h) < 8) return [];
  const bg = dominantBorderColor(bits, w, h);
  const sx = width / w, sy = height / h;
  const top = new Array(w).fill(-1), bottom = new Array(w).fill(-1);
  let visible = 0;

  const isVisible = (x, y) => {
    const i = (y * w + x) * 4;
    const db = Math.abs(bits[i] - bg.b), dg = Math.abs(bits[i + 1] - bg.g), dr = Math.abs(bits[i + 2] - bg.r);
    return Math.max(dr, dg, db) >= 20;
  };

  for (let x = 0; x < w; x++) {
    let a = -1, z = -1;
    for (let y = 0; y < h; y++) {
      if (!isVisible(x, y)) continue;
      if (a < 0) a = y;
      z = y;
    }
    top[x] = a; bottom[x] = z;
    if (a >= 0) visible++;
  }
  if (visible * sx < MIN_SURFACE_WIDTH) return [];

  const maxGapCols = Math.max(1, Math.round(14 / sx));
  const levelToleranceRows = Math.max(1, Math.round(7 / sy));
  const out = [];
  let start = -1, last = -1, level = -1, count = 0, bottomMax = -1;

  const finish = () => {
    if (start < 0 || last < start) return;
    const left = start * sx, right = Math.min(width, (last + 1) * sx);
    if (right - left < MIN_SURFACE_WIDTH || count < 2) return;
    const topPx = Math.max(0, level * sy);
    out.push({
      id: `${baseId}:shape:${out.length}`,
      left,
      right,
      top: topPx,
      bottom: Math.max(topPx + Math.max(2, sy), (bottomMax + 1) * sy),
    });
  };

  for (let x = 0; x < w; x++) {
    const y = top[x];
    if (y < 0) {
      if (start >= 0 && x - last > maxGapCols) { finish(); start = last = level = -1; count = 0; bottomMax = -1; }
      continue;
    }
    if (start < 0) {
      start = last = x; level = y; count = 1; bottomMax = bottom[x];
      continue;
    }
    if (x - last <= maxGapCols && Math.abs(y - level) <= levelToleranceRows) {
      last = x; count++;
      level += (y - level) / Math.min(count, 8);
      bottomMax = Math.max(bottomMax, bottom[x]);
    } else {
      finish();
      start = last = x; level = y; count = 1; bottomMax = bottom[x];
    }
  }
  finish();
  return out.slice(0, 24);
}

function shapedWindowSurfaces(hwnd, id, rect) {
  const width = rect.right - rect.left, height = rect.bottom - rect.top;
  const now = Date.now(), key = `${width}x${height}`;
  const cached = shapeCache.get(id);
  if (cached && cached.key === key && now - cached.at < SHAPE_CACHE_MS) {
    return cached.parts.map((p) => ({ ...p, left: rect.left + p.left, right: rect.left + p.right, top: rect.top + p.top, bottom: rect.top + p.bottom }));
  }

  const { w, h } = sampleGeometry(width, height);
  let bits = captureFromWindowDC(hwnd, width, height, w, h);
  let parts = contourSurfaces(bits, w, h, width, height, `hwnd:${id}`);
  // Some classic layered windows expose only a blank window DC; ask the window to paint itself.
  if (!parts.length) {
    bits = captureViaPrintWindow(hwnd, width, height, w, h);
    parts = contourSurfaces(bits, w, h, width, height, `hwnd:${id}`);
  }
  shapeCache.set(id, { at: now, key, parts });
  return parts.map((p) => ({ ...p, left: rect.left + p.left, right: rect.left + p.right, top: rect.top + p.top, bottom: rect.top + p.bottom }));
}

/**
 * @param {(bigint|string|number)[]} excludedHwnds windows belonging to the pet itself or companion UI
 * @returns {{id:string,left:number,top:number,right:number,bottom:number,kind:string,className:string,title:string}[]}
 */
function scanWindowSurfaces(excludedHwnds = []) {
  if (!native) return [];
  const excluded = new Set(excludedHwnds.filter((v) => v != null).map((v) => BigInt(v).toString()));
  const out = [], live = new Set();
  const GW_HWNDNEXT = 2;
  let hwnd = native.GetTopWindow(0);

  for (let count = 0; hwnd && count < 4096; count++) {
    const id = BigInt(hwnd).toString();
    live.add(id);
    try {
      if (!excluded.has(id)
        && native.IsWindowVisible(hwnd)
        && !native.IsIconic(hwnd)
        && !native.IsZoomed(hwnd)
        && !isCloaked(hwnd)) {
        const cls = className(hwnd);
        if (!SKIP_CLASSES.has(cls) && !isDesktopHosted(hwnd)) {
          const rect = readRect(hwnd);
          const width = rect ? rect.right - rect.left : 0, height = rect ? rect.bottom - rect.top : 0;
          if (rect && width >= 24 && height >= 12) {
            const title = wideText(native.GetWindowTextW, hwnd, 512);
            const exStyle = native.GetWindowLongW(hwnd, -20) >>> 0; // GWL_EXSTYLE
            const layered = !!(exStyle & 0x00080000); // WS_EX_LAYERED
            const transparent = !!(exStyle & 0x00000020); // WS_EX_TRANSPARENT

            if (layered || transparent) {
              for (const p of shapedWindowSurfaces(hwnd, id, rect)) {
                out.push({ ...p, kind: 'shaped-window', className: cls, title, layered, transparent });
              }
            } else {
              out.push({
                id: `hwnd:${id}`,
                left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                kind: 'window', className: cls, title, layered, transparent,
              });
            }
          }
        }
      }
    } catch {
      // Windows can disappear between native calls; ignore that handle for this snapshot.
    }
    hwnd = native.GetWindow(hwnd, GW_HWNDNEXT);
  }

  // Do not retain shape bitmaps/metadata for windows that have gone away.
  for (const id of shapeCache.keys()) if (!live.has(id)) shapeCache.delete(id);
  return out;
}

module.exports = { scanWindowSurfaces };
