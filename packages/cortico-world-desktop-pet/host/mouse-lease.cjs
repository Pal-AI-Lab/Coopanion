/**
 * Who holds the mouse, and when it is given back.
 *
 * The pet window covers a work area, so while it holds the mouse every click on that screen goes
 * to it, and the page is the only side that can hand it back. The window process keeps the last
 * word instead:
 *
 * - `ask(on, areas)` is the page's wish, with the areas it may be honoured in (page pixels: the
 *   pet's box and the bubbles, menus and hover buttons that are on screen);
 * - the wish is a lease of `leaseMs`, renewed by the page on every cursor report while it holds
 *   the mouse, so a page that stops reporting loses the mouse;
 * - the mouse is held only while the window is visible and the cursor is inside one of the areas;
 *   a page that names no areas is trusted as it was before;
 * - a verdict stands for `reassertMs` and is then applied again, because the X input shape does
 *   not survive the window being mapped and the shape set while the window is still off screen
 *   does not stick. `forget()` drops the memory of the last verdict, for a caller that knows the
 *   shape was reset.
 *
 * The window is read through `getWindow`, so the lease can be exercised without Electron.
 */
function createMouseLease({ getWindow, leaseMs = 1500, reassertMs = 2000, now = () => Date.now() }) {
  let wanted = false, askedAt = 0, areas = [];
  /** The last verdict, or null while it is not known to be in force. */
  let held = null, appliedAt = 0;
  /** The cursor as of the last `tick`, in page pixels, or null while it is off the window. */
  let cursorAt = null;

  /** The areas a page may name: four finite numbers each, at most 32 of them. */
  const keepAreas = (list) => (Array.isArray(list) ? list : [])
    .filter((r) => Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === 'number' && Number.isFinite(n)))
    .slice(0, 32)
    .map((r) => [r[0], r[1], Math.max(0, r[2]), Math.max(0, r[3])]);

  const inside = (at) => !!at && areas.some(([x, y, w, h]) => at.x >= x && at.x < x + w && at.y >= y && at.y < y + h);

  const apply = (at) => {
    const win = getWindow();
    if (!win) return;
    const hold = wanted && now() - askedAt < leaseMs && win.isVisible() && (areas.length === 0 || inside(at));
    const stamp = now();
    if (hold === held && stamp - appliedAt < reassertMs) return;
    held = hold;
    appliedAt = stamp;
    win.setIgnoreMouseEvents(!hold, { forward: true });
  };

  return {
    /** The page's wish, with the areas it may be honoured in; called where the page asks. */
    ask(on, list) {
      wanted = !!on;
      areas = wanted ? keepAreas(list) : [];
      askedAt = now();
      apply(cursorAt);
    },
    /** A cursor report: where the cursor is in page pixels, or null off the window. */
    tick(at) {
      cursorAt = at;
      apply(at);
    },
    /** The window is going away: the mouse is not held any more. */
    release() {
      wanted = false;
      apply(cursorAt);
    },
    /** The next verdict is applied from scratch, whatever was told to the window before. */
    forget() {
      held = null;
    },
    state: () => ({ wanted, held: held === true, areas: areas.length, askedAt, appliedAt, cursorAt }),
  };
}

module.exports = { createMouseLease };
