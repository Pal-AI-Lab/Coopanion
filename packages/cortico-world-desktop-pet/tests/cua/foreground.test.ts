import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  active: 2,
  accessible: true,
  inputTick: null as number | null,
  axAppDelayMs: 0,
  axWindowDelayMs: 0,
  axElapsedMs: 0,
  axTimeouts: new WeakMap<object, number>(),
  windows: new Map<number, { title: string; app: string; pid: number; tool: boolean; layer: number }>(),
  stack: [1, 2, 3],
  atoms: new Map<string, number>(),
  rect: { x: 120, y: 80, width: 640, height: 480 },
}));

// Model the native window state; production filtering and foreground readers run against it.
vi.mock('koffi', () => {
  const copyString = (s: string, buf: Uint16Array) => { for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i); return s.length; };
  const window = (id: number) => native.windows.get(id)!;
  const bounds = () => ({ left: native.rect.x, top: native.rect.y, right: native.rect.x + native.rect.width, bottom: native.rect.y + native.rect.height });
  const cfWindows = () => [...native.stack].reverse().map((id) => ({
    kCGWindowNumber: id, kCGWindowOwnerPID: window(id).pid, kCGWindowLayer: window(id).layer,
    kCGWindowName: window(id).title, kCGWindowOwnerName: window(id).app, kCGWindowBounds: native.rect,
  }));
  const xProperty = (id: number, name: string) => {
    if (id === 999) return name === '_NET_ACTIVE_WINDOW' ? [native.active] : native.stack;
    const w = window(id);
    if (name === '_NET_WM_NAME') return Buffer.from(w.title);
    if (name === '_NET_WM_PID') return [w.pid];
    return [];
  };
  return { default: {
    struct: (name: string) => name, union: () => 'union', alias: () => {}, proto: () => 'callback',
    array: () => 'array', pointer: (v: unknown) => v, register: (v: unknown) => v,
    sizeof: () => 16, address: (id: number | null) => BigInt(id ?? 0), decode: (value: unknown) => value,
    load: () => ({ func: (signature: string) => {
      const name = signature.match(/(\w+)\(/)![1];
      switch (name) {
        case 'GetLastInputInfo': return (info: { dwTime: number }) => {
          if (native.inputTick === null) return false;
          info.dwTime = native.inputTick; return true;
        };
        case 'GetForegroundWindow': return () => native.active || null;
        case 'EnumWindows': return (cb: (id: number) => void) => { for (const id of native.stack) cb(id); };
        case 'IsWindowVisible': return () => true;
        case 'GetWindowLongPtrW': return (id: number) => window(id).tool ? 0x80 : 0;
        case 'GetWindowTextW': return (id: number, buf: Uint16Array) => copyString(window(id).title, buf);
        case 'GetWindowThreadProcessId': return (id: number, pid: number[]) => { pid[0] = window(id).pid; };
        case 'DwmGetWindowAttribute': return (_: unknown, attr: number, out: object) => { Object.assign(out, attr === 14 ? { 0: 0 } : bounds()); return 0; };
        case 'OpenProcess': return (_: unknown, __: unknown, pid: number) => pid;
        case 'QueryFullProcessImageNameW': return (pid: number, _: unknown, buf: Uint16Array, size: number[]) => {
          size[0] = copyString(`C:\\apps\\${[...native.windows.values()].find((w) => w.pid === pid)!.app}`, buf); return true;
        };
        case 'XOpenDisplay': return () => 1;
        case 'XDefaultRootWindow': return () => 999;
        case 'XInternAtom': return (_: unknown, atom: string) => {
          if (!native.atoms.has(atom)) native.atoms.set(atom, native.atoms.size + 1);
          return native.atoms.get(atom);
        };
        case 'XGetWindowProperty': return (_: unknown, id: number, atom: number, _offset: number, _length: number, _delete: number, _requested: number, _type: number[], format: number[], n: number[], _after: number[], data: unknown[]) => {
          const key = [...native.atoms].find(([, value]) => value === atom)![0];
          const value = xProperty(id, key);
          data[0] = value; format[0] = Buffer.isBuffer(value) ? 8 : 32; n[0] = value.length; return 0;
        };
        case 'XGetGeometry': return (_: unknown, __: unknown, _root: number[], _x: number[], _y: number[], width: number[], height: number[]) => {
          width[0] = native.rect.width; height[0] = native.rect.height; return 1;
        };
        case 'XTranslateCoordinates': return (_: unknown, __: unknown, _root: number, _x: number, _y: number, x: number[], y: number[]) => {
          x[0] = native.rect.x; y[0] = native.rect.y; return 1;
        };
        case 'GetFrontProcess': return (psn: { lowLongOfPSN: number }) => { psn.lowLongOfPSN = native.active; return native.active ? 0 : -600; };
        case 'GetProcessPID': return (psn: { lowLongOfPSN: number }, pid: number[]) => { pid[0] = window(psn.lowLongOfPSN).pid; return 0; };
        case 'CopyProcessName': return (psn: { lowLongOfPSN: number }, name: unknown[]) => { name[0] = window(psn.lowLongOfPSN).app; return 0; };
        case 'AXUIElementCreateApplication': return () => ({ AXFocusedWindow: {
          AXTitle: window(native.active).title, AXPosition: { x: native.rect.x, y: native.rect.y },
          AXSize: { width: native.rect.width, height: native.rect.height },
        } });
        case 'AXUIElementSetMessagingTimeout': return (element: object, seconds: number) => {
          native.axTimeouts.set(element, seconds * 1000); return 0;
        };
        case 'AXUIElementCopyAttributeValue': return (element: Record<string, unknown>, attr: string, out: unknown[]) => {
          if (!native.accessible) return -25211;
          const delay = attr === 'AXFocusedWindow' ? native.axAppDelayMs : native.axWindowDelayMs;
          const timeout = native.axTimeouts.get(element) ?? Infinity;
          native.axElapsedMs += Math.min(delay, timeout);
          if (delay > timeout) return -25204;
          out[0] = element[attr] ?? null; return 0;
        };
        case 'AXValueGetValue': return (value: object, _: number, out: object) => { Object.assign(out, value); return true; };
        case 'CGWindowListCopyWindowInfo': return cfWindows;
        case 'CFArrayGetCount': return (list: unknown[]) => list.length;
        case 'CFArrayGetValueAtIndex': return (list: unknown[], index: number) => list[index];
        case 'CFStringCreateWithCString': return (_: unknown, value: string) => value;
        case 'CFDictionaryGetValue': return (dict: Record<string, unknown>, key: string) => dict[key];
        case 'CFNumberGetValue': return (value: number, _: unknown, out: bigint[]) => { out[0] = BigInt(value); return true; };
        case 'CFStringGetCString': return (value: string, buf: Buffer) => { buf.write(value); return true; };
        case 'CGRectMakeWithDictionaryRepresentation': return (rect: object, out: object) => { Object.assign(out, rect); return true; };
        default: return () => {};
      }
    } }),
  } };
});

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, readFileSync: (path: string, ...args: unknown[]) => {
    const match = /^\/proc\/(\d+)\/comm$/.exec(path);
    if (match) return [...native.windows.values()].find((w) => w.pid === Number(match[1]))!.app;
    return (fs.readFileSync as Function)(path, ...args);
  } };
});

import * as win32 from '../../src/cua/engine/win32.ts';
import * as linux from '../../src/cua/engine/linux.ts';
import * as darwin from '../../src/cua/engine/darwin.ts';

beforeEach(() => {
  native.active = 2;
  native.accessible = true;
  native.inputTick = null;
  native.axAppDelayMs = native.axWindowDelayMs = native.axElapsedMs = 0;
  native.axTimeouts = new WeakMap();
  native.stack = [1, 2, 3];
  native.windows.clear();
  native.windows.set(1, { title: 'Notes', app: 'notes', pid: 101, tool: false, layer: 0 });
  native.windows.set(2, { title: 'Pet typing', app: 'pet', pid: 102, tool: true, layer: 5 });
  native.windows.set(3, { title: '', app: 'panel', pid: 103, tool: false, layer: 8 });
});

describe('foreground windows', () => {
  it('reads a Windows tool window independently of the filtered list and focus handles', () => {
    expect(win32.windows().map((w) => w.title)).toEqual(['Notes']);
    expect(win32.foregroundWindow()).toEqual({ title: 'Pet typing', app: 'pet', rect: native.rect });
    expect(win32.focus('2')).toBe(false);
  });

  it('retains an untitled Windows keyboard target', () => {
    native.active = 3;
    expect(win32.windows().some((w) => w.foreground)).toBe(false);
    expect(win32.foregroundWindow()).toEqual({ title: '', app: 'panel', rect: native.rect });
  });

  it('reads the Linux active window even when untitled and absent from the stacking list', () => {
    native.active = 3;
    native.stack = [1, 2];
    expect(linux.windows().some((w) => w.foreground)).toBe(false);
    expect(linux.foregroundWindow()).toEqual({ title: '', app: 'panel', rect: native.rect });
  });

  it('reads the macOS focused window above layer zero, ignoring unrelated overlays', () => {
    expect(darwin.windows().map((w) => w.title)).toEqual(['Notes - notes']);
    expect(darwin.foregroundWindow()).toEqual({ title: 'Pet typing', app: 'pet', rect: native.rect });
  });

  it('retains the macOS foreground app when Accessibility cannot read its window', () => {
    native.accessible = false;
    expect(darwin.foregroundWindow()).toEqual({ title: '', app: 'pet', rect: null });
  });

  it('bounds a macOS foreground lookup when the app does not respond', () => {
    native.axAppDelayMs = darwin.FOREGROUND_QUERY_TIMEOUT_MS * 10;
    expect(darwin.foregroundWindow()).toEqual({ title: '', app: 'pet', rect: null });
    expect(native.axElapsedMs).toBeLessThanOrEqual(darwin.FOREGROUND_QUERY_TIMEOUT_MS);
  });

  it('bounds macOS window attribute reads independently of the app lookup', () => {
    native.axAppDelayMs = darwin.FOREGROUND_QUERY_TIMEOUT_MS / 2;
    native.axWindowDelayMs = darwin.FOREGROUND_QUERY_TIMEOUT_MS * 10;
    expect(darwin.foregroundWindow()).toEqual({ title: '', app: 'pet', rect: null });
    expect(native.axElapsedMs).toBeLessThanOrEqual(4 * darwin.FOREGROUND_QUERY_TIMEOUT_MS);
  });

  it.each([win32, linux, darwin])('reports no foreground target when the system has none', (os) => {
    native.active = 0;
    expect(os.foregroundWindow()).toBeNull();
  });
});

describe('system input availability', () => {
  it('distinguishes a Windows query failure from an input at tick zero', () => {
    expect(win32.lastInputTick()).toBeNull();
    native.inputTick = 0;
    expect(win32.lastInputTick()).toBe(0);
  });

  it('reports no input record on Linux without the screen-saver extension', () => {
    expect(linux.lastInputTick()).toBeNull();
  });
});
