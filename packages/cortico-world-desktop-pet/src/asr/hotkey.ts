/**
 * The talk key: a hotkey held or pressed anywhere on the desktop, read by polling through koffi:
 * GetAsyncKeyState on Windows, CGEventSourceKeyState / CGEventSourceButtonState on macOS,
 * XQueryKeymap on Linux (X11 or XWayland). macOS
 * reads the keyboard only for an app the person allowed under Privacy & Security → Input
 * Monitoring; the first watch asks for it, and until it is given `watchHotkey` returns why.
 * Elsewhere, or when koffi does not load, `watchHotkey` returns the reason instead of a watcher.
 *
 * A hotkey is key names joined by `+` (`RightCtrl`, `Ctrl+Space`, `F8`, `Mouse4`); it is down
 * while every named key is down. `*2` or `*3` at the end asks for quick taps first: `LeftAlt*2`
 * is down from the second press of a quick tap and a press (tap once, then hold). The names are
 * Windows' (`Alt` is Option and `Win` is Command on a Mac); `parseHotkey` gives Windows
 * virtual-key codes, which the macOS reader maps to its own.
 */

const NAMED: Record<string, number> = {
  Ctrl: 0x11, LeftCtrl: 0xa2, RightCtrl: 0xa3,
  Alt: 0x12, LeftAlt: 0xa4, RightAlt: 0xa5,
  Shift: 0x10, LeftShift: 0xa0, RightShift: 0xa1,
  Win: 0x5b, RightWin: 0x5c,
  Space: 0x20, Tab: 0x09, CapsLock: 0x14, Backquote: 0xc0, Enter: 0x0d,
  Insert: 0x2d, Delete: 0x2e, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  Pause: 0x13, ScrollLock: 0x91,
  Mouse3: 0x04, Mouse4: 0x05, Mouse5: 0x06,
};

/** The talk key a new setup gets: a tap of left Alt (left Option on a Mac), then hold it. Every keyboard has one. */
export const DEFAULT_HOTKEY = 'LeftAlt*2';

export interface Hotkey {
  /** Virtual-key codes, all down together. */
  keys: number[];
  /** Presses it takes: the last one is the one held; the ones before are quick taps. */
  taps: number;
}

/** The keys and the press count of `hotkey` (`LeftAlt*2` → `LeftAlt`, 2). */
export function splitTaps(hotkey: string): { combo: string; taps: number } {
  const m = /^(.*?)\s*\*\s*([1-3])$/.exec(hotkey.trim());
  return m ? { combo: m[1]!, taps: Number(m[2]) } : { combo: hotkey.trim(), taps: 1 };
}

/** The keys and press count of `hotkey`, or null when a name is unknown. */
export function parseHotkey(hotkey: string): Hotkey | null {
  const { combo, taps } = splitTaps(hotkey);
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const codes: number[] = [];
  for (const p of parts) {
    let vk: number | undefined = NAMED[p];
    if (vk === undefined && /^[A-Z0-9]$/.test(p)) vk = p.charCodeAt(0);
    const fn = /^F([1-9]|1\d|2[0-4])$/.exec(p);
    if (vk === undefined && fn) vk = 0x6f + Number(fn[1]);
    if (vk === undefined) return null;
    codes.push(vk);
  }
  return { keys: codes, taps };
}

const LABELS: Record<string, string> = {
  LeftCtrl: '左 Ctrl', RightCtrl: '右 Ctrl', LeftAlt: '左 Alt', RightAlt: '右 Alt', LeftShift: '左 Shift', RightShift: '右 Shift',
  RightWin: '右 Win', Backquote: '`', Mouse3: '鼠标中键', Mouse4: '鼠标侧键 4', Mouse5: '鼠标侧键 5',
};
const MAC_LABELS: Record<string, string> = {
  ...LABELS,
  Ctrl: 'Control', LeftCtrl: '左 Control', RightCtrl: '右 Control',
  Alt: 'Option', LeftAlt: '左 Option', RightAlt: '右 Option', Win: 'Command', RightWin: '右 Command',
};

/** How the console names the keys of `hotkey` to a person, in the words of the platform's keyboard, without the taps. */
export function comboLabel(hotkey: string, platform: NodeJS.Platform = process.platform): string {
  const labels = platform === 'darwin' ? MAC_LABELS : LABELS;
  return splitTaps(hotkey).combo.split('+').map((k) => labels[k] ?? k).join(' + ');
}

const TAP_WORDS: Record<number, string> = { 2: '双击', 3: '三击' };

/** `hotkey` named in full: `双击 左 Alt` for `LeftAlt*2`. */
export function hotkeyLabel(hotkey: string, platform: NodeJS.Platform = process.platform): string {
  const { taps } = splitTaps(hotkey);
  const keys = comboLabel(hotkey, platform);
  return taps > 1 ? `${TAP_WORDS[taps]} ${keys}` : keys;
}

const SHORT: Record<string, string> = {
  Space: 'Spc', CapsLock: 'Caps', Backquote: '`', Insert: 'Ins', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn', ScrollLock: 'ScrLk',
  Mouse3: 'M3', Mouse4: 'M4', Mouse5: 'M5',
};
const MAC_SHORT: Record<string, string> = { ...SHORT, Alt: 'Opt', Win: 'Cmd' };

/** `hotkey` in a few letters for the pet's microphone button: `Alt×2` for `LeftAlt*2`, sides dropped. */
export function hotkeyBadge(hotkey: string, platform: NodeJS.Platform = process.platform): string {
  const short = platform === 'darwin' ? MAC_SHORT : SHORT;
  const { combo, taps } = splitTaps(hotkey);
  const keys = combo.split('+').map((k) => { const n = k.trim().replace(/^(Left|Right)/, ''); return short[n] ?? n; }).join('+');
  return taps > 1 ? `${keys}×${taps}` : keys;
}

/**
 * macOS key codes (kVK_*) for the Windows virtual-key codes `parseHotkey` gives; a code listed
 * with several keys is down when any of them is. Mouse buttons are CGMouseButton numbers, apart.
 */
const MAC_KEYS: Record<number, number[]> = {
  0x11: [0x3b, 0x3e], 0xa2: [0x3b], 0xa3: [0x3e],
  0x12: [0x3a, 0x3d], 0xa4: [0x3a], 0xa5: [0x3d],
  0x10: [0x38, 0x3c], 0xa0: [0x38], 0xa1: [0x3c],
  0x5b: [0x37, 0x36], 0x5c: [0x36],
  0x20: [0x31], 0x09: [0x30], 0x14: [0x39], 0xc0: [0x32], 0x0d: [0x24],
  0x2d: [0x72], 0x2e: [0x75], 0x24: [0x73], 0x23: [0x77], 0x21: [0x74], 0x22: [0x79],
  // A–Z and 0–9 where the ANSI layout places them
  0x41: [0x00], 0x42: [0x0b], 0x43: [0x08], 0x44: [0x02], 0x45: [0x0e], 0x46: [0x03], 0x47: [0x05], 0x48: [0x04], 0x49: [0x22],
  0x4a: [0x26], 0x4b: [0x28], 0x4c: [0x25], 0x4d: [0x2e], 0x4e: [0x2d], 0x4f: [0x1f], 0x50: [0x23], 0x51: [0x0c], 0x52: [0x0f],
  0x53: [0x01], 0x54: [0x11], 0x55: [0x20], 0x56: [0x09], 0x57: [0x0d], 0x58: [0x07], 0x59: [0x10], 0x5a: [0x06],
  0x30: [0x1d], 0x31: [0x12], 0x32: [0x13], 0x33: [0x14], 0x34: [0x15], 0x35: [0x17], 0x36: [0x16], 0x37: [0x1a], 0x38: [0x1c], 0x39: [0x19],
  // F1–F20
  0x70: [0x7a], 0x71: [0x78], 0x72: [0x63], 0x73: [0x76], 0x74: [0x60], 0x75: [0x61], 0x76: [0x62], 0x77: [0x64], 0x78: [0x65],
  0x79: [0x6d], 0x7a: [0x67], 0x7b: [0x6f], 0x7c: [0x69], 0x7d: [0x6b], 0x7e: [0x71], 0x7f: [0x6a], 0x80: [0x40], 0x81: [0x4f],
  0x82: [0x50], 0x83: [0x5a],
};
const MAC_BUTTONS: Record<number, number> = { 0x04: 2, 0x05: 3, 0x06: 4 };

/** The Windows virtual-key codes a Mac can read; the rest have no Mac key. */
export const macReadable = (vk: number): boolean => MAC_KEYS[vk] !== undefined || MAC_BUTTONS[vk] !== undefined;

export interface KeyWatcher {
  stop(): void;
}

/** Whether one Windows virtual-key code is down right now. */
type KeyReader = (vk: number) => boolean;

async function windowsReader(): Promise<KeyReader | string> {
  try {
    const koffi = (await import('koffi')).default;
    const getKey = koffi.load('user32.dll').func('short __stdcall GetAsyncKeyState(int vKey)') as (vk: number) => number;
    // the high bit is set while the key is down
    return (vk) => (getKey(vk) & 0x8000) !== 0;
  } catch (err) {
    return `读不了键盘状态:${(err as Error).message}`;
  }
}

async function macReader(keys: number[]): Promise<KeyReader | string> {
  if (!keys.every(macReadable)) return 'Mac 上没有这个按键,换一个说话键';
  try {
    const koffi = (await import('koffi')).default;
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const preflight = cg.func('bool CGPreflightListenEventAccess()') as () => boolean;
    const request = cg.func('bool CGRequestListenEventAccess()') as () => boolean;
    // asks once; the answer takes effect after the app restarts
    if (!preflight() && !request()) return '没有「输入监控」权限:在「系统设置 → 隐私与安全性 → 输入监控」里打开 Coopanion,再重启它';
    const keyState = cg.func('bool CGEventSourceKeyState(int32_t state, uint16_t key)') as (state: number, key: number) => boolean;
    const buttonState = cg.func('bool CGEventSourceButtonState(int32_t state, uint32_t button)') as (state: number, button: number) => boolean;
    // kCGEventSourceStateHIDSystemState: the hardware, whichever app has the keyboard
    const HID = 1;
    return (vk) => (MAC_BUTTONS[vk] !== undefined ? buttonState(HID, MAC_BUTTONS[vk]!) : (MAC_KEYS[vk] ?? []).some((k) => keyState(HID, k)));
  } catch (err) {
    return `读不了键盘状态:${(err as Error).message}`;
  }
}

/**
 * X11 keysyms for the Windows virtual-key codes `parseHotkey` gives; a code listed with several
 * keysyms is down when any of their keys is. The middle mouse button is read from the pointer.
 */
const LINUX_KEYS: Record<number, number[]> = {
  0x11: [0xffe3, 0xffe4], 0xa2: [0xffe3], 0xa3: [0xffe4],
  // right Alt is AltGr (ISO_Level3_Shift) on many layouts
  0x12: [0xffe9, 0xffea, 0xfe03], 0xa4: [0xffe9], 0xa5: [0xffea, 0xfe03],
  0x10: [0xffe1, 0xffe2], 0xa0: [0xffe1], 0xa1: [0xffe2],
  0x5b: [0xffeb, 0xffec], 0x5c: [0xffec],
  0x20: [0x20], 0x09: [0xff09], 0x14: [0xffe5], 0xc0: [0x60], 0x0d: [0xff0d],
  0x2d: [0xff63], 0x2e: [0xffff], 0x24: [0xff50], 0x23: [0xff57], 0x21: [0xff55], 0x22: [0xff56],
  0x13: [0xff13], 0x91: [0xff14],
};
const linuxKeysyms = (vk: number): number[] => LINUX_KEYS[vk]
  ?? (vk >= 0x41 && vk <= 0x5a ? [vk + 0x20] : vk >= 0x30 && vk <= 0x39 ? [vk] : vk >= 0x70 && vk <= 0x87 ? [0xffbe + vk - 0x70] : []);
/** Button2Mask of XQueryPointer's state: the middle button. The side buttons are not in it. */
const LINUX_BUTTONS: Record<number, number> = { 0x04: 1 << 9 };

/** The Windows virtual-key codes X11 can read here. */
export const linuxReadable = (vk: number): boolean => linuxKeysyms(vk).length > 0 || LINUX_BUTTONS[vk] !== undefined;

async function linuxReader(keys: number[]): Promise<KeyReader | string> {
  if (!keys.every(linuxReadable)) return 'Linux 上读不到这个按键(鼠标侧键不行),换一个说话键';
  if (!process.env.DISPLAY) return '按键收音在 Linux 上需要 X11(或 XWayland):没有找到 DISPLAY';
  try {
    const koffi = (await import('koffi')).default;
    const x11 = koffi.load('libX11.so.6');
    const open = x11.func('void *XOpenDisplay(const char *name)') as (name: null) => unknown;
    const dpy = open(null);
    if (!dpy) return '按键收音连不上 X11 显示';
    const keymap = x11.func('int XQueryKeymap(void *dpy, _Out_ uint8_t *keys)') as (d: unknown, out: Uint8Array) => number;
    const toCode = x11.func('uint8_t XKeysymToKeycode(void *dpy, unsigned long keysym)') as (d: unknown, sym: number) => number;
    const root = (x11.func('unsigned long XDefaultRootWindow(void *dpy)') as (d: unknown) => number)(dpy);
    const pointer = x11.func('int XQueryPointer(void *dpy, unsigned long w, _Out_ unsigned long *root, _Out_ unsigned long *child, _Out_ int *rx, _Out_ int *ry, _Out_ int *wx, _Out_ int *wy, _Out_ unsigned int *mask)') as (...a: unknown[]) => number;
    const codes = new Map(keys.map((vk) => [vk, linuxKeysyms(vk).map((s) => toCode(dpy, s)).filter(Boolean)]));
    const bits = new Uint8Array(32);
    // XQueryKeymap is the X server's own key state: under Wayland, XWayland knows it only while an X window has the keyboard
    return (vk) => {
      if (LINUX_BUTTONS[vk] !== undefined) {
        const m = [0];
        pointer(dpy, root, [0], [0], [0], [0], [0], [0], m);
        return (m[0]! & LINUX_BUTTONS[vk]!) !== 0;
      }
      keymap(dpy, bits);
      return (codes.get(vk) ?? []).some((c) => (bits[c >> 3]! & (1 << (c & 7))) !== 0);
    };
  } catch (err) {
    return `读不了键盘状态:${(err as Error).message}`;
  }
}

/**
 * Longest press that still counts as a tap before the held one. A deliberate tap lasts about
 * 100 ms; a key held for Alt+Tab or a shortcut lasts longer and starts nothing.
 */
export const TAP_MAX_MS = 300;
/** Longest pause between a tap's release and the next press; Windows' double-click time (500 ms, press to press) minus a tap. */
export const TAP_GAP_MS = 400;

/**
 * Turns the key's raw ups and downs into the hotkey's: with taps, the key is down only from the
 * last press of a quick sequence. `onTap` gets each finished quick tap (the count so far), so
 * the pet can react before the key is held.
 */
export function tapTracker(taps: number, onChange: (down: boolean) => void, onTap: (count: number) => void = () => {}) {
  let count = 0, lastUp = 0, pressAt = 0, active = false;
  return (down: boolean, now: number): void => {
    if (down) {
      if (count && now - lastUp > TAP_GAP_MS) count = 0;
      if (count === taps - 1) { count = 0; active = true; onChange(true); return; }
      pressAt = now;
      return;
    }
    if (active) { active = false; onChange(false); return; }
    if (now - pressAt <= TAP_MAX_MS) { count++; lastUp = now; onTap(count); } else count = 0;
  };
}

/** Calls `onChange` on every press and release of `hotkey`, and `onTap` on each quick tap before its held press. */
export async function watchHotkey(hotkey: Hotkey, onChange: (down: boolean) => void, pollMs: number, onTap?: (count: number) => void): Promise<KeyWatcher | string> {
  const { keys, taps } = hotkey;
  const reader = process.platform === 'win32' ? await windowsReader()
    : process.platform === 'darwin' ? await macReader(keys)
    : process.platform === 'linux' ? await linuxReader(keys)
    : '按键收音只在 Windows、macOS 和 Linux 上可用';
  if (typeof reader === 'string') return reader;
  const step = tapTracker(taps, onChange, onTap);
  let down = false;
  const timer = setInterval(() => {
    const now = keys.every((vk) => reader(vk));
    if (now === down) return;
    down = now;
    step(now, Date.now());
  }, pollMs);
  return { stop: () => clearInterval(timer) };
}
