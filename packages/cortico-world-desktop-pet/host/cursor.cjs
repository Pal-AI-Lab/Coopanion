/**
 * Chromium's X11 cursor cache only advances with pointer events. A click-through pet receives
 * none, so asking Electron for that cache cannot tell it when to take the mouse again (#119).
 * Keep a separate X connection and query the server; the rest of the host still uses screen DIPs.
 */
function createCursorSource({ screen, platform = process.platform, loadKoffi = () => require('koffi') }) {
  let dpy = null, root, queryPointer, closeDisplay;
  if (platform === 'linux') {
    try {
      const x11 = loadKoffi().load('libX11.so.6');
      const openDisplay = x11.func('void *XOpenDisplay(const char *name)');
      const defaultRoot = x11.func('unsigned long XDefaultRootWindow(void *dpy)');
      queryPointer = x11.func('int XQueryPointer(void *dpy, unsigned long win, _Out_ unsigned long *root, _Out_ unsigned long *child, _Out_ int *root_x, _Out_ int *root_y, _Out_ int *win_x, _Out_ int *win_y, _Out_ unsigned int *mask)');
      closeDisplay = x11.func('int XCloseDisplay(void *dpy)');
      dpy = openDisplay(null);
      if (dpy) root = defaultRoot(dpy);
    } catch {
      close();
    }
  }

  function close() {
    if (!dpy) return;
    const connection = dpy;
    dpy = null;
    closeDisplay(connection);
  }

  return {
    read() {
      if (dpy) {
        try {
          const r = [0], c = [0], rx = [0], ry = [0], wx = [0], wy = [0], mask = [0];
          if (queryPointer(dpy, root, r, c, rx, ry, wx, wy, mask)) {
            return toDip({ x: rx[0], y: ry[0] }, screen.getAllDisplays());
          }
        } catch { /* If the query fails, keep the host's usual Electron fallback. */ }
      }
      return screen.getCursorScreenPoint();
    },
    close,
  };
}

/**
 * Choose the display in physical pixels before converting: getDisplayNearestPoint takes DIPs,
 * so feeding it X11 pixels can select the next monitor at 200%. Offsets are relative to the
 * display's native origin, not the desktop origin (which need not be on the primary display).
 */
function toDip(point, displays) {
  let nearest, distance = Infinity;
  for (const display of displays) {
    const { nativeOrigin: o, bounds: b, scaleFactor: s } = display;
    const dx = Math.max(o.x - point.x, 0, point.x - (o.x + b.width * s));
    const dy = Math.max(o.y - point.y, 0, point.y - (o.y + b.height * s));
    const d = dx * dx + dy * dy;
    if (d < distance) { nearest = display; distance = d; }
    if (point.x >= o.x && point.x < o.x + b.width * s && point.y >= o.y && point.y < o.y + b.height * s) {
      nearest = display;
      break;
    }
  }
  const { nativeOrigin: o, bounds: b, scaleFactor: s } = nearest;
  return { x: Math.floor(b.x + (point.x - o.x) / s), y: Math.floor(b.y + (point.y - o.y) / s) };
}

module.exports = { createCursorSource };
