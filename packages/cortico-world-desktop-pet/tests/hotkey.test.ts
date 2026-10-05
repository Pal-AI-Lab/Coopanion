import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTKEY, TAP_GAP_MS, TAP_MAX_MS, hotkeyBadge, hotkeyLabel, macReadable, parseHotkey, tapTracker } from '../src/asr/hotkey.ts';

describe('parseHotkey', () => {
  it('reads modifiers, letters, digits, function keys and mouse side buttons', () => {
    expect(parseHotkey('Ctrl+Space')).toEqual({ keys: [0x11, 0x20], taps: 1 });
    expect(parseHotkey('RightAlt+Q')).toEqual({ keys: [0xa5, 0x51], taps: 1 });
    expect(parseHotkey('F8')).toEqual({ keys: [0x77], taps: 1 });
    expect(parseHotkey('F24')).toEqual({ keys: [0x87], taps: 1 });
    expect(parseHotkey('7')).toEqual({ keys: [0x37], taps: 1 });
    expect(parseHotkey('Mouse4')).toEqual({ keys: [0x05], taps: 1 });
  });

  it('reads how many presses a key takes', () => {
    expect(parseHotkey('LeftAlt*2')).toEqual({ keys: [0xa4], taps: 2 });
    expect(parseHotkey('Ctrl+Space * 3')).toEqual({ keys: [0x11, 0x20], taps: 3 });
    expect(parseHotkey(DEFAULT_HOTKEY)).toEqual({ keys: [0xa4], taps: 2 });
  });

  it('rejects unknown names and an empty key', () => {
    expect(parseHotkey('Hyper')).toBeNull();
    expect(parseHotkey('F25')).toBeNull();
    expect(parseHotkey('')).toBeNull();
    expect(parseHotkey('*2')).toBeNull();
    expect(parseHotkey('LeftAlt*4')).toBeNull();
  });
});

describe('hotkeyLabel', () => {
  it('names keys the way the platform keyboard prints them', () => {
    expect(hotkeyLabel('RightCtrl', 'win32')).toBe('右 Ctrl');
    expect(hotkeyLabel('RightAlt', 'darwin')).toBe('右 Option');
    expect(hotkeyLabel('Win+Space', 'darwin')).toBe('Command + Space');
    expect(hotkeyLabel('LeftAlt*2', 'win32')).toBe('双击 左 Alt');
    expect(hotkeyLabel('LeftAlt*2', 'darwin')).toBe('双击 左 Option');
  });

  it('shortens the key for the microphone badge, sides dropped', () => {
    expect(hotkeyBadge('LeftAlt*2', 'win32')).toBe('Alt×2');
    expect(hotkeyBadge('LeftAlt*2', 'darwin')).toBe('Opt×2');
    expect(hotkeyBadge('RightCtrl+Space', 'win32')).toBe('Ctrl+Spc');
    expect(hotkeyBadge('Mouse4', 'win32')).toBe('M4');
  });
});

describe('tapTracker', () => {
  /** Feeds raw [down, ms] steps and returns what the hotkey did. */
  function run(taps: number, steps: Array<[boolean, number]>) {
    const out: string[] = [];
    const step = tapTracker(taps, (down) => out.push(down ? 'down' : 'up'), (n) => out.push(`tap${n}`));
    for (const [down, at] of steps) step(down, at);
    return out;
  }

  it('one press: down and up as the key goes', () => {
    expect(run(1, [[true, 0], [false, 2000]])).toEqual(['down', 'up']);
  });

  it('a quick tap, then a press held: down from the second press until it is let go', () => {
    expect(run(2, [[true, 0], [false, 100], [true, 250], [false, 3000]])).toEqual(['tap1', 'down', 'up']);
  });

  it('a press held too long is no tap, so the next one starts over', () => {
    // Alt held for Alt+Tab, then a press: nothing yet
    expect(run(2, [[true, 0], [false, TAP_MAX_MS + 1], [true, TAP_MAX_MS + 100], [false, TAP_MAX_MS + 150]])).toEqual(['tap1']);
  });

  it('a second press after the pause starts a new sequence', () => {
    expect(run(2, [[true, 0], [false, 100], [true, 100 + TAP_GAP_MS + 1], [false, 200 + TAP_GAP_MS], [true, 300 + TAP_GAP_MS], [false, 900 + TAP_GAP_MS]]))
      .toEqual(['tap1', 'tap1', 'down', 'up']);
  });
});

describe('the Mac key table', () => {
  it('covers every key a hotkey can name except the Windows-only ones', () => {
    const names = ['Ctrl', 'RightCtrl', 'Alt', 'LeftAlt', 'RightAlt', 'Shift', 'Win', 'RightWin', 'Space', 'Tab', 'Enter', 'Backquote', 'Mouse4', 'F1', 'F12', 'A', 'Z', '0', '9'];
    for (const n of names) expect(parseHotkey(n)!.keys.every(macReadable), n).toBe(true);
    // no Pause, Scroll Lock or F21–F24 on a Mac keyboard
    for (const n of ['Pause', 'ScrollLock', 'F21']) expect(parseHotkey(n)!.keys.every(macReadable), n).toBe(false);
  });
});
