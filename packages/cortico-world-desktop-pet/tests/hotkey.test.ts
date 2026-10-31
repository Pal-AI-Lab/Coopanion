import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTKEY, TAP_GAP_MS, TAP_MAX_MS, hotkeyBadge, hotkeyLabel, macModifierDown, macReadable, parseHotkey, tapTracker } from '../src/asr/hotkey.ts';

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
  function run(taps: number, steps: Array<[boolean, number]>, trigger: 'press' | 'hold' | 'tap' = 'press') {
    const out: string[] = [];
    const step = tapTracker(taps, (down) => out.push(down ? 'down' : 'up'), (n) => out.push(`tap${n}`), trigger);
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

  it.each([1, 2, 3])('hold with %i presses: quick taps never activate voice', (taps) => {
    const steps: Array<[boolean, number]> = [];
    for (let i = 0; i < taps * 2; i++) {
      const at = i * (TAP_MAX_MS + 50);
      steps.push([true, at], [true, at + TAP_MAX_MS], [false, at + TAP_MAX_MS]);
    }
    expect(run(taps, steps, 'hold').filter((event) => event === 'down' || event === 'up')).toEqual([]);
  });

  it.each([1, 2, 3])('hold with %i presses: activates once after the final press exceeds the tap limit', (taps) => {
    const steps: Array<[boolean, number]> = [];
    for (let i = 0; i < taps - 1; i++) steps.push([true, i * 100], [false, i * 100 + 50]);
    const at = (taps - 1) * 100;
    steps.push([true, at], [true, at + TAP_MAX_MS]);
    const ready = Array.from({ length: taps - 1 }, (_, i) => `tap${i + 1}`);
    expect(run(taps, steps, 'hold')).toEqual(ready);
    steps.push([true, at + TAP_MAX_MS + 1], [true, at + TAP_MAX_MS + 50], [false, at + TAP_MAX_MS + 100]);
    expect(run(taps, steps, 'hold')).toEqual([...ready, 'down', 'up']);
  });

  it('hold: a released short press cannot activate later or shorten the next hold', () => {
    const steps: Array<[boolean, number]> = [[true, 0], [false, TAP_MAX_MS - 1], [false, TAP_MAX_MS + 50], [true, TAP_MAX_MS + 100], [true, 2 * TAP_MAX_MS]];
    expect(run(1, steps, 'hold')).toEqual([]);
    steps.push([true, 2 * TAP_MAX_MS + 101], [false, 2 * TAP_MAX_MS + 150]);
    expect(run(1, steps, 'hold')).toEqual(['down', 'up']);
  });

  it('tap: opens typing only after the final quick release', () => {
    const steps: Array<[boolean, number]> = [[true, 0], [false, 50], [true, 100], [true, 100 + TAP_MAX_MS]];
    expect(run(2, steps, 'tap')).toEqual(['tap1']);
    steps.push([false, 100 + TAP_MAX_MS]);
    expect(run(2, steps, 'tap')).toEqual(['tap1', 'down', 'up']);
  });

  it('tap: holding the final press does not open typing, and the next sequence starts fresh', () => {
    expect(run(2, [[true, 0], [false, 50], [true, 100], [true, 101 + TAP_MAX_MS], [false, 150 + TAP_MAX_MS],
      [true, 200 + TAP_MAX_MS], [false, 250 + TAP_MAX_MS], [true, 300 + TAP_MAX_MS], [false, 350 + TAP_MAX_MS]], 'tap'))
      .toEqual(['tap1', 'tap1', 'down', 'up']);
  });

  it('press: repeated polling triggers toggle once on the final press', () => {
    expect(run(2, [[false, 0], [true, 50], [true, 100], [false, 150], [false, 200], [true, 250], [true, 300], [false, 350], [false, 400]]))
      .toEqual(['tap1', 'down', 'up']);
  });
});

describe('the Mac key table', () => {
  it('covers every key a hotkey can name except the Windows-only ones', () => {
    const names = ['Ctrl', 'RightCtrl', 'Alt', 'LeftAlt', 'RightAlt', 'Shift', 'Win', 'RightWin', 'Space', 'Tab', 'Enter', 'Backquote', 'Mouse4', 'F1', 'F12', 'A', 'Z', '0', '9'];
    for (const n of names) expect(parseHotkey(n)!.keys.every(macReadable), n).toBe(true);
    // no Pause, Scroll Lock or F21–F24 on a Mac keyboard
    for (const n of ['Pause', 'ScrollLock', 'F21']) expect(parseHotkey(n)!.keys.every(macReadable), n).toBe(false);
  });

  it('tells a right-hand modifier from the left one by the flags macOS reports', () => {
    // CGEventFlags with one right-hand key held: its device-independent mask, the non-coalesced bit and its device bit (IOLLEvent.h)
    const cases: Array<[right: string, either: string, left: string | null, flags: number]> = [
      ['RightAlt', 'Alt', 'LeftAlt', 0x80000 | 0x100 | 0x40],
      ['RightCtrl', 'Ctrl', 'LeftCtrl', 0x40000 | 0x100 | 0x2000],
      ['RightShift', 'Shift', 'LeftShift', 0x20000 | 0x100 | 0x4],
      ['RightWin', 'Win', null, 0x100000 | 0x100 | 0x10],
    ];
    const down = (name: string, flags: number) => macModifierDown(parseHotkey(name)!.keys[0]!, flags);
    for (const [right, either, left, flags] of cases) {
      expect(down(right, flags), right).toBe(true);
      expect(down(either, flags), either).toBe(true);
      if (left) expect(down(left, flags), `${left} while ${right} is held`).toBe(false);
    }
  });
});
