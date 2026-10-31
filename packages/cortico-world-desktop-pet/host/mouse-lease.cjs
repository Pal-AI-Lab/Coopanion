/**
 * Who holds the mouse, and when it is given back.
 *
 * The pet window covers a work area, so while it holds the mouse every click on that screen goes
 * to it, and the page is the only side that can hand it back. The window process keeps the last
 * word instead:
 *
 * - `ask(on)` is the page's wish, a lease of `leaseMs`, renewed by the page on every cursor report
 *   while it holds the mouse, so a page that stops reporting loses the mouse;
 * - the mouse is held only while the window is visible, and never while it is locked (`lock(on)`,
 *   the tray's "click through"), whatever the page asks;
 * - a verdict stands for `reassertMs` and is then applied again, because the X input shape does
 *   not survive the window being mapped and the shape set while the window is still off screen
 *   does not stick. `forget()` drops the memory of the last verdict, for a caller that knows the
 *   shape was reset.
 *
 * The window is read through `getWindow`, so the lease can be exercised without Electron.
 */

/**
 * Whether a click-through window still passes the mouse moves to the page. On Windows Electron
 * forwards them through a low-level mouse hook that every mouse event on the system goes through,
 * which stalls the window process under a high-rate mouse; there the page follows the cursor
 * through the cursor reports alone.
 */
const FORWARD_MOVES = process.platform !== 'win32';

function createMouseLease({ getWindow, leaseMs = 1500, reassertMs = 2000, now = () => Date.now() }) {
  let wanted = false, askedAt = 0, locked = false;
  /** The last verdict, or null while it is not known to be in force. */
  let held = null, appliedAt = 0;

  const apply = () => {
    const win = getWindow();
    if (!win) return;
    const hold = !locked && wanted && now() - askedAt < leaseMs && win.isVisible();
    const stamp = now();
    if (hold === held && stamp - appliedAt < reassertMs) return;
    held = hold;
    appliedAt = stamp;
    win.setIgnoreMouseEvents(!hold, { forward: FORWARD_MOVES });
  };

  return {
    /** The page's wish; called where the page asks. */
    ask(on) {
      wanted = !!on;
      askedAt = now();
      apply();
    },
    /** Locked, every click passes through until it is unlocked; the page's wishes are kept meanwhile. */
    lock(on) {
      locked = !!on;
      apply();
    },
    /** A cursor report went out: the lease may have run out, or the verdict be due again. */
    tick: apply,
    /** The window is going away: the mouse is not held any more. */
    release() {
      wanted = false;
      apply();
    },
    /** The next verdict is applied from scratch, whatever was told to the window before. */
    forget() {
      held = null;
    },
  };
}

module.exports = { createMouseLease, FORWARD_MOVES };
