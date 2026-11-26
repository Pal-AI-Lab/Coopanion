import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  wantsChars: false,
  nativeWindow: null as number | null,
  messages: [] as number[],
}));

vi.mock('../../src/cua/engine/win32-text-selection.ts', () => ({
  writableSelection: () => ({ nativeWindow: state.nativeWindow, focused: () => true, close: () => {} }),
}));

vi.mock('koffi', () => ({
  default: {
    struct: (name: string) => name, union: () => 'union', alias: () => {}, array: () => 'array', proto: () => 'callback',
    sizeof: () => 16, address: (value: number | null) => BigInt(value ?? 0),
    load: () => ({ func: (signature: string) => {
      const name = signature.match(/(\w+)\(/)![1];
      switch (name) {
        case 'GetForegroundWindow': return () => 10;
        case 'GetWindowThreadProcessId': return (_: number, pid: number[]) => { pid[0] = 42; return 7; };
        case 'GetKeyboardLayout': return () => 8;
        case 'GetGUIThreadInfo': return (_: number, gui: { hwndActive: number; hwndFocus: number }) => {
          gui.hwndActive = 10; gui.hwndFocus = 11; return true;
        };
        case 'IsWindowUnicode': return () => true;
        case 'ImmGetDefaultIMEWnd': return () => 12;
        case 'OpenProcess': return () => 1;
        case 'QueryFullProcessImageNameW': return (_: number, __: number, buf: Uint16Array, size: number[]) => {
          const path = 'C:\\test\\editor.exe';
          for (let i = 0; i < path.length; i++) buf[i] = path.charCodeAt(i);
          size[0] = path.length;
          return true;
        };
        case 'SendMessageTimeoutW': return (_: number, msg: number, __: number, ___: number, ____: number, _____: number, out: number[] | null) => {
          if (msg === 0x0283 && out) out[0] = 1;
          if (msg === 0x0087 && out) out[0] = state.wantsChars ? 0x80 : 0;
          if (msg === 0x0102 || msg === 0x0286) state.messages.push(msg);
          return 1;
        };
        default: return () => 1;
      }
    } }),
  },
}));

import { imeTextWriter } from '../../src/cua/engine/win32.ts';

beforeEach(() => {
  state.wantsChars = false;
  state.nativeWindow = null;
  state.messages = [];
});

describe('Windows IME character delivery', () => {
  it.each([
    ['a control requesting characters', true, 11, 0x0102],
    ['a selection owning the focused window', false, 11, 0x0286],
    ['a selection without a native window', false, null, 0x0102],
    ['a selection in a different native window', false, 13, 0x0102],
  ])('sends the correct message to %s', async (_label, wantsChars, nativeWindow, expected) => {
    state.wantsChars = wantsChars;
    state.nativeWindow = nativeWindow;
    const writer = await imeTextWriter('甲。', () => false);
    expect(writer).toBeDefined();
    try {
      expect(writer!.write('甲。')).toBe(2);
      expect(state.messages).toEqual([expected, expected]);
    } finally {
      writer!.close();
    }
  });
});
