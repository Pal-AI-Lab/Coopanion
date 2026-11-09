/**
 * The pet window's X input shape in a Wayland session.
 *
 * XWayland knows where the cursor is only while it is over an X11 window, so in a Wayland session
 * the cursor reports (cursor.cjs) stop where the cursor left the last one, and a click-through
 * window never learns that the cursor reached the pet. There the window's input shape is the parts
 * of the page that take the mouse, as the page reports them, and the compositor gives the window
 * the clicks on those parts and every other click to the window underneath.
 *
 * Null outside a Wayland session, or when libX11 or libXext does not load or the X server has no
 * SHAPE extension.
 */
const SHAPE_INPUT = 2, SHAPE_SET = 0, UNSORTED = 0;

function createInputShape({ screen, platform = process.platform, env = process.env, loadKoffi = () => require('koffi') }) {
  if (platform !== 'linux' || !(env.XDG_SESSION_TYPE === 'wayland' || env.WAYLAND_DISPLAY)) return null;
  let dpy = null, combine, flush, closeDisplay;
  try {
    const koffi = loadKoffi();
    const x11 = koffi.load('libX11.so.6'), xext = koffi.load('libXext.so.6');
    const openDisplay = x11.func('void *XOpenDisplay(const char *name)');
    flush = x11.func('int XFlush(void *dpy)');
    closeDisplay = x11.func('int XCloseDisplay(void *dpy)');
    const queryShape = xext.func('int XShapeQueryExtension(void *dpy, _Out_ int *event_base, _Out_ int *error_base)');
    combine = xext.func('void XShapeCombineRectangles(void *dpy, unsigned long win, int kind, int x, int y, void *rects, int n, int op, int ordering)');
    dpy = openDisplay(null);
    if (dpy && !queryShape(dpy, [0], [0])) close();
  } catch {
    close();
  }
  if (!dpy) return null;

  function close() {
    if (!dpy) return;
    const connection = dpy;
    dpy = null;
    closeDisplay(connection);
  }

  return {
    /** Sets `win`'s input shape to `rects` ({ x, y, width, height } in page pixels); an empty list passes every click through. */
    set(win, rects) {
      if (!dpy || win.isDestroyed()) return;
      const s = screen.getDisplayMatching(win.getBounds()).scaleFactor;
      // XRectangle: short x, y; unsigned short width, height
      const buf = Buffer.alloc(8 * rects.length);
      rects.forEach((r, i) => {
        const x = Math.floor(r.x * s), y = Math.floor(r.y * s);
        buf.writeInt16LE(Math.max(-32768, Math.min(32767, x)) || 0, 8 * i);
        buf.writeInt16LE(Math.max(-32768, Math.min(32767, y)) || 0, 8 * i + 2);
        buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.ceil((r.x + r.width) * s) - x)) || 0, 8 * i + 4);
        buf.writeUInt16LE(Math.max(0, Math.min(65535, Math.ceil((r.y + r.height) * s) - y)) || 0, 8 * i + 6);
      });
      const h = win.getNativeWindowHandle();
      const xid = h.length >= 8 ? h.readBigUInt64LE(0) : h.readUInt32LE(0);
      combine(dpy, xid, SHAPE_INPUT, 0, 0, buf, rects.length, SHAPE_SET, UNSORTED);
      flush(dpy);
    },
    close,
  };
}

module.exports = { createInputShape };
