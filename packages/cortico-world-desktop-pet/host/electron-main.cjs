/**
 * Electron main process for the pet window.
 *
 * Run as `electron electron-main.cjs --pet-url=http://127.0.0.1:<port>/pet`, or call
 * `runPetHost({ url, parentPid })` from an app's own main process. With `--parent-pid=<pid>`
 * the window closes once that process exits. The window covers the work area of one display
 * (the primary one at start), short of the edge an auto-hidden taskbar waits on, is transparent
 * and always on top, and ignores the mouse until the page reports the pointer is over the figure,
 * a bubble or the menu. When the pet is carried onto
 * another display, the window moves to that display mid-drag; when its display is unplugged, it
 * moves to the primary one. A tray icon shows, hides and closes it; an embedding app that has its
 * own tray passes `tray: false`.
 *
 * On macOS the window shows on every Space and over full-screen apps, the process keeps out of
 * the Dock, and the microphone is asked for before the page opens it (the app's Info.plist
 * carries the reason macOS shows). The keyboard is not taken for a question's number keys there:
 * macOS gives no way to hand it back to the app that had it.
 *
 * The tray's words follow the app language the page reports (`petHost.setLanguage`), from the pages'
 * tables (web/i18n); the windows' titles are the pages' own.
 */
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, session, shell, systemPreferences } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

/** The pages' text table of `code`, falling back as web/i18n.js does. */
async function pageText(code) {
  const load = async (c) => {
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(c)) return null;
    try { return (await import(pathToFileURL(join(__dirname, '..', 'web', 'i18n', `${c}.js`)).href)).default; } catch { return null; }
  };
  return { ...await load('en'), ...await load(code === 'zh' || code === 'zh-Hant' ? 'zh' : 'en'), ...await load(code) };
}

/** Milliseconds between the cursor reports the page gets. */
const CURSOR_EVERY_MS = 100;
/** Milliseconds between the checks for a fullscreen window covering the pet's display. */
const FULLSCREEN_EVERY_MS = 200;
/** Most pixels one backdrop sample returns. */
const BACKDROP_SAMPLES = 1500;

/**
 * GDI calls for copying a small patch of the screen, or null off Windows or when koffi does not
 * load. A patch through BitBlt costs about a millisecond; a desktopCapturer frame of the whole
 * screen stalls the cursor.
 */
const gdi = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll'), gdi32 = koffi.load('gdi32.dll');
    return {
      GetDC: user32.func('void * __stdcall GetDC(void *hwnd)'),
      ReleaseDC: user32.func('int __stdcall ReleaseDC(void *hwnd, void *hdc)'),
      CreateCompatibleDC: gdi32.func('void * __stdcall CreateCompatibleDC(void *hdc)'),
      CreateCompatibleBitmap: gdi32.func('void * __stdcall CreateCompatibleBitmap(void *hdc, int w, int h)'),
      SelectObject: gdi32.func('void * __stdcall SelectObject(void *hdc, void *obj)'),
      StretchBlt: gdi32.func('int __stdcall StretchBlt(void *dst, int dx, int dy, int dw, int dh, void *src, int sx, int sy, int sw, int sh, uint32_t rop)'),
      GetDIBits: gdi32.func('int __stdcall GetDIBits(void *hdc, void *hbm, uint32_t start, uint32_t lines, void *bits, void *bmi, uint32_t usage)'),
      DeleteObject: gdi32.func('int __stdcall DeleteObject(void *obj)'),
      DeleteDC: gdi32.func('int __stdcall DeleteDC(void *hdc)'),
    };
  } catch {
    return null;
  }
})();

/**
 * Moving the keyboard between windows while the pet asks something. Windows keeps a background
 * process from bringing its window forward (`win.focus()` alone does nothing), unless its thread
 * shares input with the foreground one for the call. Null off Windows or when koffi does not load.
 */
const foreground = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll'), kernel32 = koffi.load('kernel32.dll');
    const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
    const SetForegroundWindow = user32.func('int __stdcall SetForegroundWindow(intptr_t hwnd)');
    const BringWindowToTop = user32.func('int __stdcall BringWindowToTop(intptr_t hwnd)');
    const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, void *pid)');
    const AttachThreadInput = user32.func('int __stdcall AttachThreadInput(uint32_t from, uint32_t to, int attach)');
    const GetCurrentThreadId = kernel32.func('uint32_t __stdcall GetCurrentThreadId()');
    return {
      /** The window with the keyboard now, 0n for none. */
      current: () => BigInt(GetForegroundWindow()),
      /** Gives `hwnd` the keyboard; true when Windows let it. */
      give(hwnd) {
        const cur = GetForegroundWindow();
        const them = cur ? GetWindowThreadProcessId(cur, null) : 0, me = GetCurrentThreadId();
        const attached = them && them !== me && AttachThreadInput(me, them, 1);
        try {
          BringWindowToTop(hwnd);
          return !!SetForegroundWindow(hwnd);
        } finally {
          if (attached) AttachThreadInput(me, them, 0);
        }
      },
    };
  } catch {
    return null;
  }
})();

/**
 * The screen edge the taskbar waits on while it hides itself ('left', 'top', 'right' or
 * 'bottom'), or null when it does not hide. Every display's taskbar shares the primary one's edge
 * and auto-hide setting. Always null off Windows or when koffi does not load.
 */
const autoHideTaskbarEdge = (() => {
  if (process.platform !== 'win32') return () => null;
  try {
    const koffi = require('koffi');
    const shell32 = koffi.load('shell32.dll');
    const RECT = koffi.struct('RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
    const APPBARDATA = koffi.struct('APPBARDATA', { cbSize: 'uint32_t', hWnd: 'void *', uCallbackMessage: 'uint32_t', uEdge: 'uint32_t', rc: RECT, lParam: 'intptr_t' });
    const SHAppBarMessage = shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ APPBARDATA *data)');
    const ABM_GETSTATE = 4, ABM_GETTASKBARPOS = 5, ABS_AUTOHIDE = 1;
    const data = () => ({ cbSize: koffi.sizeof(APPBARDATA), hWnd: null, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 });
    return () => {
      if (!(Number(SHAppBarMessage(ABM_GETSTATE, data())) & ABS_AUTOHIDE)) return null;
      const pos = data();
      if (!SHAppBarMessage(ABM_GETTASKBARPOS, pos)) return null;
      return ['left', 'top', 'right', 'bottom'][pos.uEdge] ?? null;
    };
  } catch {
    return () => null;
  }
})();

/**
 * DIP the window keeps off the display edge an auto-hidden taskbar waits on. Windows treats a
 * window covering a whole display as a full-screen app and keeps the taskbar from showing over it;
 * Chromium leaves 2 physical pixels on that edge of a maximized window for this. The display's
 * size in DIP is rounded and Electron rounds a window's far edge outward to whole pixels, so a gap
 * of g DIP comes out as at least (g − ½) × scale pixels rounded down: 3 DIP leaves 2 pixels from
 * 100% up, 2 DIP can leave 1 at 125%.
 */
const AUTOHIDE_TASKBAR_GAP = 3;

/** The part of display `d` the window covers: its work area, off the edge an auto-hidden taskbar waits on. */
function coverArea(d) {
  let { x, y, width, height } = d.workArea;
  const b = d.bounds, edge = autoHideTaskbarEdge(), gap = AUTOHIDE_TASKBAR_GAP;
  // only where the work area reaches that edge of the display
  if (edge === 'left' && x === b.x) { x += gap; width -= gap; }
  if (edge === 'top' && y === b.y) { y += gap; height -= gap; }
  if (edge === 'right' && x + width === b.x + b.width) width -= gap;
  if (edge === 'bottom' && y + height === b.y + b.height) height -= gap;
  return { x, y, width, height };
}

/** A window's HWND as a BigInt. */
function hwndOf(win) {
  const b = win.getNativeWindowHandle();
  return b.length === 8 ? b.readBigInt64LE(0) : BigInt(b.readInt32LE(0));
}

/**
 * Whether the foreground window fills the whole monitor the window `own` is on, as a game, a video
 * or a browser in full screen does. A window still carrying a title bar never counts: a maximized
 * window reaches past the monitor's edges where no taskbar reserves a strip (an auto-hidden one, or
 * none on that monitor), and what tells it apart from a full screen window is that going full screen
 * clears that bar
 * (Chromium keeps the maximized state behind, so the state alone cannot separate the two). Nor do
 * the pet window and the desktop. Null off Windows or when koffi does not load.
 */
const fullscreen = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
    const GetWindowLongW = user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)');
    const GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)');
    const GetWindowRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, void *rect)');
    const MonitorFromWindow = user32.func('intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)');
    const GetMonitorInfoW = user32.func('int __stdcall GetMonitorInfoW(intptr_t monitor, void *info)');
    // MONITORINFO is its own size, the monitor RECT, the work RECT and flags
    const MONITORINFO_BYTES = 40, MONITOR_DEFAULTTONEAREST = 2;
    // going full screen clears the title bar a maximized window keeps
    const GWL_STYLE = -16, WS_CAPTION = 0x00c00000;
    // the desktop's own windows: they cover the monitor but are not an application
    const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW']);
    return (own) => {
      const hwnd = BigInt(GetForegroundWindow());
      if (hwnd === 0n || hwnd === own) return false;
      // a title bar means an ordinary window that happens to reach the monitor's edges, always on top or not
      if ((GetWindowLongW(hwnd, GWL_STYLE) & WS_CAPTION) !== 0) return false;
      const monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
      if (monitor !== MonitorFromWindow(own, MONITOR_DEFAULTTONEAREST)) return false;
      const name = Buffer.alloc(128);
      if (GetClassNameW(hwnd, name, 64) > 0 && DESKTOP_CLASSES.has(name.toString('utf16le').split('\0')[0])) return false;
      const rect = Buffer.alloc(16), info = Buffer.alloc(MONITORINFO_BYTES);
      info.writeUInt32LE(MONITORINFO_BYTES, 0);
      if (!GetWindowRect(hwnd, rect) || !GetMonitorInfoW(monitor, info)) return false;
      return rect.readInt32LE(0) <= info.readInt32LE(4) && rect.readInt32LE(4) <= info.readInt32LE(8)
        && rect.readInt32LE(8) >= info.readInt32LE(12) && rect.readInt32LE(12) >= info.readInt32LE(16);
    };
  } catch {
    return null;
  }
})();

/** `w`×`h` screen pixels from (x, y) in physical pixels, shrunk to `ow`×`oh`, as top-down BGRA. */
function grabScreen(x, y, w, h, ow, oh) {
  const screenDc = gdi.GetDC(null), memDc = gdi.CreateCompatibleDC(screenDc), bmp = gdi.CreateCompatibleBitmap(screenDc, ow, oh);
  try {
    const old = gdi.SelectObject(memDc, bmp);
    const SRCCOPY = 0x00CC0020;
    const ok = gdi.StretchBlt(memDc, 0, 0, ow, oh, screenDc, x, y, w, h, SRCCOPY);
    gdi.SelectObject(memDc, old);
    if (!ok) return null;
    // BITMAPINFOHEADER: 32-bit, uncompressed, negative height for top-down rows
    const bmi = Buffer.alloc(44);
    bmi.writeUInt32LE(40, 0); bmi.writeInt32LE(ow, 4); bmi.writeInt32LE(-oh, 8); bmi.writeUInt16LE(1, 12); bmi.writeUInt16LE(32, 14);
    const bits = Buffer.alloc(ow * oh * 4);
    return gdi.GetDIBits(memDc, bmp, 0, oh, bits, bmi, 0) === oh ? bits : null;
  } finally {
    gdi.DeleteObject(bmp); gdi.DeleteDC(memDc); gdi.ReleaseDC(null, screenDc);
  }
}

/**
 * Screen pixels under `rect`, leaving out those inside any of `skip`; both in page coordinates
 * (DIP, relative to `win`). The pet window may show in the copy, so the page skips its own figure
 * and bubbles. Returns a flat [r, g, b, r, g, b, …] of at most BACKDROP_SAMPLES pixels, [] when
 * this copy failed, or null where the screen cannot be read cheaply at all.
 */
function sampleBackdrop(win, { rect, skip = [] }) {
  if (!gdi) return null;
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return [];
  const b = win.getBounds();
  // physical pixels at the scale of the display the window is on
  const { x, y, width, height } = screen.dipToScreenRect(win, { x: b.x + rect.x, y: b.y + rect.y, width: rect.width, height: rect.height });
  const w = Math.max(1, width), h = Math.max(1, height);
  const step = Math.max(1, Math.sqrt(w * h / BACKDROP_SAMPLES));
  const ow = Math.max(1, Math.round(w / step)), oh = Math.max(1, Math.round(h / step));
  const bits = grabScreen(x, y, w, h, ow, oh);
  if (!bits) return [];
  const out = [];
  for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
    const px = rect.x + (i + .5) * rect.width / ow, py = rect.y + (j + .5) * rect.height / oh;
    if (skip.some((r) => px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height)) continue;
    const k = (j * ow + i) * 4;
    // BGRA
    out.push(bits[k + 2], bits[k + 1], bits[k]);
  }
  return out;
}

/**
 * 32×32 tray icon drawn in code: the C outline and two ring eyes, white on the brand green; on
 * macOS a black template image the menu bar tints to its own color.
 */
function trayIcon() {
  const mac = process.platform === 'darwin';
  const n = 32, buf = Buffer.alloc(n * n * 4);
  const ring = (px, py, cx, cy, r, w) => Math.abs(Math.hypot(px - cx, py - cy) - r) <= w / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, px = x + .5, py = y + .5;
    const inside = Math.hypot(px - 16, py - 16) <= 15.5;
    const a = Math.atan2(16 - py, px - 16) * 180 / Math.PI;
    const c = ring(px, py, 16, 16, 10.5, 3.6) && Math.abs(a) > 48;
    const eye = ring(px, py, 14.1, 14.6, 2.2, 1.5) || ring(px, py, 20.4, 14.6, 2.2, 1.5);
    const white = c || eye;
    // BGRA
    if (mac) { buf[i] = buf[i + 1] = buf[i + 2] = 0; buf[i + 3] = white ? 255 : 0; continue; }
    buf[i] = white ? 255 : 0x70; buf[i + 1] = white ? 255 : 0xA8; buf[i + 2] = white ? 255 : 0x00; buf[i + 3] = inside ? 255 : 0;
  }
  const img = nativeImage.createFromBitmap(buf, { width: n, height: n, scaleFactor: mac ? 2 : 1 });
  if (mac) img.setTemplateImage(true);
  return img;
}

function runPetHost({ url, parentPid = 0, tray: withTray = true }) {
  if (!url) throw new Error('pet host needs --pet-url');
  const origin = new URL(url).origin;
  let win = null, tray = null, dress = null;
  /** Id of the display whose work area the window covers. */
  let displayId = null;
  /** The setting, and whether it is what hid the window. */
  let hideWhenFullscreen = false, autoHidden = false;

  /** The display the window belongs on: the one it was moved to, or the primary display once that one is gone. */
  const display = () => screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();

  /** Moves the window over display `d`; returns the area it now covers. */
  const cover = (d) => {
    displayId = d.id;
    const area = coverArea(d);
    win.setBounds(area);
    // Windows: a window moved onto a display with another scale factor is resized by the DPI
    // change to its old size times the ratio of the two scales; once it is on the new display, the
    // same bounds set again hold.
    win.setBounds(area);
    return area;
  };

  const place = () => { if (win) cover(display()); };

  /**
   * A hand showed or hid the window, so the fullscreen rule no longer owns it: a manual show while
   * the rule still believed it had hidden the window would keep the rule from hiding it again.
   */
  const releaseAutoHidden = () => { autoHidden = false; };

  const create = () => {
    const d = display(), wa = coverArea(d);
    win = new BrowserWindow({
      x: wa.x, y: wa.y, width: wa.width, height: wa.height,
      transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false,
      backgroundColor: '#00000000', title: 'Cortico',
      // Windows: Chromium-based apps treat a topmost window without WS_EX_TOOLWINDOW as covering them and stop painting while the pet takes the mouse
      ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true, sandbox: true, backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    cover(d);
    // Native candidate windows and Chromium popups must remain above the pet.
    win.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'screen-saver');
    // on every Space, and over an app in full screen
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      if (target.startsWith(origin)) { openDress(target); return { action: 'deny' }; }
      shell.openExternal(target);
      return { action: 'deny' };
    });
    win.once('ready-to-show', () => win.showInactive());
    // the page learns where the cursor is even when the click-through window misses its moves
    let last = '';
    const cursorTimer = setInterval(() => {
      if (!win || !win.isVisible()) return;
      const pt = screen.getCursorScreenPoint(), b = win.getBounds();
      const inside = pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height;
      const at = inside ? { x: pt.x - b.x, y: pt.y - b.y } : null;
      const key = at ? `${at.x},${at.y}` : '';
      if (key === last) return;
      last = key;
      win.webContents.send('pet:cursor', at);
    }, CURSOR_EVERY_MS);
    // hidden while the setting is on and a window fills the pet's monitor; shown again once neither holds
    const fullscreenTimer = fullscreen && setInterval(() => {
      if (!win) return;
      const covered = hideWhenFullscreen && fullscreen(hwndOf(win));
      if (covered && !autoHidden && win.isVisible()) { autoHidden = true; win.hide(); }
      else if (!covered && autoHidden) { autoHidden = false; win.showInactive(); }
    }, FULLSCREEN_EVERY_MS);
    win.on('closed', () => { clearInterval(cursorTimer); clearInterval(fullscreenTimer); win = null; });
    // page console lines reach the World's log through stdout
    win.webContents.on('console-message', (e) => { if (e.level !== 'debug') console.log(`[page:${e.level}] ${e.message}`); });
    win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => console.log(`[page:error] 加载失败 ${code} ${desc} ${failedUrl}`));
    win.loadURL(url);
  };

  const openDress = (target = `${origin}/dress`) => {
    if (dress) { dress.show(); dress.focus(); return; }
    dress = new BrowserWindow({ width: 980, height: 720, title: 'Cortico', autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } });
    dress.on('closed', () => { dress = null; });
    dress.loadURL(target);
  };

  ipcMain.on('pet:interactive', (_e, on) => { if (win) win.setIgnoreMouseEvents(!on, { forward: true }); });
  ipcMain.on('pet:focus', () => {
    if (!win) return;
    // Explicit text input activates this menu-bar process as well as its window.
    if (process.platform === 'darwin') app.focus({ steal: true });
    win.focus();
  });
  /** The window that had the keyboard before a question took it; it gets it back afterwards. */
  let lent = 0n;
  ipcMain.on('pet:grabFocus', () => {
    if (!win || !win.isVisible() || process.platform === 'darwin') return;
    if (foreground) {
      const own = hwndOf(win), cur = foreground.current();
      if (cur !== own && foreground.give(own)) lent = cur;
    }
    win.focus();
  });
  ipcMain.on('pet:releaseFocus', () => {
    const back = lent;
    lent = 0n;
    if (!win) return;
    // someone clicked elsewhere meanwhile: the keyboard is already where they want it
    if (foreground) { if (back && foreground.current() === hwndOf(win)) foreground.give(back); }
    else if (win.isFocused()) win.blur();
  });
  ipcMain.on('pet:hide', () => { releaseAutoHidden(); if (win) win.hide(); });
  ipcMain.on('pet:hideWhenFullscreen', (_e, on) => { hideWhenFullscreen = !!on; });
  ipcMain.on('pet:openDress', () => openDress());
  let language = 'zh';
  ipcMain.on('pet:language', (_e, code) => {
    if (typeof code !== 'string' || code === language) return;
    language = code;
    void buildTrayMenu();
  });
  ipcMain.handle('pet:sampleBackdrop', (_e, query) => {
    try { return win ? sampleBackdrop(win, query || {}) : []; } catch { return []; }
  });
  /**
   * A drag carried or let go of outside the window: when the cursor is over another display, the
   * window moves there and the page gets the cursor's spot in its new coordinates, its new size, and
   * how far a point on screen moved in page coordinates (`dx`, `dy`); null leaves it where it is.
   */
  ipcMain.handle('pet:followCursor', () => {
    if (!win) return null;
    const pt = screen.getCursorScreenPoint(), d = screen.getDisplayNearestPoint(pt);
    const fromDisplay = display();
    if (d.id === fromDisplay.id) return null;
    const from = coverArea(fromDisplay), wa = cover(d);
    return { x: pt.x - wa.x, y: pt.y - wa.y, w: wa.width, h: wa.height, dx: from.x - wa.x, dy: from.y - wa.y };
  });

  // a pet is not an app to switch to
  if (process.platform === 'darwin') app.dock?.hide();
  app.whenReady().then(async () => {
    // macOS asks once, before the page first opens the microphone
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone').catch(() => false);
    }
    session.defaultSession.setPermissionRequestHandler((wc, permission, done) => {
      done(permission === 'media' && wc.getURL().startsWith(origin));
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => permission === 'media' && requestingOrigin === origin);
    create();
    screen.on('display-metrics-changed', place);
    screen.on('display-added', place);
    screen.on('display-removed', place);
    if (!withTray) return;
    tray = new Tray(trayIcon());
    await buildTrayMenu();
    tray.on('click', () => { if (win) { releaseAutoHidden(); (win.isVisible() ? win.hide() : win.showInactive()); } });
  });
  /** The tray's tooltip and menu in the language the page last reported. */
  async function buildTrayMenu() {
    if (!tray) return;
    const want = language, t = await pageText(want);
    if (want !== language || !tray) return;
    tray.setToolTip(t['pet.title']);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t['host.show'], click: () => { releaseAutoHidden(); if (!win) create(); else win.showInactive(); } },
      { label: t['host.hide'], click: () => { releaseAutoHidden(); if (win) win.hide(); } },
      { label: t['host.dress'], click: () => openDress() },
      { type: 'separator' },
      { label: t['host.close'], click: () => app.quit() },
    ]));
  }

  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  // with --parent-pid the window closes once that process is gone
  if (parentPid) {
    setInterval(() => {
      try { process.kill(parentPid, 0); } catch { app.quit(); }
    }, 2000).unref();
  }
}

module.exports = { runPetHost };

// Electron's default app loads the script without making it require.main
if (process.argv[1] && require('node:path').resolve(process.argv[1]) === __filename) {
  const arg = process.argv.find((a) => a.startsWith('--pet-url='));
  const parent = process.argv.find((a) => a.startsWith('--parent-pid='));
  runPetHost({ url: arg ? arg.slice('--pet-url='.length) : '', parentPid: parent ? Number(parent.slice('--parent-pid='.length)) : 0 });
}
