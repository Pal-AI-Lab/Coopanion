/**
 * Moving the pointer in a Wayland session, where the compositor decides where a warp from XWayland ends. KWin at a
 * fractional scale multiplies the position by the scale and drops the warp when the result is not over an X11 window,
 * and XWayland does not report that factor. It is read back from where the pointer ends up, and later warps are divided
 * by it. A dropped warp tells nothing, so the factor comes from the first warp that lands.
 */

export interface Point { x: number; y: number }

export interface PointerPort {
  warp(x: number, y: number): void;
  cursor(): Point;
  /** Blocks for `ms`. */
  wait(ms: number): void;
  /** Milliseconds on a monotonic clock. */
  now(): number;
}

/** How long a read-back holds: the person can change the scale while the engine runs. */
export const WARP_RECHECK_MS = 30_000;
/** Longest time the compositor's answer to a warp takes to reach the X server. */
const SETTLE_MS = 100;
const POLL_MS = 8;
/** A first attempt finds the factor, a second uses it, a third refines a factor read near the origin. */
const MAX_ATTEMPTS = 3;
/** The pointer is on its target within this many pixels. */
const LANDED_PX = 2;
/** A factor is read only from positions this far along both axes, where rounding moves it by under 2%. */
const MIN_POSITION = 64;
/** The two axes' factors differ by more than this when something else moved the pointer. */
const AXES_AGREE = 0.03;
const MIN_FACTOR = 0.25, MAX_FACTOR = 4;

const within = (a: Point, b: Point, px: number) => Math.abs(a.x - b.x) <= px && Math.abs(a.y - b.y) <= px;

/** The factor that took `sent` to `at`, or null when the two positions cannot have come from one. */
function factorOf(sent: Point, at: Point): number | null {
  if (sent.x < MIN_POSITION || sent.y < MIN_POSITION) return null;
  const x = at.x / sent.x, y = at.y / sent.y, factor = (x + y) / 2;
  return Math.abs(x - y) <= AXES_AGREE && factor >= MIN_FACTOR && factor <= MAX_FACTOR ? factor : null;
}

/** Where the pointer settles after a warp to `sent`: the X server can show `sent` until the compositor answers. */
function settle(port: PointerPort, before: Point, sent: Point): Point {
  const start = port.now();
  let at = before;
  while (port.now() - start < SETTLE_MS) {
    port.wait(POLL_MS);
    at = port.cursor();
    if (!within(at, before, 0) && !within(at, sent, 0)) break;
  }
  return at;
}

/** A pointer move in whole pixels of the X screen that ends on its target whatever factor the compositor applies. */
export function createWarp(port: PointerPort): (x: number, y: number) => void {
  let factor = 1;
  let checkedAt = -Infinity;
  const toSend = (target: Point): Point => ({ x: Math.round(target.x / factor), y: Math.round(target.y / factor) });
  return (x, y) => {
    const target = { x, y };
    if (port.now() - checkedAt < WARP_RECHECK_MS) {
      const sent = toSend(target);
      port.warp(sent.x, sent.y);
      return;
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const before = port.cursor(), sent = toSend(target);
      port.warp(sent.x, sent.y);
      const at = settle(port, before, sent);
      if (within(at, target, LANDED_PX)) { checkedAt = port.now(); return; }
      const read = within(at, before, 0) ? null : factorOf(sent, at);
      if (read === null) return;
      factor = read;
    }
  };
}
