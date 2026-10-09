/**
 * Win32 access through koffi: screen capture (GDI BitBlt with CAPTUREBLT, so layered and
 * transparent windows are included), SendInput for mouse and keyboard, the top-level window
 * list, focusing a window, and the last-input tick used to notice the user.
 *
 * All coordinates are physical pixels of the primary display. The process declares itself
 * per-monitor DPI aware (v2) before anything else, so no API here returns scaled values.
 * This module runs only inside the engine child process.
 */
import koffi from 'koffi';
import { EngineFailure } from './fail.ts';

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');
const kernel32 = koffi.load('kernel32.dll');
const dwmapi = koffi.load('dwmapi.dll');

koffi.alias('HANDLE', 'void *');
koffi.alias('HWND', 'HANDLE');

const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const LASTINPUTINFO = koffi.struct('LASTINPUTINFO', { cbSize: 'uint32_t', dwTime: 'uint32_t' });
const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
  biSize: 'uint32_t', biWidth: 'int32_t', biHeight: 'int32_t', biPlanes: 'uint16_t', biBitCount: 'uint16_t',
  biCompression: 'uint32_t', biSizeImage: 'uint32_t', biXPelsPerMeter: 'int32_t', biYPelsPerMeter: 'int32_t',
  biClrUsed: 'uint32_t', biClrImportant: 'uint32_t',
});
const MOUSEINPUT = koffi.struct('MOUSEINPUT', { dx: 'long', dy: 'long', mouseData: 'uint32_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
const KEYBDINPUT = koffi.struct('KEYBDINPUT', { wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', { uMsg: 'uint32_t', wParamL: 'uint16_t', wParamH: 'uint16_t' });
const INPUT = koffi.struct('INPUT', { type: 'uint32_t', u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }) });
const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, intptr_t lParam)');

const SetProcessDpiAwarenessContext = user32.func('bool __stdcall SetProcessDpiAwarenessContext(intptr_t value)');
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)');
const GetDC = user32.func('HANDLE __stdcall GetDC(HWND hwnd)');
const ReleaseDC = user32.func('int __stdcall ReleaseDC(HWND hwnd, HANDLE dc)');
const CreateCompatibleDC = gdi32.func('HANDLE __stdcall CreateCompatibleDC(HANDLE dc)');
const CreateCompatibleBitmap = gdi32.func('HANDLE __stdcall CreateCompatibleBitmap(HANDLE dc, int w, int h)');
const SelectObject = gdi32.func('HANDLE __stdcall SelectObject(HANDLE dc, HANDLE obj)');
const DeleteObject = gdi32.func('bool __stdcall DeleteObject(HANDLE obj)');
const DeleteDC = gdi32.func('bool __stdcall DeleteDC(HANDLE dc)');
const BitBlt = gdi32.func('bool __stdcall BitBlt(HANDLE dst, int x, int y, int w, int h, HANDLE src, int sx, int sy, uint32_t rop)');
const GetDIBits = gdi32.func('int __stdcall GetDIBits(HANDLE dc, HANDLE bmp, uint32_t start, uint32_t lines, void *bits, _Inout_ BITMAPINFOHEADER *bmi, uint32_t usage)');
const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *p)');
const SendInput = user32.func('uint32_t __stdcall SendInput(uint32_t count, INPUT *inputs, int size)');
const GetLastInputInfo = user32.func('bool __stdcall GetLastInputInfo(_Inout_ LASTINPUTINFO *info)');
const GetTickCount = kernel32.func('uint32_t __stdcall GetTickCount()');
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hwnd)');
const IsIconic = user32.func('bool __stdcall IsIconic(HWND hwnd)');
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(HWND hwnd, _Out_ uint16_t *buf, int max)');
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(HWND hwnd, _Out_ RECT *rect)');
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND hwnd, int index)');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hwnd, _Out_ uint32_t *pid)');
const GetForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow()');
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(HWND hwnd)');
const ShowWindow = user32.func('bool __stdcall ShowWindow(HWND hwnd, int cmd)');
const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(HWND hwnd)');
const DwmGetWindowAttributeInt = dwmapi.func('long __stdcall DwmGetWindowAttribute(HWND hwnd, uint32_t attr, _Out_ int *value, uint32_t size)');
const DwmGetWindowAttributeRect = dwmapi.func('long __stdcall DwmGetWindowAttribute(HWND hwnd, uint32_t attr, _Out_ RECT *value, uint32_t size)');
// exported by user32 since Windows XP without a header declaration; returns MB_TIMEDOUT when the time runs out
const MessageBoxTimeoutW = user32.func('int __stdcall MessageBoxTimeoutW(HWND hwnd, str16 text, str16 caption, uint32_t type, uint16_t lang, uint32_t ms)');

const SRCCOPY = 0x00CC0020, CAPTUREBLT = 0x40000000;
const INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
const MOUSEEVENTF = { MOVE: 0x1, LEFTDOWN: 0x2, LEFTUP: 0x4, RIGHTDOWN: 0x8, RIGHTUP: 0x10, MIDDLEDOWN: 0x20, MIDDLEUP: 0x40, WHEEL: 0x800, HWHEEL: 0x1000, VIRTUALDESK: 0x4000, ABSOLUTE: 0x8000 };
const KEYEVENTF = { EXTENDEDKEY: 0x1, KEYUP: 0x2, UNICODE: 0x4 };
const GWL_EXSTYLE = -20, WS_EX_TOOLWINDOW = 0x80;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
const SW_RESTORE = 9;
const MB_YESNO = 0x4, MB_ICONQUESTION = 0x20, MB_SETFOREGROUND = 0x10000, MB_TOPMOST = 0x40000;
const IDYES = 6, MB_TIMEDOUT = 32000;

SetProcessDpiAwarenessContext(-4);

export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

export function screenSize(): Size {
  return { width: GetSystemMetrics(0), height: GetSystemMetrics(1) };
}

/** The primary screen as top-down BGRA. */
export function capture(): { width: number; height: number; bgra: Buffer } {
  const { width, height } = screenSize();
  const screen = GetDC(null);
  const mem = CreateCompatibleDC(screen);
  const bmp = CreateCompatibleBitmap(screen, width, height);
  const old = SelectObject(mem, bmp);
  try {
    if (!BitBlt(mem, 0, 0, width, height, screen, 0, 0, SRCCOPY | CAPTUREBLT)) throw new EngineFailure('winBitBlt');
    const bgra = Buffer.alloc(width * height * 4);
    const header = { biSize: koffi.sizeof(BITMAPINFOHEADER), biWidth: width, biHeight: -height, biPlanes: 1, biBitCount: 32, biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 };
    // the full BITMAPINFO carries a color table after the header; 32 bpp BI_RGB uses none
    const lines = GetDIBits(mem, bmp, 0, height, bgra, header, 0);
    if (lines !== height) throw new EngineFailure('winGetDIBits', [lines, height]);
    return { width, height, bgra };
  } finally {
    SelectObject(mem, old);
    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(null, screen);
  }
}

export function cursor(): { x: number; y: number } {
  const p = { x: 0, y: 0 };
  GetCursorPos(p);
  return p;
}

/** Tick (ms since boot, wraps at 2^32) of the last input from any source. */
export function lastInputTick(): number {
  const info = { cbSize: koffi.sizeof(LASTINPUTINFO), dwTime: 0 };
  GetLastInputInfo(info);
  return info.dwTime;
}

export function tick(): number {
  return GetTickCount();
}

function send(inputs: unknown[]): void {
  const sent = SendInput(inputs.length, inputs, koffi.sizeof(INPUT));
  if (sent !== inputs.length) throw new EngineFailure('winSendInput', [sent, inputs.length]);
}

const mouse = (dwFlags: number, dx = 0, dy = 0, mouseData = 0) => ({ type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData, dwFlags, time: 0, dwExtraInfo: 0 } } });

/** Absolute move in physical pixels of the primary screen. */
export function moveTo(x: number, y: number): void {
  const { width, height } = screenSize();
  const nx = Math.round((x * 65535) / Math.max(1, width - 1));
  const ny = Math.round((y * 65535) / Math.max(1, height - 1));
  send([mouse(MOUSEEVENTF.MOVE | MOUSEEVENTF.ABSOLUTE, nx, ny)]);
}

export type Button = 'left' | 'right' | 'middle';
const BUTTON_FLAGS: Record<Button, [number, number]> = {
  left: [MOUSEEVENTF.LEFTDOWN, MOUSEEVENTF.LEFTUP],
  right: [MOUSEEVENTF.RIGHTDOWN, MOUSEEVENTF.RIGHTUP],
  middle: [MOUSEEVENTF.MIDDLEDOWN, MOUSEEVENTF.MIDDLEUP],
};

export function buttonDown(b: Button): void { send([mouse(BUTTON_FLAGS[b][0])]); }
export function buttonUp(b: Button): void { send([mouse(BUTTON_FLAGS[b][1])]); }

/** One wheel notch is 120; positive `down` scrolls toward the end of a document. */
export function wheel(down: number, right: number): void {
  const inputs = [];
  if (down) inputs.push(mouse(MOUSEEVENTF.WHEEL, 0, 0, (-down * 120) >>> 0));
  if (right) inputs.push(mouse(MOUSEEVENTF.HWHEEL, 0, 0, (right * 120) >>> 0));
  if (inputs.length) send(inputs);
}

const key = (vk: number, up: boolean, extended: boolean) => ({ type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: 0, dwFlags: (up ? KEYEVENTF.KEYUP : 0) | (extended ? KEYEVENTF.EXTENDEDKEY : 0), time: 0, dwExtraInfo: 0 } } });

/** Presses `vks` in order, then releases them in reverse. */
export function chord(vks: Array<{ vk: number; extended: boolean }>): void {
  send([...vks.map((k) => key(k.vk, false, k.extended)), ...[...vks].reverse().map((k) => key(k.vk, true, k.extended))]);
}

/** Types text as Unicode key events, independent of the keyboard layout and IME state. */
export function typeUnicode(text: string): void {
  const inputs = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (text[i] === '\n') {
      inputs.push(key(0x0D, false, false), key(0x0D, true, false));
      continue;
    }
    if (text[i] === '\r') continue;
    inputs.push({ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: unit, dwFlags: KEYEVENTF.UNICODE, time: 0, dwExtraInfo: 0 } } });
    inputs.push({ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: unit, dwFlags: KEYEVENTF.UNICODE | KEYEVENTF.KEYUP, time: 0, dwExtraInfo: 0 } } });
  }
  if (inputs.length) send(inputs);
}

export interface WindowInfo {
  handle: string;
  title: string;
  pid: number;
  rect: Rect;
  minimized: boolean;
  foreground: boolean;
}

function frameRect(hwnd: unknown): Rect {
  const r = { left: 0, top: 0, right: 0, bottom: 0 };
  if (DwmGetWindowAttributeRect(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, r, koffi.sizeof(RECT)) !== 0) GetWindowRect(hwnd, r);
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}

/** Handles from the last enumeration; `focus` takes a handle string from it. */
const known = new Map<string, unknown>();

/** Visible, titled, uncloaked top-level windows in z-order (topmost first). */
export function windows(): WindowInfo[] {
  known.clear();
  const fg = koffi.address(GetForegroundWindow());
  const out: WindowInfo[] = [];
  const buf = new Uint16Array(512);
  EnumWindows((hwnd: unknown) => {
    if (!IsWindowVisible(hwnd)) return true;
    if (Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) & WS_EX_TOOLWINDOW) return true;
    const cloaked = [0];
    if (DwmGetWindowAttributeInt(hwnd, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0] !== 0) return true;
    const n = GetWindowTextW(hwnd, buf, buf.length);
    if (n <= 0) return true;
    const title = String.fromCharCode(...buf.subarray(0, n));
    const pid = [0];
    GetWindowThreadProcessId(hwnd, pid);
    const address = koffi.address(hwnd);
    known.set(address.toString(16), hwnd);
    out.push({ handle: address.toString(16), title, pid: pid[0], rect: frameRect(hwnd), minimized: IsIconic(hwnd), foreground: address === fg });
    return true;
  }, 0);
  return out;
}

/** Restores and raises a window; Windows only lets the foreground process hand focus away, so an Alt tap goes first. */
export function focus(handle: string): boolean {
  if (!known.has(handle)) windows();
  const hwnd = known.get(handle);
  if (!hwnd) return false;
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
  chord([{ vk: 0x12, extended: false }]);
  const ok = SetForegroundWindow(hwnd);
  BringWindowToTop(hwnd);
  return ok;
}

/** A yes/no system dialog above every window. Runs on a koffi worker thread, so the engine keeps serving other requests. */
/** Windows names the two buttons itself, in its own language. */
export function askYesNo(text: string, caption: string, _labels: { yes: string; no: string }, timeoutMs: number): Promise<'yes' | 'no' | 'timeout'> {
  return new Promise((resolve, reject) => {
    MessageBoxTimeoutW.async(null, text, caption, MB_YESNO | MB_ICONQUESTION | MB_SETFOREGROUND | MB_TOPMOST, 0, timeoutMs, (err: unknown, r: number) => {
      if (err) reject(err as Error);
      else resolve(r === IDYES ? 'yes' : r === MB_TIMEDOUT ? 'timeout' : 'no');
    });
  });
}
