/**
 * The pet window as a streaming layer: while the World says someone watches its `/overlay` page
 * (`worlds.desktop-pet.window.exportOverlay` is on), this sends the part of the window where the
 * pet and its bubbles are to the World's `overlay-source` socket, one frame for each frame the page draws.
 *
 * While it is told the stream is on (`pet:overlay`), the page reports every frame it draws
 * (`pet:overlayFrame`: the part in CSS pixels, and when the frame was drawn in milliseconds since the
 * epoch). A frame sent is 6 little-endian uint32 (the width and height of the display the window is
 * on, and the part's x, y, width and height on that display, all in device pixels), a little-endian
 * float64 (when the page drew it), and the part's BGRA pixels, alpha premultiplied as Chromium paints
 * them, deflated. The window covers the display's work area, so the part is placed by the window's
 * offset in the display. A part of 0 × 0 clears the layer: the window is hidden or nothing is drawn.
 */
const { deflate } = require('node:zlib');
const { screen } = require('electron');

/** A frame waits while more than this many bytes are still on their way to the World. */
const MAX_BUFFERED = 4 * 1024 * 1024;
/**
 * Captures under way at once; a frame drawn while they are all under way is not sent. A capture
 * resolves with a frame drawn after it was asked for: one at a time they came 48 ms apart on a
 * 2560-pixel display at 150 % (21 a second), and three at once keep up with 60 frames a second.
 */
const MAX_CAPTURES = 3;
/** A hidden window draws no frames: how often the layer is checked for one, to clear it. */
const HIDDEN_CHECK_MS = 500;
/** Milliseconds before the socket is tried again after it closed. */
const RECONNECT_MS = 2000;

/**
 * Connects to `origin` (the World's page server) and streams while it asks. `getWindow` returns the
 * pet window or null.
 */
function createOverlaySource({ origin, key, getWindow }) {
  // the global WebSocket came with Node 22 (Electron 35): an older Electron set by the app streams nothing
  if (typeof WebSocket !== 'function') return { frame: () => {}, pageLoaded: () => {}, stop: () => {} };
  let socket = null;
  /** The last frame sent cleared the layer: a hidden window sends that once, not at every check. */
  let cleared = false;
  let on = false;
  let capturing = 0;
  let timer = null;
  let stopped = false;

  const tellPage = () => getWindow()?.webContents.send('pet:overlay', on);

  const connect = () => {
    if (stopped) return;
    const params = new URLSearchParams({ role: 'overlay-source', key });
    const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/socket?${params}`);
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === 'overlay') setOn(!!msg.on);
      } catch { /* not ours */ }
    });
    ws.addEventListener('close', () => {
      if (socket === ws) { socket = null; setOn(false); }
      if (!stopped) setTimeout(connect, RECONNECT_MS);
    });
    ws.addEventListener('error', () => { /* close follows */ });
    socket = ws;
  };

  const setOn = (value) => {
    if (value === on) return;
    on = value;
    cleared = false;
    tellPage();
    if (on && !timer) timer = setInterval(() => { const win = getWindow(); if (win && !win.isVisible()) clear(win, Date.now()); }, HIDDEN_CHECK_MS);
    if (!on && timer) { clearInterval(timer); timer = null; }
  };

  const open = () => socket && socket.readyState === WebSocket.OPEN && socket.bufferedAmount <= MAX_BUFFERED;

  const send = (head, at, pixels) => {
    if (!open()) return;
    cleared = !head[4];
    const stamp = Buffer.alloc(8);
    stamp.writeDoubleLE(at);
    socket.send(Buffer.concat([Buffer.from(new Uint32Array(head).buffer), stamp, pixels]));
  };

  /** The display the window is on, in device pixels, and the window's offset in it in DIPs. */
  const placement = (win) => {
    // the page's zoom stays at 1 (electron-main.cjs), so CSS pixels are DIPs
    const display = screen.getDisplayMatching(win.getBounds());
    const scale = display.scaleFactor;
    const b = win.getContentBounds();
    // Windows rounds each display's pixel size its own way; elsewhere DIPs times the scale are the pixels
    const px = process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : null;
    const size = px ? [px.width, px.height] : [Math.round(display.bounds.width * scale), Math.round(display.bounds.height * scale)];
    return { scale, size, dx: b.x - display.bounds.x, dy: b.y - display.bounds.y };
  };

  const clear = (win, at) => {
    if (!cleared && open()) send([...placement(win).size, 0, 0, 0, 0], at, Buffer.alloc(0));
  };

  /** One frame the page drew: `r` is the part in CSS pixels or null, `at` when it was drawn. */
  const frame = async (r, at) => {
    const win = getWindow();
    if (!on || !win || !open() || !Number.isFinite(at)) return;
    const rect = r && [r.x, r.y, r.width, r.height].every(Number.isFinite)
      ? { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.ceil(r.width), height: Math.ceil(r.height) }
      : null;
    if (!win.isVisible() || !rect || rect.width < 1 || rect.height < 1) { clear(win, at); return; }
    if (capturing >= MAX_CAPTURES) return;
    capturing++;
    try {
      const { scale, size, dx, dy } = placement(win);
      // capturePage starts the image at x × scale rounded, as placed here
      const image = await win.webContents.capturePage(rect);
      const { width, height } = image.getSize();
      if (!width || !height) return;
      const pixels = await new Promise((done, fail) => deflate(image.toBitmap(), { level: 1 }, (err, out) => (err ? fail(err) : done(out))));
      send([...size, Math.round((dx + rect.x) * scale), Math.round((dy + rect.y) * scale), width, height], at, pixels);
    } catch { /* the window closed mid-capture */ } finally {
      capturing--;
    }
  };

  connect();
  return {
    frame: (r, at) => void frame(r, at),
    /** The page loaded again: tell it whether to report. */
    pageLoaded: tellPage,
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      socket?.close();
    },
  };
}

module.exports = { createOverlaySource };
