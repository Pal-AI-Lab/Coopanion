/**
 * macOS access, the same surface as `win32.ts`: screen capture through the system's
 * `screencapture`, mouse and keyboard as CoreGraphics events posted through koffi, the on-screen
 * window list from CGWindowListCopyWindowInfo, the seconds since the last hardware input, and
 * AppleScript for bringing an app forward and for the yes/no dialog.
 *
 * Coordinates are CoreGraphics points of the global display space (the main display's top-left
 * corner is (0, 0)); each display reports its own pixels per point, and a capture is at pixel size. macOS lets an app capture the screen only under Privacy & Security → Screen Recording,
 * and post input events only under Accessibility; the first use asks for each, and until they are
 * given the calls throw with where to turn them on. This module runs only inside the engine child.
 */
import koffi from 'koffi';
import jpeg from 'jpeg-js';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appleString, dialogAnswer, macKey, unicodeChunks } from './mac-keys.ts';
import { EngineFailure } from './fail.ts';
import type { NativeDisplay } from './display.ts';
import type { ForegroundWindow } from './foreground.ts';

const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
const services = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');

const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
const CGRect = koffi.struct('CGRect', { x: 'double', y: 'double', width: 'double', height: 'double' });
const CGSize = koffi.struct('CGSize', { width: 'double', height: 'double' });
const ProcessSerialNumber = koffi.struct('ProcessSerialNumber', { highLongOfPSN: 'uint32_t', lowLongOfPSN: 'uint32_t' });
const GetFrontProcess = services.func('int16_t GetFrontProcess(_Out_ ProcessSerialNumber *psn)');
const GetProcessPID = services.func('int32_t GetProcessPID(const ProcessSerialNumber *psn, _Out_ int32_t *pid)');
const CopyProcessName = services.func('int32_t CopyProcessName(const ProcessSerialNumber *psn, _Out_ void **name)');
const AXUIElementCreateApplication = services.func('void *AXUIElementCreateApplication(int32_t pid)');
const AXUIElementSetMessagingTimeout = services.func('int32_t AXUIElementSetMessagingTimeout(void *element, float seconds)');
const AXUIElementCopyAttributeValue = services.func('int32_t AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ void **value)');
const AXValueGetPoint = services.func('bool AXValueGetValue(void *value, uint32_t type, _Out_ CGPoint *point)');
const AXValueGetSize = services.func('bool AXValueGetValue(void *value, uint32_t type, _Out_ CGSize *size)');

const CGMainDisplayID = cg.func('uint32_t CGMainDisplayID()');
const CGGetActiveDisplayList = cg.func('int32_t CGGetActiveDisplayList(uint32_t max, uint32_t *displays, _Out_ uint32_t *count)');
const CGDisplayBounds = cg.func('CGRect CGDisplayBounds(uint32_t display)');
const CGDisplayCopyDisplayMode = cg.func('void *CGDisplayCopyDisplayMode(uint32_t display)');
const CGDisplayModeGetPixelWidth = cg.func('size_t CGDisplayModeGetPixelWidth(void *mode)');
const CGDisplayModeGetWidth = cg.func('size_t CGDisplayModeGetWidth(void *mode)');
const CGDisplayModeRelease = cg.func('void CGDisplayModeRelease(void *mode)');
const CGPreflightScreenCaptureAccess = cg.func('bool CGPreflightScreenCaptureAccess()');
const CGRequestScreenCaptureAccess = cg.func('bool CGRequestScreenCaptureAccess()');
const CGPreflightPostEventAccess = cg.func('bool CGPreflightPostEventAccess()');
const CGRequestPostEventAccess = cg.func('bool CGRequestPostEventAccess()');
const CGEventCreate = cg.func('void *CGEventCreate(void *source)');
const CGEventGetLocation = cg.func('CGPoint CGEventGetLocation(void *event)');
const CGEventCreateMouseEvent = cg.func('void *CGEventCreateMouseEvent(void *source, uint32_t type, CGPoint pos, uint32_t button)');
const CGEventCreateKeyboardEvent = cg.func('void *CGEventCreateKeyboardEvent(void *source, uint16_t key, bool down)');
const CGEventKeyboardSetUnicodeString = cg.func('void CGEventKeyboardSetUnicodeString(void *event, unsigned long length, const uint16_t *chars)');
const CGEventSetFlags = cg.func('void CGEventSetFlags(void *event, uint64_t flags)');
const CGEventSetIntegerValueField = cg.func('void CGEventSetIntegerValueField(void *event, uint32_t field, int64_t value)');
const CGEventPost = cg.func('void CGEventPost(uint32_t tap, void *event)');
const CGEventSourceSecondsSinceLastEventType = cg.func('double CGEventSourceSecondsSinceLastEventType(int32_t state, uint32_t type)');
const CGWindowListCopyWindowInfo = cg.func('void *CGWindowListCopyWindowInfo(uint32_t option, uint32_t relativeToWindow)');
const CGRectMakeWithDictionaryRepresentation = cg.func('bool CGRectMakeWithDictionaryRepresentation(void *dict, _Out_ CGRect *rect)');
// macOS 13 and later; earlier ones only have the variadic CGEventCreateScrollWheelEvent
const CGEventCreateScrollWheelEvent2 = (() => {
  try { return cg.func('void *CGEventCreateScrollWheelEvent2(void *source, uint32_t units, uint32_t count, int32_t w1, int32_t w2, int32_t w3)'); } catch { return null; }
})();
const CGEventCreateScrollWheelEvent = cg.func('void *CGEventCreateScrollWheelEvent(void *source, uint32_t units, uint32_t count, int32_t w1, ...)');

const CFRelease = cf.func('void CFRelease(void *ref)');
const CFArrayGetCount = cf.func('long CFArrayGetCount(void *array)');
const CFArrayGetValueAtIndex = cf.func('void *CFArrayGetValueAtIndex(void *array, long index)');
const CFDictionaryGetValue = cf.func('void *CFDictionaryGetValue(void *dict, void *key)');
const CFStringCreateWithCString = cf.func('void *CFStringCreateWithCString(void *alloc, const char *s, uint32_t encoding)');
const CFStringGetCString = cf.func('bool CFStringGetCString(void *s, uint8_t *buf, long size, uint32_t encoding)');
const CFNumberGetValue = cf.func('bool CFNumberGetValue(void *n, long type, _Out_ int64_t *value)');

const UTF8 = 0x08000100;
const HID_TAP = 0;
/** kCGEventSourceStateHIDSystemState: input from the hardware, not events posted by apps. */
const HID_STATE = 1;
const ANY_INPUT = 0xffffffff;
const EV = { move: 5, leftDown: 1, leftUp: 2, rightDown: 3, rightUp: 4, otherDown: 25, otherUp: 26, leftDrag: 6, rightDrag: 7, otherDrag: 27 };
const CLICK_STATE_FIELD = 1;
const LINE = 1;
/** Lines one wheel notch scrolls, as Windows scrolls three lines a notch. */
const LINES_PER_NOTCH = 3;
/** Most UTF-16 units one keyboard event carries. */
const UNICODE_CHUNK = 20;
/** A second press this soon and this close to the last counts as a double (or triple) click. */
const MULTI_CLICK_MS = 500, MULTI_CLICK_PX = 4;
/** Each Accessibility query has this budget, including when the foreground app is unresponsive. */
export const FOREGROUND_QUERY_TIMEOUT_MS = 200;

export interface Rect { x: number; y: number; width: number; height: number }

const t0 = Date.now();

/** Most displays asked for at once. */
const MAX_DISPLAYS = 16;

/** The active displays: bounds in points, and pixels per point from each one's mode. */
export function displays(): NativeDisplay[] {
  const ids = new Uint32Array(MAX_DISPLAYS), count = [0];
  if (CGGetActiveDisplayList(MAX_DISPLAYS, ids, count) !== 0) return [];
  const main = CGMainDisplayID();
  return [...ids.subarray(0, count[0])].map((id) => {
    const b = CGDisplayBounds(id) as Rect;
    const mode = CGDisplayCopyDisplayMode(id);
    let scale = 1;
    if (mode) {
      const pw = Number(CGDisplayModeGetPixelWidth(mode)), w = Number(CGDisplayModeGetWidth(mode));
      if (pw > 0 && w > 0) scale = pw / w;
      CGDisplayModeRelease(mode);
    }
    return { id: String(id), primary: id === main, x: b.x, y: b.y, width: b.width, height: b.height, scale };
  });
}

function needScreen(): void {
  if (CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()) return;
  throw new EngineFailure('macScreenPermission');
}

function needInput(): void {
  if (CGPreflightPostEventAccess() || CGRequestPostEventAccess()) return;
  throw new EngineFailure('macInputPermission');
}

/** Display `d` as top-down BGRA at its pixel size. */
export function capture(d: NativeDisplay): { width: number; height: number; bgra: Uint8Array } {
  needScreen();
  const dir = mkdtempSync(join(tmpdir(), 'cua-shot-'));
  const file = join(dir, 'screen.jpg');
  try {
    // -x: no sound, -R: a rectangle of the global space in points
    execFileSync('/usr/sbin/screencapture', ['-x', `-R${d.x},${d.y},${d.width},${d.height}`, '-t', 'jpg', file], { stdio: 'ignore', timeout: 15_000 });
    const img = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    const bgra = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    for (let i = 0; i < bgra.length; i += 4) { const r = bgra[i]!; bgra[i] = bgra[i + 2]!; bgra[i + 2] = r; }
    return { width: img.width, height: img.height, bgra };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pointerPoints(): { x: number; y: number } {
  const ev = CGEventCreate(null);
  const p = CGEventGetLocation(ev) as { x: number; y: number };
  CFRelease(ev);
  return p;
}

export function cursor(): { x: number; y: number } {
  return pointerPoints();
}

/** Milliseconds since the engine started, wrapping at 2^32 as Windows' tick does. */
export function tick(): number {
  return (Date.now() - t0) >>> 0;
}

/** Tick of the last input from the hardware. */
export function lastInputTick(): number {
  const secs = CGEventSourceSecondsSinceLastEventType(HID_STATE, ANY_INPUT) as number;
  return (tick() - Math.round(secs * 1000)) >>> 0;
}

function post(ev: unknown): void {
  CGEventPost(HID_TAP, ev);
  CFRelease(ev);
}

export type Button = 'left' | 'right' | 'middle';
const BUTTON: Record<Button, { down: number; up: number; drag: number; n: number }> = {
  left: { down: EV.leftDown, up: EV.leftUp, drag: EV.leftDrag, n: 0 },
  right: { down: EV.rightDown, up: EV.rightUp, drag: EV.rightDrag, n: 1 },
  middle: { down: EV.otherDown, up: EV.otherUp, drag: EV.otherDrag, n: 2 },
};

/** The button held down (moves become drags), and the last press, for counting double clicks. */
let held: Button | null = null;
let lastPress: { button: Button; at: number; x: number; y: number; count: number } | null = null;

/** Absolute move to a point of the global display space. */
export function moveTo(x: number, y: number): void {
  needInput();
  const b = held ? BUTTON[held] : null;
  post(CGEventCreateMouseEvent(null, b ? b.drag : EV.move, { x, y }, b ? b.n : 0));
}

function mouseEvent(button: Button, down: boolean): void {
  needInput();
  const p = pointerPoints();
  const spec = BUTTON[button];
  if (down) {
    const now = Date.now();
    const again = lastPress && lastPress.button === button && now - lastPress.at < MULTI_CLICK_MS
      && Math.abs(lastPress.x - p.x) <= MULTI_CLICK_PX && Math.abs(lastPress.y - p.y) <= MULTI_CLICK_PX;
    lastPress = { button, at: now, x: p.x, y: p.y, count: again ? lastPress!.count + 1 : 1 };
  }
  const ev = CGEventCreateMouseEvent(null, down ? spec.down : spec.up, p, spec.n);
  // macOS tells a double click by this count, not by the timing of two clicks
  CGEventSetIntegerValueField(ev, CLICK_STATE_FIELD, lastPress?.count ?? 1);
  post(ev);
  held = down ? button : null;
}

export function buttonDown(b: Button): void { mouseEvent(b, true); }
export function buttonUp(b: Button): void { mouseEvent(b, false); }

/** One notch per unit; positive `down` scrolls toward the end of a document. */
export function wheel(down: number, right: number): void {
  if (!down && !right) return;
  needInput();
  // macOS: a positive first wheel scrolls up, a positive second wheel scrolls left
  const w1 = -down * LINES_PER_NOTCH, w2 = -right * LINES_PER_NOTCH;
  post(CGEventCreateScrollWheelEvent2
    ? CGEventCreateScrollWheelEvent2(null, LINE, 2, w1, w2, 0)
    : CGEventCreateScrollWheelEvent(null, LINE, 2, w1, 'int32_t', w2));
}

function key(code: number, down: boolean, flags: number): void {
  const ev = CGEventCreateKeyboardEvent(null, code, down);
  CGEventSetFlags(ev, BigInt(flags));
  post(ev);
}

/** Presses `vks` (Windows virtual-key codes) in order with their modifiers held, then releases them in reverse. */
export function chord(vks: Array<{ vk: number; extended: boolean }>): void {
  needInput();
  const keys = vks.map((k) => {
    const m = macKey(k.vk);
    if (!m) throw new EngineFailure('macNoKey', [`0x${k.vk.toString(16)}`]);
    return m;
  });
  let flags = 0;
  for (const k of keys) { flags |= k.flag; key(k.key, true, flags); }
  for (const k of [...keys].reverse()) { flags &= ~k.flag; key(k.key, false, flags); }
}

/** Types text as Unicode key events, independent of the keyboard layout and input method. */
export function typeUnicode(text: string): void {
  needInput();
  const RETURN = macKey(0x0d)!.key;
  for (const line of text.replace(/\r/g, '').split(/(\n)/)) {
    if (line === '\n') { key(RETURN, true, 0); key(RETURN, false, 0); continue; }
    // AppKit consumers expect a character at a time, not a whole text run.
    const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line);
    for (const units of [...graphemes].flatMap(({ segment }) => unicodeChunks(segment, UNICODE_CHUNK))) {
      for (const down of [true, false]) {
        const ev = CGEventCreateKeyboardEvent(null, 0x31, down);
        // A preceding shortcut must not turn text into Command/Option key presses.
        CGEventSetFlags(ev, 0n);
        CGEventKeyboardSetUnicodeString(ev, units.length, units);
        post(ev);
      }
    }
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

const cfKeys = new Map<string, unknown>();
const cfKey = (name: string) => {
  let k = cfKeys.get(name);
  if (!k) { k = CFStringCreateWithCString(null, name, UTF8); cfKeys.set(name, k); }
  return k;
};
function cfString(dict: unknown, name: string): string {
  return readCfString(CFDictionaryGetValue(dict, cfKey(name)));
}
function readCfString(v: unknown): string {
  if (!v) return '';
  const buf = Buffer.alloc(1024);
  if (!CFStringGetCString(v, buf, buf.length, UTF8)) return '';
  return buf.subarray(0, buf.indexOf(0) < 0 ? buf.length : buf.indexOf(0)).toString('utf8');
}
function cfNumber(dict: unknown, name: string): number {
  const v = CFDictionaryGetValue(dict, cfKey(name));
  if (!v) return 0;
  const out = [0n];
  // kCFNumberSInt64Type
  return CFNumberGetValue(v, 4, out) ? Number(out[0]) : 0;
}

/** The app owning each window of the last enumeration, by process id. */
const apps = new Map<number, string>();

/** The app name of process `pid` as the last `windows()` saw it ("Terminal"). */
export function processName(pid: number): string | null {
  return apps.get(pid) ?? null;
}

function axAttribute(element: unknown, name: string): unknown {
  const value = [null];
  return AXUIElementCopyAttributeValue(element, cfKey(name), value) === 0 ? value[0] : null;
}

export function foregroundWindow(): ForegroundWindow | null {
  const psn = { highLongOfPSN: 0, lowLongOfPSN: 0 }, pid = [0], name = [null];
  if (GetFrontProcess(psn) !== 0 || GetProcessPID(psn, pid) !== 0) return null;
  CopyProcessName(psn, name);
  const app = readCfString(name[0]) || null;
  if (name[0]) CFRelease(name[0]);
  const element = AXUIElementCreateApplication(pid[0]);
  AXUIElementSetMessagingTimeout(element, FOREGROUND_QUERY_TIMEOUT_MS / 1000);
  const window = axAttribute(element, 'AXFocusedWindow');
  CFRelease(element);
  if (!window) return { title: '', app, rect: null };
  // Accessibility timeouts apply to individual elements and are not inherited by their windows.
  AXUIElementSetMessagingTimeout(window, FOREGROUND_QUERY_TIMEOUT_MS / 1000);
  const title = axAttribute(window, 'AXTitle');
  const position = axAttribute(window, 'AXPosition');
  const size = axAttribute(window, 'AXSize');
  try {
    const point = { x: 0, y: 0 }, extent = { width: 0, height: 0 };
    const rect = position && size && AXValueGetPoint(position, 1, point) && AXValueGetSize(size, 2, extent)
      ? { ...point, ...extent } : null;
    return { title: readCfString(title), app, rect };
  } finally {
    for (const value of [title, position, size, window]) if (value) CFRelease(value);
  }
}

/**
 * Ordinary windows on screen, front to back; the frontmost one belongs to the app in front.
 * Titles come only with the Screen Recording permission; without it a window is named by its app.
 */
export function windows(): WindowInfo[] {
  apps.clear();
  // kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements
  const list = CGWindowListCopyWindowInfo(1 | 16, 0);
  if (!list) return [];
  const out: WindowInfo[] = [];
  try {
    const n = Number(CFArrayGetCount(list));
    for (let i = 0; i < n; i++) {
      const w = CFArrayGetValueAtIndex(list, i);
      // layer 0 holds ordinary app windows; menus, the Dock and overlays sit above it
      if (cfNumber(w, 'kCGWindowLayer') !== 0) continue;
      const app = cfString(w, 'kCGWindowOwnerName');
      const name = cfString(w, 'kCGWindowName');
      const bounds = CFDictionaryGetValue(w, cfKey('kCGWindowBounds'));
      const r = { x: 0, y: 0, width: 0, height: 0 };
      if (bounds) CGRectMakeWithDictionaryRepresentation(bounds, r);
      if (r.width < 2 || r.height < 2) continue;
      const pid = cfNumber(w, 'kCGWindowOwnerPID');
      apps.set(pid, app);
      out.push({
        handle: `${pid}:${cfNumber(w, 'kCGWindowNumber')}`,
        title: name ? `${name} - ${app}` : app,
        pid,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        minimized: false,
        foreground: out.length === 0,
      });
    }
  } finally {
    CFRelease(list);
  }
  return out;
}

/** Brings the window's app to the front (System Events asks once for permission to be driven). */
export function focus(handle: string): boolean {
  const pid = Number(handle.split(':')[0]);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    execFileSync('/usr/bin/osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** A yes/no dialog in front of every window, answered or given up after `timeoutMs`. */
export function askYesNo(text: string, caption: string, { yes, no }: { yes: string; no: string }, timeoutMs: number): Promise<'yes' | 'no' | 'timeout'> {
  const script = `display dialog ${appleString(text)} with title ${appleString(caption)} buttons {${appleString(no)}, ${appleString(yes)}} default button ${appleString(yes)} giving up after ${Math.max(1, Math.round(timeoutMs / 1000))}`;
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: timeoutMs + 5000 }, (err, stdout) => {
      // "User canceled" and a closed dialog both come back as an error
      resolve(err ? 'no' : dialogAnswer(stdout, yes));
    });
  });
}
