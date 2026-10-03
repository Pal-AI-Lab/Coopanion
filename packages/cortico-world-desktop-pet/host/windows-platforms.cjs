'use strict';

/**
 * Enumerates visible top-level Windows windows that can act as horizontal surfaces for the pet.
 * Coordinates returned here are native screen pixels. The Electron host converts them to DIP and
 * then to pet-window-local coordinates.
 */

const SKIP_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'DV2ControlHost',
  'tooltips_class32',
  'SysShadow',
  '#32768',
  'IME',
  'MSCTFIME UI',
]);

const native = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll'), kernel32 = koffi.load('kernel32.dll');
    let DwmGetWindowAttribute = null;
    try {
      const dwmapi = koffi.load('dwmapi.dll');
      DwmGetWindowAttribute = dwmapi.func('int __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, void *value, uint32_t size)');
    } catch {
      // GetWindowRect is a good fallback on Windows versions/configurations without DWM access.
    }
    return {
      GetTopWindow: user32.func('intptr_t __stdcall GetTopWindow(intptr_t hwnd)'),
      GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
      IsWindowVisible: user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: user32.func('int __stdcall IsIconic(intptr_t hwnd)'),
      IsZoomed: user32.func('int __stdcall IsZoomed(intptr_t hwnd)'),
      GetWindowRect: user32.func('int __stdcall GetWindowRect(intptr_t hwnd, void *rect)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *text, int maxCount)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, void *text, int maxCount)'),
      GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, void *pid)'),
      OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)'),
      QueryFullProcessImageNameW: kernel32.func('int __stdcall QueryFullProcessImageNameW(void *process, uint32_t flags, void *name, void *size)'),
      CloseHandle: kernel32.func('int __stdcall CloseHandle(void *handle)'),
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

function readRect(hwnd) {
  const rect = Buffer.alloc(16);
  // DWMWA_EXTENDED_FRAME_BOUNDS gives the visible frame instead of the invisible resize border.
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
  // DWMWA_CLOAKED: non-zero windows are logically present but not actually shown.
  return native.DwmGetWindowAttribute(hwnd, 14, value, value.length) === 0 && value.readUInt32LE(0) !== 0;
}

function processName(hwnd) {
  const pidBuf = Buffer.alloc(4);
  native.GetWindowThreadProcessId(hwnd, pidBuf);
  const pid = pidBuf.readUInt32LE(0);
  if (!pid) return '';
  const process = native.OpenProcess(0x1000, 0, pid); // PROCESS_QUERY_LIMITED_INFORMATION
  if (!process) return '';
  try {
    const max = 1024, buf = Buffer.alloc(max * 2), size = Buffer.alloc(4);
    size.writeUInt32LE(max, 0);
    if (!native.QueryFullProcessImageNameW(process, 0, buf, size)) return '';
    const chars = Math.min(max, size.readUInt32LE(0));
    const full = buf.toString('utf16le', 0, chars * 2);
    return (full.split(/[\\/]/).pop() || '').toLowerCase();
  } catch {
    return '';
  } finally {
    native.CloseHandle(process);
  }
}

/**
 * @param {(bigint|string|number)[]} excludedHwnds windows belonging to the pet itself or companion UI
 * @returns {{id:string,left:number,top:number,right:number,bottom:number,kind:string,className:string,title:string}[]}
 */
function scanWindowSurfaces(excludedHwnds = []) {
  if (!native) return [];
  const excluded = new Set(excludedHwnds.filter((v) => v != null).map((v) => BigInt(v).toString()));
  const out = [];
  const GW_HWNDNEXT = 2;
  let hwnd = native.GetTopWindow(0);

  // Corrupt/hostile window lists should never spin the desktop-pet process forever.
  for (let count = 0; hwnd && count < 4096; count++) {
    const id = BigInt(hwnd).toString();
    try {
      if (!excluded.has(id)
        && native.IsWindowVisible(hwnd)
        && !native.IsIconic(hwnd)
        && !native.IsZoomed(hwnd)
        && !isCloaked(hwnd)) {
        const className = wideText(native.GetClassNameW, hwnd, 256);
        if (!SKIP_CLASSES.has(className)) {
          const rect = readRect(hwnd);
          const width = rect ? rect.right - rect.left : 0;
          const height = rect ? rect.bottom - rect.top : 0;
          // Ignore zero-sized helper windows and tiny popup fragments. Rainmeter skins are normally
          // comfortably above these thresholds even when visually sparse/transparent.
          if (rect && width >= 24 && height >= 12) {
            const title = wideText(native.GetWindowTextW, hwnd, 512);
            const process = processName(hwnd);
            const signature = `${process} ${className} ${title}`;
            // Wallpaper Engine is rendered desktop background, never a physical platform.
            const wallpaper = /^(?:wallpaper|webwallpaper)(?:32|64)?\.exe$/i.test(process)
              || /wallpaper engine/i.test(signature);
            if (wallpaper) { hwnd = native.GetWindow(hwnd, GW_HWNDNEXT); continue; }

            const rainmeter = process === 'rainmeter.exe' || /rainmeter/i.test(`${className} ${title}`);
            const mydockfinder = /^(?:dock(?:_64)?|mydockfinder)\.exe$/i.test(process)
              || /mydockfinder|dock_64/i.test(`${className} ${title}`);
            const exStyle = native.GetWindowLongW(hwnd, -20) >>> 0; // GWL_EXSTYLE
            const layered = !!(exStyle & 0x00080000); // WS_EX_LAYERED
            const transparent = !!(exStyle & 0x00000020); // WS_EX_TRANSPARENT
            // Unknown transparent/layered render surfaces are far too likely to be wallpaper,
            // overlays or invisible hit-test windows. Only known desktop widgets are solid.
            if ((layered || transparent) && !rainmeter && !mydockfinder) {
              hwnd = native.GetWindow(hwnd, GW_HWNDNEXT); continue;
            }
            out.push({
              id: `hwnd:${id}`,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              kind: rainmeter ? 'rainmeter' : mydockfinder ? 'mydockfinder' : 'window',
              className,
              title,
              processName: process,
              layered,
              transparent,
            });
          }
        }
      }
    } catch {
      // Windows can vanish between two native calls; skip that handle and continue the snapshot.
    }
    hwnd = native.GetWindow(hwnd, GW_HWNDNEXT);
  }
  return out;
}

module.exports = { scanWindowSurfaces };
