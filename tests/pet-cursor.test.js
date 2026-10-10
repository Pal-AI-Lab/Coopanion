import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const HOST = new URL('../packages/cortico-world-desktop-pet/host/', import.meta.url);
const { createCursorSource } = require(fileURLToPath(new URL('cursor.cjs', HOST)));
const primary = {
  id: 1, nativeOrigin: { x: 0, y: 0 }, scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 32, width: 1440, height: 868 },
};
const secondary = {
  id: 2, nativeOrigin: { x: 2880, y: 0 }, scaleFactor: 1,
  bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
};

/** Xlib's pointer/out-parameter contract; only the native calls are replaced. */
function nativePointer() {
  const native = { point: { x: 40, y: 100 } };
  const connection = {}, root = 42;
  const calls = {
    XOpenDisplay: vi.fn(() => connection),
    XDefaultRootWindow: vi.fn(() => root),
    XQueryPointer: vi.fn((dpy, win, r, c, rx, ry) => {
      expect(dpy).toBe(connection);
      expect(win).toBe(root);
      rx[0] = native.point.x; ry[0] = native.point.y;
      return 1;
    }),
    XCloseDisplay: vi.fn(() => 0),
  };
  const loadKoffi = vi.fn(() => ({ load: (library) => {
    expect(library).toBe('libX11.so.6');
    return { func: (signature) => calls[signature.match(/\b(X\w+)\(/)[1]] };
  } }));
  return Object.assign(native, { calls, loadKoffi, connection });
}

function screenFor(displays = [primary, secondary]) {
  return Object.assign(new EventEmitter(), {
    getAllDisplays: vi.fn(() => displays),
    getPrimaryDisplay: () => displays[0],
    // Electron's stale value from #119, in DIPs, regardless of actual pointer movement.
    getCursorScreenPoint: vi.fn(() => ({ x: 20, y: 50 })),
    getDisplayNearestPoint: (p) => displays.find(({ bounds: b }) =>
      p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) ?? displays[0],
  });
}

describe('pet cursor source', () => {
  it('queries again on every read even while Electron keeps returning its first position', () => {
    const native = nativePointer(), screen = screenFor();
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual({ x: 20, y: 50 });
    native.point = { x: 2016, y: 1688 };
    expect(source.read()).toEqual({ x: 1008, y: 844 });
    expect(native.calls.XQueryPointer).toHaveBeenCalledTimes(2);
    expect(screen.getCursorScreenPoint).not.toHaveBeenCalled();
    source.close();
  });

  it.each([
    [{ x: 2016, y: 1688 }, { x: 1008, y: 844 }],
    [{ x: 2879, y: 100 }, { x: 1439, y: 50 }],
    [{ x: 2880, y: 100 }, { x: 1440, y: 100 }],
    [{ x: 3200, y: 200 }, { x: 1760, y: 200 }],
  ])('selects the monitor using physical coordinates: %j', (point, expected) => {
    const native = nativePointer(); native.point = point;
    const source = createCursorSource({ screen: screenFor(), platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual(expected);
    source.close();
  });

  it('handles a fractional-scale monitor left of the primary and re-reads a changed layout', () => {
    const left = {
      id: 3, nativeOrigin: { x: -1920, y: -150 }, scaleFactor: 1.5,
      bounds: { x: -1280, y: -100, width: 1280, height: 720 },
    };
    const native = nativePointer(), screen = screenFor([primary, left]);
    native.point = { x: -1001, y: 451 };
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual({ x: -668, y: 300 });
    screen.getAllDisplays.mockReturnValue([{ ...left, scaleFactor: 1, bounds: { x: -1920, y: -150, width: 1920, height: 1080 } }]);
    expect(source.read()).toEqual(native.point);
    source.close();
  });

  it.each(['darwin', 'win32'])('keeps Electron as the source on %s without loading Xlib', (platform) => {
    const native = nativePointer(), screen = screenFor();
    const source = createCursorSource({ screen, platform, loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual({ x: 20, y: 50 });
    expect(native.loadKoffi).not.toHaveBeenCalled();
    source.close();
  });

  it.each(['library', 'display', 'root'])('falls back if X11 setup fails at %s', (failure) => {
    const native = nativePointer(), screen = screenFor();
    if (failure === 'library') native.loadKoffi.mockImplementation(() => { throw new Error('missing Xlib'); });
    if (failure === 'display') native.calls.XOpenDisplay.mockReturnValue(null);
    if (failure === 'root') native.calls.XDefaultRootWindow.mockImplementation(() => { throw new Error('root unavailable'); });
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    expect(source.read()).toEqual({ x: 20, y: 50 });
    source.close();
    expect(native.calls.XCloseDisplay).toHaveBeenCalledTimes(failure === 'root' ? 1 : 0);
  });

  it('falls back on a failed query, retries the next sample, and closes its connection once', () => {
    const native = nativePointer(), screen = screenFor();
    const source = createCursorSource({ screen, platform: 'linux', loadKoffi: native.loadKoffi });
    native.point = { x: 400, y: 600 };
    native.calls.XQueryPointer.mockReturnValueOnce(0).mockImplementationOnce(() => { throw new Error('query failed'); });
    expect(source.read()).toEqual({ x: 20, y: 50 });
    expect(source.read()).toEqual({ x: 20, y: 50 });
    expect(source.read()).toEqual({ x: 200, y: 300 });
    source.close(); source.close();
    expect(native.calls.XCloseDisplay).toHaveBeenCalledTimes(1);
    expect(native.calls.XCloseDisplay).toHaveBeenCalledWith(native.connection);
    expect(source.read()).toEqual({ x: 20, y: 50 });
    expect(native.calls.XQueryPointer).toHaveBeenCalledTimes(3);
  });
});

/** The real host, preload and page pointer handlers, without a desktop or a running model. */
async function petWindow() {
  const native = nativePointer(), screen = screenFor(), timers = [], reports = [], flips = [];
  const app = Object.assign(new EventEmitter(), { whenReady: () => Promise.resolve() });
  const ipcMain = new EventEmitter(), ipcRenderer = new EventEmitter(), handlers = new Map();
  ipcMain.handle = (name, fn) => handlers.set(name, fn);
  ipcRenderer.send = (name, value) => { if (name === 'pet:interactive') flips.push(value); ipcMain.emit(name, {}, value); };
  ipcRenderer.invoke = (name, ...args) => Promise.resolve(handlers.get(name)({}, ...args));
  let win, host;
  class BrowserWindow extends EventEmitter {
    constructor() {
      super(); win = this;
      this.webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler() {}, setZoomLevel() {},
        send: (name, value) => { reports.push({ name, value }); ipcRenderer.emit(name, {}, value); },
      });
    }
    setBounds(bounds) { this.bounds = bounds; }
    getBounds() { return this.bounds; }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents(ignore) { this.ignore = ignore; }
    isVisible() { return true; }
    showInactive() {}
    loadURL() { this.emit('ready-to-show'); }
  }
  const electron = {
    app, BrowserWindow, ipcMain, ipcRenderer, screen,
    contextBridge: { exposeInMainWorld: (_name, value) => { host = value; } },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
  };
  const context = vm.createContext({
    require: (id) => id === 'electron' ? electron : id === './cursor.cjs'
      ? { createCursorSource: (options) => createCursorSource({ ...options, platform: 'linux', loadKoffi: native.loadKoffi }) }
      : require(id),
    module: { exports: {} }, __dirname: fileURLToPath(HOST), __filename: fileURLToPath(new URL('electron-main.cjs', HOST)),
    URL, Buffer, console, process: { platform: 'linux', argv: [] },
    setInterval: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, clearInterval() {},
  });
  vm.runInContext(readFileSync(new URL('electron-main.cjs', HOST), 'utf8'), context);
  context.module.exports.runPetHost({ url: 'http://127.0.0.1:12345/pet', tray: false });
  await Promise.resolve();
  vm.runInContext(readFileSync(new URL('preload.cjs', HOST), 'utf8'), vm.createContext({ require: () => electron }));

  const pageSource = readFileSync(new URL('../web/pet-app.js', HOST), 'utf8');
  const start = pageSource.indexOf('/* ---------- pointer ---------- */');
  const end = pageSource.indexOf("stage.addEventListener('pointerdown'", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const page = vm.createContext({
    host, document: {
      addEventListener() {},
      elementFromPoint: (x, y) => ({ closest: () => x >= 880 && x <= 980 && y >= 680 && y <= 750 }),
    },
    body: { hit: ({ x, y }) => Math.hypot(x - 1008, y - 812) < 40 },
    cursor: {}, at: () => ({ side: { x: 1008, y: 812 }, pressing: false }), shifting: false, followDrag() {},
    performance: { now: () => 0 }, console: { log() {} }, setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(pageSource.slice(start, end), page);
  const tick = () => timers.find(({ ms }) => ms === 100).fn();
  const move = (x, y) => { native.point = { x, y }; tick(); };
  return { native, screen, app, win, host, tick, move, reports, flips };
}

describe('Linux pet window cursor integration', () => {
  it('takes clicks on the body and bubble, then releases them, with no forwarded pointer events', async () => {
    const pet = await petWindow();
    expect(pet.win.ignore).toBe(true);
    pet.tick();
    pet.move(2016, 1688); // body (1008, 812), after 200% scaling and the top panel
    expect(pet.win.ignore).toBe(false);
    pet.move(1854, 1502); // bubble (927, 719)
    expect(pet.win.ignore).toBe(false);
    pet.move(100, 164); // transparent space (50, 50)
    expect(pet.win.ignore).toBe(true);
    expect(pet.flips).toEqual([false, true, false]);
    expect(pet.reports.map(({ value }) => value)).toEqual([
      { x: 20, y: 18 }, { x: 1008, y: 812 }, { x: 927, y: 719 }, { x: 50, y: 50 },
    ]);
    pet.tick();
    expect(pet.reports).toHaveLength(4); // stationary samples still avoid redundant IPC
    expect(pet.screen.getCursorScreenPoint).not.toHaveBeenCalled();
    pet.app.emit('will-quit');
    expect(pet.native.calls.XCloseDisplay).toHaveBeenCalledTimes(1);
  });

  it('uses the live cursor for crossing onto another display while dragging', async () => {
    const pet = await petWindow();
    pet.native.point = { x: 3200, y: 200 };
    expect(await pet.host.followCursor()).toEqual({ x: 320, y: 200, w: 1920, h: 1080, dx: -1440, dy: 32 });
    expect(pet.win.bounds).toEqual(secondary.workArea);
    pet.tick();
    expect(pet.reports.at(-1).value).toEqual({ x: 320, y: 200 });
    expect(await pet.host.followCursor()).toBeNull();
    expect(pet.screen.getCursorScreenPoint).not.toHaveBeenCalled();
    pet.app.emit('will-quit');
  });
});
