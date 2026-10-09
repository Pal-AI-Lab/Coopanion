/**
 * Linux (X11) access, the same surface as `win32.ts`: screen capture with XGetImage on the root
 * window (where the X server has no picture of the screen, as a rootless XWayland under GNOME or
 * WSLg, a screenshot tool: grim, spectacle, scrot or ImageMagick's import), mouse and keyboard through the XTest extension, the window list and the active window
 * from the window manager's EWMH properties, the idle time from the MIT-SCREEN-SAVER extension,
 * `xdotool` for typing text and raising a window, and `zenity` for the yes/no dialog.
 *
 * X11 coordinates are physical pixels of the whole screen. Under a Wayland session this runs
 * through XWayland and sees only X11 clients; a session without an X server (no DISPLAY) is not
 * supported. This module runs only inside the engine child.
 */
import koffi from 'koffi';
import jpeg from 'jpeg-js';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linuxKeysym, zenityAnswer } from './linux-keys.ts';
import { EngineFailure } from './fail.ts';

const x11 = koffi.load('libX11.so.6');
const xtst = koffi.load('libXtst.so.6');
const xss = (() => { try { return koffi.load('libXss.so.1'); } catch { return null; } })();

const XImage = koffi.struct('XImage', {
  width: 'int', height: 'int', xoffset: 'int', format: 'int', data: 'void *',
  byte_order: 'int', bitmap_unit: 'int', bitmap_bit_order: 'int', bitmap_pad: 'int', depth: 'int',
  bytes_per_line: 'int', bits_per_pixel: 'int', red_mask: 'unsigned long', green_mask: 'unsigned long', blue_mask: 'unsigned long',
  obdata: 'void *', f: koffi.array('void *', 6),
});
const XScreenSaverInfo = koffi.struct('XScreenSaverInfo', {
  window: 'unsigned long', state: 'int', kind: 'int', til_or_since: 'unsigned long', idle: 'unsigned long', eventMask: 'unsigned long',
});

const XOpenDisplay = x11.func('void *XOpenDisplay(const char *name)');
const XDefaultRootWindow = x11.func('unsigned long XDefaultRootWindow(void *dpy)');
const XDefaultScreen = x11.func('int XDefaultScreen(void *dpy)');
const XDisplayWidth = x11.func('int XDisplayWidth(void *dpy, int screen)');
const XDisplayHeight = x11.func('int XDisplayHeight(void *dpy, int screen)');
const XGetImage = x11.func('XImage *XGetImage(void *dpy, unsigned long d, int x, int y, unsigned int w, unsigned int h, unsigned long planes, int format)');
const XDestroyImage = x11.func('int XDestroyImage(XImage *img)');
const XQueryPointer = x11.func('int XQueryPointer(void *dpy, unsigned long w, _Out_ unsigned long *root, _Out_ unsigned long *child, _Out_ int *rx, _Out_ int *ry, _Out_ int *wx, _Out_ int *wy, _Out_ unsigned int *mask)');
const XFlush = x11.func('int XFlush(void *dpy)');
const XSync = x11.func('int XSync(void *dpy, int discard)');
const XKeysymToKeycode = x11.func('uint8_t XKeysymToKeycode(void *dpy, unsigned long keysym)');
const XInternAtom = x11.func('unsigned long XInternAtom(void *dpy, const char *name, int onlyIfExists)');
const XGetWindowProperty = x11.func('int XGetWindowProperty(void *dpy, unsigned long w, unsigned long prop, long offset, long length, int del, unsigned long type, _Out_ unsigned long *actualType, _Out_ int *actualFormat, _Out_ unsigned long *nitems, _Out_ unsigned long *after, _Out_ void **data)');
const XFree = x11.func('int XFree(void *data)');
const XGetGeometry = x11.func('int XGetGeometry(void *dpy, unsigned long d, _Out_ unsigned long *root, _Out_ int *x, _Out_ int *y, _Out_ unsigned int *w, _Out_ unsigned int *h, _Out_ unsigned int *border, _Out_ unsigned int *depth)');
const XTranslateCoordinates = x11.func('int XTranslateCoordinates(void *dpy, unsigned long src, unsigned long dst, int x, int y, _Out_ int *dx, _Out_ int *dy, _Out_ unsigned long *child)');
const XErrorHandler = koffi.proto('int XErrorHandler(void *dpy, void *event)');
const XSetErrorHandler = x11.func('void *XSetErrorHandler(XErrorHandler *handler)');
const XTestFakeMotionEvent = xtst.func('int XTestFakeMotionEvent(void *dpy, int screen, int x, int y, unsigned long delay)');
const XTestFakeButtonEvent = xtst.func('int XTestFakeButtonEvent(void *dpy, unsigned int button, int press, unsigned long delay)');
const XTestFakeKeyEvent = xtst.func('int XTestFakeKeyEvent(void *dpy, unsigned int keycode, int press, unsigned long delay)');
const XScreenSaverQueryExtension = xss?.func('int XScreenSaverQueryExtension(void *dpy, _Out_ int *event, _Out_ int *error)') ?? null;
const XScreenSaverQueryInfo = xss?.func('int XScreenSaverQueryInfo(void *dpy, unsigned long d, _Out_ XScreenSaverInfo *info)') ?? null;

const ZPIXMAP = 2, ALL_PLANES = 0xffffffff;
const BUTTON: Record<Button, number> = { left: 1, middle: 2, right: 3 };

const dpy = XOpenDisplay(null);
if (!dpy) throw new EngineFailure('x11Display');
// a window closing between listing it and reading it raises BadWindow; Xlib's default handler would exit the process
XSetErrorHandler(koffi.register(() => 0, koffi.pointer(XErrorHandler)));
const root = XDefaultRootWindow(dpy);
const screen = XDefaultScreen(dpy);
const hasIdle = !!XScreenSaverQueryExtension && !!XScreenSaverQueryExtension(dpy, [0], [0]);
const t0 = Date.now();

export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

export function screenSize(): Size {
  return { width: XDisplayWidth(dpy, screen), height: XDisplayHeight(dpy, screen) };
}

/** Screenshot tools that write a JPEG, tried in order when the X server cannot give the picture. */
const TOOLS: Array<[string, (file: string) => string[]]> = [
  ['grim', (f) => ['-t', 'jpeg', f]],
  ['spectacle', (f) => ['-b', '-n', '-f', '-o', f]],
  ['scrot', (f) => ['-o', f]],
  ['import', (f) => ['-window', 'root', f]],
];

function captureWithTool(): { width: number; height: number; bgra: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), 'cua-shot-'));
  const file = join(dir, 'screen.jpg');
  try {
    for (const [cmd, args] of TOOLS) {
      try { execFileSync(cmd, args(file), { stdio: 'ignore', timeout: 15_000 }); } catch { continue; }
      const img = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
      const bgra = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      for (let i = 0; i < bgra.length; i += 4) { const r = bgra[i]!; bgra[i] = bgra[i + 2]!; bgra[i + 2] = r; }
      return { width: img.width, height: img.height, bgra };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  throw new EngineFailure('linuxNoScreenshot');
}

/** The whole screen as top-down BGRA. */
export function capture(): { width: number; height: number; bgra: Buffer } {
  const { width, height } = screenSize();
  const ptr = XGetImage(dpy, root, 0, 0, width, height, ALL_PLANES, ZPIXMAP);
  if (!ptr) return captureWithTool();
  try {
    const img = koffi.decode(ptr, XImage) as { data: unknown; bytes_per_line: number; bits_per_pixel: number; byte_order: number };
    if (img.bits_per_pixel !== 32 || img.byte_order !== 0) throw new EngineFailure('linuxPixelFormat', [img.bits_per_pixel]);
    // a copy: Electron's V8 sandbox does not allow an ArrayBuffer over outside memory (koffi.view)
    const src = koffi.decode(img.data, koffi.array('uint8_t', img.bytes_per_line * height, 'Typed')) as Uint8Array;
    const bgra = Buffer.alloc(width * height * 4);
    // 32-bit ZPixmap on a little-endian TrueColor visual is B, G, R, unused
    for (let y = 0; y < height; y++) {
      bgra.set(src.subarray(y * img.bytes_per_line, y * img.bytes_per_line + width * 4), y * width * 4);
    }
    for (let i = 3; i < bgra.length; i += 4) bgra[i] = 255;
    return { width, height, bgra };
  } finally {
    XDestroyImage(ptr);
  }
}

export function cursor(): { x: number; y: number } {
  const r = [0], c = [0], rx = [0], ry = [0], wx = [0], wy = [0], m = [0];
  XQueryPointer(dpy, root, r, c, rx, ry, wx, wy, m);
  return { x: rx[0]!, y: ry[0]! };
}

/** Milliseconds since the engine started, wrapping at 2^32 as Windows' tick does. */
export function tick(): number {
  return (Date.now() - t0) >>> 0;
}

/** Tick of the last input the X server saw. Without the screen-saver extension: an hour ago, so only pointer moves count. */
export function lastInputTick(): number {
  const info = { window: 0, state: 0, kind: 0, til_or_since: 0, idle: 0, eventMask: 0 };
  const idle = hasIdle && XScreenSaverQueryInfo!(dpy, root, info) ? Number(info.idle) : 3_600_000;
  return (tick() - idle) >>> 0;
}

export type Button = 'left' | 'right' | 'middle';

/** Absolute move in pixels of the screen. */
export function moveTo(x: number, y: number): void {
  XTestFakeMotionEvent(dpy, -1, Math.round(x), Math.round(y), 0);
  XFlush(dpy);
}

export function buttonDown(b: Button): void { XTestFakeButtonEvent(dpy, BUTTON[b], 1, 0); XFlush(dpy); }
export function buttonUp(b: Button): void { XTestFakeButtonEvent(dpy, BUTTON[b], 0, 0); XFlush(dpy); }

/** One notch per unit; positive `down` scrolls toward the end of a document. X11 wheels are buttons 4–7. */
export function wheel(down: number, right: number): void {
  const notch = (button: number, n: number) => {
    for (let i = 0; i < n; i++) { XTestFakeButtonEvent(dpy, button, 1, 0); XTestFakeButtonEvent(dpy, button, 0, 0); }
  };
  notch(down > 0 ? 5 : 4, Math.abs(down));
  notch(right > 0 ? 7 : 6, Math.abs(right));
  XFlush(dpy);
}

/** Presses `vks` (Windows virtual-key codes) in order with their modifiers held, then releases them in reverse. */
export function chord(vks: Array<{ vk: number; extended: boolean }>): void {
  const codes = vks.map((k) => {
    const sym = linuxKeysym(k.vk);
    const code = sym === null ? 0 : XKeysymToKeycode(dpy, sym);
    if (!code) throw new EngineFailure('linuxNoKey', [`0x${k.vk.toString(16)}`]);
    return code;
  });
  for (const c of codes) XTestFakeKeyEvent(dpy, c, 1, 0);
  for (const c of [...codes].reverse()) XTestFakeKeyEvent(dpy, c, 0, 0);
  XSync(dpy, 0);
}

/** Types text independent of the keyboard layout: xdotool maps each character to a spare keycode. */
export function typeUnicode(text: string): void {
  const clean = text.replace(/\r/g, '');
  if (!clean) return;
  try {
    execFileSync('xdotool', ['type', '--clearmodifiers', '--delay', '8', '--', clean], { stdio: 'ignore', timeout: 60_000 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new EngineFailure('linuxNoXdotool');
    throw e;
  }
}

export interface WindowInfo {
  handle: string;
  title: string;
  pid: number;
  rect: Rect;
  minimized: boolean;
  foreground: boolean;
}

const atoms = new Map<string, number>();
const atom = (name: string): number => {
  let a = atoms.get(name);
  if (a === undefined) { a = Number(XInternAtom(dpy, name, 0)); atoms.set(name, a); }
  return a;
};

/** A window property: numbers (32-bit format, as C longs) or bytes (8-bit format); null when absent. */
function prop(w: number, name: string): number[] | Buffer | null {
  const type = [0], format = [0], n = [0], after = [0], data = [null];
  if (XGetWindowProperty(dpy, w, atom(name), 0, 1 << 16, 0, 0, type, format, n, after, data) !== 0 || !data[0]) return null;
  try {
    const count = Number(n[0]);
    if (!count) return null;
    // decoded as a BigUint64Array: Array.from, since mapping a typed array writes back into it
    if (format[0] === 32) return Array.from(koffi.decode(data[0], koffi.array('unsigned long', count)) as ArrayLike<number | bigint>, Number);
    if (format[0] === 8) return Buffer.from(koffi.decode(data[0], koffi.array('uint8_t', count)) as number[]);
    return null;
  } finally {
    XFree(data[0]);
  }
}
const numbers = (v: number[] | Buffer | null): number[] => (Array.isArray(v) ? v : []);
const text = (v: number[] | Buffer | null): string => (Buffer.isBuffer(v) ? v.toString('utf8') : '');

function frame(w: number): Rect {
  const r = [0], x = [0], y = [0], wd = [0], ht = [0], b = [0], d = [0];
  if (!XGetGeometry(dpy, w, r, x, y, wd, ht, b, d)) return { x: 0, y: 0, width: 0, height: 0 };
  const ax = [0], ay = [0], child = [0];
  XTranslateCoordinates(dpy, w, root, 0, 0, ax, ay, child);
  return { x: ax[0]!, y: ay[0]!, width: wd[0]!, height: ht[0]! };
}

/** Managed top-level windows with a title, front to back, from the window manager's stacking list. */
export function windows(): WindowInfo[] {
  const active = numbers(prop(root, '_NET_ACTIVE_WINDOW'))[0] ?? 0;
  const stack = numbers(prop(root, '_NET_CLIENT_LIST_STACKING'));
  const list = stack.length ? stack : numbers(prop(root, '_NET_CLIENT_LIST'));
  const hidden = atom('_NET_WM_STATE_HIDDEN');
  const out: WindowInfo[] = [];
  for (const w of [...list].reverse()) {
    const title = text(prop(w, '_NET_WM_NAME')) || text(prop(w, 'WM_NAME'));
    if (!title) continue;
    const rect = frame(w);
    if (rect.width < 2 || rect.height < 2) continue;
    out.push({
      handle: w.toString(16),
      title,
      pid: numbers(prop(w, '_NET_WM_PID'))[0] ?? 0,
      rect,
      minimized: numbers(prop(w, '_NET_WM_STATE')).includes(hidden),
      foreground: w === active,
    });
  }
  return out;
}

/** Restores and raises a window through the window manager (xdotool sends _NET_ACTIVE_WINDOW). */
export function focus(handle: string): boolean {
  const id = Number.parseInt(handle, 16);
  if (!Number.isInteger(id) || id <= 0) return false;
  try {
    execFileSync('xdotool', ['windowactivate', '--sync', String(id)], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** A yes/no dialog answered or given up after `timeoutMs`; without zenity the answer is no. */
export function askYesNo(text: string, caption: string, { yes, no }: { yes: string; no: string }, timeoutMs: number): Promise<'yes' | 'no' | 'timeout'> {
  const secs = String(Math.max(1, Math.round(timeoutMs / 1000)));
  return new Promise((resolve) => {
    const p = execFile('zenity', ['--question', `--title=${caption}`, `--text=${text}`, `--ok-label=${yes}`, `--cancel-label=${no}`, `--timeout=${secs}`, '--no-markup'],
      { timeout: timeoutMs + 5000 }, () => { /* the exit code is read below */ });
    p.on('error', () => resolve('no'));
    p.on('exit', (code) => resolve(zenityAnswer(code)));
  });
}
