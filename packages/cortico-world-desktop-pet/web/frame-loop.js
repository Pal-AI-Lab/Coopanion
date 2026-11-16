/**
 * The pet page's frame loop (web/pet-app.js): when frames come, and how far each one moves the page's clock.
 *
 * A frame advances the clock by the time since the frame before, so a walk or a line takes as long at any frame rate
 * on any display. It takes that time in equal steps of at most MAX_STEP, which keep the body's springs and the
 * page's eases steady, and drops what is past MAX_GAP (the machine asleep, the page held up): the clock goes on from
 * where it was.
 *
 * Frames come on display refreshes. Below the display's rate a timer wakes the loop a quarter gap before the frame is
 * due and the next refresh brings it; at `refresh` the loop asks for every refresh and lets pass those more than a
 * quarter gap early, since a timer can wake late, which a body at rest hides and a moving one shows as stutter.
 */

/** The longest step the clock and the body advance at once, in seconds. */
export const MAX_STEP = .05;
/** The most time one frame advances the clock, in seconds. */
export const MAX_GAP = .25;

/** `elapsed` seconds as the steps a frame takes: equal, MAX_STEP or less each, MAX_GAP in all; one step of 0 when no time passed. */
export function stepsFor(elapsed) {
  const t = Math.min(MAX_GAP, Math.max(0, elapsed));
  const n = Math.max(1, Math.ceil(t / MAX_STEP - 1e-9));
  return new Array(n).fill(t / n);
}

/**
 * Calls `frame(steps, now, last)` frame after frame: `now` is the display refresh's time and `last` the frame
 * before's (ms), `steps` the seconds the frame advances the clock by (stepsFor). It returns how the next frame comes,
 * `{ fps, refresh }`: `fps` frames a second (0, or more than the display's, is every refresh), waited for on display
 * refreshes when `refresh` is on and by a timer otherwise. `refreshed(now)` hears every display refresh the loop gets,
 * the ones it lets pass included. `raf`, `timer` and `clock` are the browser's unless a test stands in for them.
 */
export function runFrames(frame, {
  refreshed,
  raf = (cb) => requestAnimationFrame(cb),
  timer = (cb, ms) => setTimeout(cb, ms),
  clock = () => performance.now(),
} = {}) {
  /** The last frame's time, when the next frame is due (both refresh times), and the gap between frames (ms). */
  let last = clock(), dueAt = 0, gap = 0;
  const tick = (now) => {
    refreshed?.(now);
    // a display refresh up to a quarter gap early counts as on time, so the rate averages out over refresh rates it does not divide
    if (now < dueAt - gap / 4) { raf(tick); return; }
    const was = last;
    last = now;
    const { fps, refresh } = frame(stepsFor((now - was) / 1000), now, was);
    gap = fps > 0 ? 1000 / fps : 0;
    // a frame more than a gap late starts the count again instead of drawing the missed ones back to back
    dueAt = now - dueAt > gap ? now + gap : dueAt + gap;
    if (refresh) raf(tick);
    else timer(() => raf(tick), Math.max(0, dueAt - gap / 4 - clock()));
  };
  raf(tick);
}
