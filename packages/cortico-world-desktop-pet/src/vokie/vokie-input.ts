/**
 * Presses Vokie's own toggle shortcut, so that a long press of the remote's voice key stops the
 * dictation Vokie started on the press before the pet takes the same microphone.
 *
 * Vokie's Google TV remote starts a dictation on the voice key's press when its remote mode is
 * `toggle` (its default, `googleTvRemotePttMode`). The shortcut Vokie itself toggles dictation
 * with is written in its settings (`toggleConfig`), so it is read from there instead of being
 * duplicated in this World's configuration: `{ uniKey: 'K', modifiers: { ctrl: 'left', … } }`
 * becomes Ctrl+K, sent once through `SendInput` (the computer-use engine's `chord`, which is the
 * one keyboard path in this package) with no physical key involved.
 *
 * Nothing here runs on a platform where Vokie keeps no such settings file.
 */
import { readFileSync } from 'node:fs';
import type { Logger } from 'cortico/core/types.ts';

/** Vokie's settings, beside its logs. */
export function vokieSettingsFile(): string | null {
  if (process.platform !== 'win32' || !process.env.APPDATA) return null;
  return `${process.env.APPDATA}\\vokie\\app-settings.json`;
}

/** One shortcut as the Windows virtual-key codes to press, modifiers first. */
export type Shortcut = number[];

const NAMED: Readonly<Record<string, number>> = {
  space: 0x20, tab: 0x09, enter: 0x0d, escape: 0x1b, backspace: 0x08,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28, insert: 0x2d, delete: 0x2e, home: 0x24, end: 0x23,
  pageup: 0x21, pagedown: 0x22, capslock: 0x14, printscreen: 0x2c, pause: 0x13,
  leftctrl: 0xa2, rightctrl: 0xa3, leftalt: 0xa4, rightalt: 0xa5, leftshift: 0xa0, rightshift: 0xa1,
  leftwin: 0x5b, rightwin: 0x5c,
};

/** Keys that live on the extended keyboard and need `KEYEVENTF_EXTENDEDKEY` to be read as themselves. */
const EXTENDED: ReadonlySet<number> = new Set([0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x24, 0x23, 0x21, 0x22, 0xa3, 0xa5, 0x5b, 0x5c]);

/** The virtual-key code of a key name from Vokie's settings, or null for a name not known here. */
export function virtualKey(name: string): number | null {
  const key = name.trim().toLowerCase();
  if (key.length === 1 && key >= 'a' && key <= 'z') return key.toUpperCase().charCodeAt(0);
  if (key.length === 1 && key >= '0' && key <= '9') return key.charCodeAt(0);
  if (NAMED[key] !== undefined) return NAMED[key]!;
  const f = /^f([1-9]|1\d|2[0-4])$/.exec(key);
  if (f) return 0x6f + Number(f[1]);
  return null;
}

/**
 * The shortcut Vokie toggles dictation with, from its settings; null when the file cannot be read
 * or names a key this World cannot press. A shortcut of modifiers only is not one.
 */
export function readVokieToggle(file: string | null, log?: Logger): Shortcut | null {
  if (!file) return null;
  let settings: unknown;
  try {
    settings = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    log?.debug(`Vokie 设置没能读取:${(err as Error).message}`);
    return null;
  }
  const toggle = (settings as { toggleConfig?: { uniKey?: unknown; modifiers?: unknown } }).toggleConfig;
  if (!toggle || typeof toggle.uniKey !== 'string') return null;
  const key = virtualKey(toggle.uniKey);
  if (key === null) return null;
  const modifiers = (toggle.modifiers ?? {}) as Record<string, unknown>;
  const keys: number[] = [];
  if (modifiers.ctrl) keys.push(0x11);
  if (modifiers.alt) keys.push(0x12);
  if (modifiers.shift) keys.push(0x10);
  if (modifiers.meta) keys.push(0x5b);
  return [...keys, key];
}

/** Sends one shortcut now. Windows only; the computer-use engine's chord presses and releases it in one call. */
export class ShortcutPresser {
  private chord: ((keys: Array<{ vk: number; extended: boolean }>) => void) | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly log?: Logger) {}

  /** Sends `keys`; a failure is logged, never thrown into the voice path. */
  async press(keys: Shortcut): Promise<void> {
    if (process.platform !== 'win32' || keys.length === 0) return;
    if (!this.chord) {
      this.loading ??= this.load();
      await this.loading;
    }
    try {
      this.chord?.(keys.map((vk) => ({ vk, extended: EXTENDED.has(vk) })));
    } catch (err) {
      this.log?.warn(`没能按下 Vokie 的开关快捷键:${(err as Error).message}`);
    }
  }

  private async load(): Promise<void> {
    try {
      const { chord } = await import('../cua/engine/win32.ts');
      this.chord = chord;
    } catch (err) {
      this.log?.warn(`按键注入不可用:${(err as Error).message}`);
    }
  }
}
