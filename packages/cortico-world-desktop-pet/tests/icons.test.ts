import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * `host/icons.cjs` is plain CommonJS outside the TypeScript project, reached through this facade. The Win32
 * read runs against a fake koffi: each call is bound by name from its signature, and explorer's memory is a map.
 */
const require_ = createRequire(import.meta.url);
interface Rect { id: string; x: number; y: number; w: number; h: number }
interface PageIcon { id: string; x0: number; y0: number; x1: number; y1: number; occluded?: true }
interface Source { available: boolean; list(): Rect[] | null }
const { createIconSource, iconsFrom, ICONS_CACHE_MS } = require_('../host/icons.cjs') as {
  createIconSource(o: { screen: unknown; platform?: string; loadKoffi?: () => unknown; now?: () => number; arch?: string }): Source;
  iconsFrom(icons: Rect[], windows: Rect[], origin: { x: number; y: number }, view: { width: number; floor: number }): { icons: PageIcon[]; ledges: Array<{ id: string; x0: number; x1: number; y: number }> };
  ICONS_CACHE_MS: number;
};

const view = { width: 1000, floor: 700 };
const icon = (id: string, x: number, y: number, s = 48): Rect => ({ id, x, y, w: s, h: s });

describe('iconsFrom', () => {
  it('puts icons on the page from the window origin and drops the ones off it or below the floor', () => {
    const { icons, ledges } = iconsFrom([icon('0', 110, 60), icon('1', -200, 60), icon('2', 110, 760), icon('3', 2000, 60)], [], { x: 100, y: 50 }, view);
    expect(icons).toEqual([{ id: '0', x0: 10, y0: 10, x1: 58, y1: 58 }]);
    expect(ledges).toEqual([{ id: '0', x0: 10, x1: 58, y: 10 }]);
  });

  it('leaves out an icon wholly behind windows, even behind two that only cover it together', () => {
    const wins = [{ id: 'a', x: 0, y: 0, w: 30, h: 100 }, { id: 'b', x: 30, y: 0, w: 100, h: 100 }];
    const { icons, ledges } = iconsFrom([icon('0', 10, 10), icon('1', 200, 10)], wins, { x: 0, y: 0 }, view);
    expect(icons.map((i) => i.id)).toEqual(['1']);
    expect(ledges.map((l) => l.id)).toEqual(['1']);
  });

  it('flags an icon a window covers in part, and keeps only the visible part of its top', () => {
    const { icons, ledges } = iconsFrom([icon('0', 100, 100)], [{ id: 'w', x: 0, y: 0, w: 120, h: 300 }], { x: 0, y: 0 }, view);
    expect(icons).toEqual([{ id: '0', x0: 100, y0: 100, x1: 148, y1: 148, occluded: true }]);
    expect(ledges).toEqual([{ id: '0', x0: 120, x1: 148, y: 100 }]);
    // a window over the icon's lower half hides none of the top
    const low = iconsFrom([icon('0', 100, 100)], [{ id: 'w', x: 0, y: 130, w: 500, h: 300 }], { x: 0, y: 0 }, view);
    expect(low.icons[0].occluded).toBe(true);
    expect(low.ledges).toEqual([{ id: '0', x0: 100, x1: 148, y: 100 }]);
  });

  it('gives tops highest first and clips them to the page', () => {
    const { ledges } = iconsFrom([icon('0', -20, 300), icon('1', 40, 200)], [], { x: 0, y: 0 }, view);
    expect(ledges).toEqual([{ id: '1', x0: 40, x1: 88, y: 200 }, { id: '0', x0: 0, x1: 28, y: 300 }]);
  });
});

/** A fake Win32: a desktop under `parent` with `rects` in the ListView's client pixels, its client origin at `client`. */
function fakeWin32({ parent = 'Progman', rects = [[20, 10, 68, 58], [20, 90, 68, 138]], client = [0, 0], visible = true, hung = false } = {}) {
  const mem = new Map<number, Buffer>();
  const log: string[] = [];
  let nextAddr = 0x7ff600000000;
  const HWND: Record<string, number> = { Progman: 0x10, WorkerW: 0x20, DefView: 0x30, ListView: 0x40 };
  const fns: Record<string, (...a: any[]) => any> = {
    FindWindowW: (cls: string) => (cls === 'Progman' ? HWND.Progman : 0),
    FindWindowExW: (p: number, after: number, cls: string) => {
      if (cls === 'WorkerW') return p === 0 && after === 0 ? HWND.WorkerW : 0;
      if (cls === 'SHELLDLL_DefView') return p === HWND[parent] ? HWND.DefView : 0;
      if (cls === 'SysListView32') return p === HWND.DefView ? HWND.ListView : 0;
      return 0;
    },
    IsWindowVisible: () => (visible ? 1 : 0),
    GetWindowThreadProcessId: (_h: number, pid: Buffer) => { pid.writeUInt32LE(4242, 0); return 7; },
    ClientToScreen: (_h: number, pt: Buffer) => { pt.writeInt32LE(pt.readInt32LE(0) + client[0], 0); pt.writeInt32LE(pt.readInt32LE(4) + client[1], 4); return 1; },
    SendMessageTimeoutW: (h: number, msg: number, wp: number, lp: number, _f: number, _t: number, res: Buffer) => {
      if (hung || h !== HWND.ListView) return 0;
      if (msg === 0x1004) { res.writeBigInt64LE(BigInt(rects.length), 0); return 1; }
      if (msg === 0x100e) {
        const buf = mem.get(lp);
        if (!buf || buf.readInt32LE(0) !== 1) { res.writeBigInt64LE(0n, 0); return 1; }
        rects[wp].forEach((v, i) => buf.writeInt32LE(v, i * 4));
        res.writeBigInt64LE(1n, 0);
        return 1;
      }
      return 0;
    },
    OpenProcess: (access: number, _i: number, pid: number) => { log.push(`open ${access.toString(16)} ${pid}`); return 0x99; },
    CloseHandle: (h: number) => { log.push(`close ${h.toString(16)}`); return 1; },
    VirtualAllocEx: (_p: number, _a: number, size: number) => { const a = nextAddr; nextAddr += 0x1000; mem.set(a, Buffer.alloc(size)); log.push('alloc'); return a; },
    VirtualFreeEx: (_p: number, a: number) => { mem.delete(a); log.push('free'); return 1; },
    WriteProcessMemory: (_p: number, a: number, buf: Buffer, n: number) => { buf.copy(mem.get(a)!, 0, 0, n); return 1; },
    ReadProcessMemory: (_p: number, a: number, buf: Buffer, n: number) => { mem.get(a)!.copy(buf, 0, 0, n); return 1; },
  };
  const koffi = {
    load: () => ({
      func: (sig: string) => {
        const name = /(\w+)\(/.exec(sig)![1];
        if (!fns[name]) throw new Error(`no fake for ${name}`);
        return fns[name];
      },
    }),
  };
  return { koffi, log, mem };
}

/** A screen at 150% everywhere. */
const screen = { screenToDipPoint: (p: { x: number; y: number }) => ({ x: p.x / 1.5, y: p.y / 1.5 }) };

describe('createIconSource on Windows', () => {
  it('reads the item rects through memory in explorer, in DIPs, and gives the memory and the handle back', () => {
    const fake = fakeWin32({ client: [30, 0] });
    const src = createIconSource({ screen, platform: 'win32', loadKoffi: () => fake.koffi, arch: 'x64' });
    expect(src.list()).toEqual([{ id: '0', x: 33, y: 6, w: 32, h: 32 }, { id: '1', x: 33, y: 60, w: 32, h: 32 }]);
    expect(fake.log).toEqual(['open 38 4242', 'alloc', 'free', 'close 99']);
    expect(fake.mem.size).toBe(0);
  });

  it('finds the desktop under a WorkerW when Progman has none', () => {
    const fake = fakeWin32({ parent: 'WorkerW' });
    expect(createIconSource({ screen, platform: 'win32', loadKoffi: () => fake.koffi, arch: 'x64' }).list()).toHaveLength(2);
  });

  it('reads none while the desktop icons are hidden or explorer does not answer', () => {
    for (const o of [{ visible: false }, { hung: true }]) {
      const fake = fakeWin32(o);
      expect(createIconSource({ screen, platform: 'win32', loadKoffi: () => fake.koffi, arch: 'x64' }).list()).toEqual([]);
      expect(fake.mem.size).toBe(0);
    }
  });

  it('keeps a read for ICONS_CACHE_MS', () => {
    let t = 0, reads = 0;
    const fake = fakeWin32();
    const k = fake.koffi, load = k.load;
    k.load = () => { const l = load(); return { func: (sig: string) => { const f = l.func(sig); return sig.includes('OpenProcess') ? (...a: any[]) => { reads++; return f(...a); } : f; } }; };
    const src = createIconSource({ screen, platform: 'win32', loadKoffi: () => k, now: () => t, arch: 'x64' });
    src.list(); t = ICONS_CACHE_MS - 1; src.list();
    expect(reads).toBe(1);
    t = ICONS_CACHE_MS; src.list();
    expect(reads).toBe(2);
  });

  it('fails soft: an empty list when a call throws, null when koffi will not load or the build is 32-bit', () => {
    const fake = fakeWin32();
    const broken = { load: () => ({ func: (sig: string) => (sig.includes('FindWindowW') ? () => { throw new Error('boom'); } : fake.koffi.load().func(sig)) }) };
    expect(createIconSource({ screen, platform: 'win32', loadKoffi: () => broken, arch: 'x64' }).list()).toEqual([]);
    expect(createIconSource({ screen, platform: 'win32', loadKoffi: () => { throw new Error('no koffi'); } }).list()).toBeNull();
    expect(createIconSource({ screen, platform: 'win32', loadKoffi: () => fake.koffi, arch: 'ia32' }).list()).toBeNull();
  });

  it('is not available on macOS or Linux', () => {
    for (const platform of ['darwin', 'linux']) {
      const src = createIconSource({ screen, platform });
      expect(src.available).toBe(false);
      expect(src.list()).toBeNull();
    }
  });
});
