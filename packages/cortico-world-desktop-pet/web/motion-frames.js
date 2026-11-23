/**
 * Motion that code writes frame by frame, shared by the pet's pages and (bundled) the settings window. Each helper
 * takes the time that passed or the clock, never a frame count, so it runs at the same speed on any display, and
 * reads the window's motion level (motion-level.js) itself: low lands at once, medium drops overshoot. The callers
 * keep their own frame clocks (frame-loop.js, the settings window's `lifecycle.frame`).
 */
import { motionLevel } from './motion-level.js';

/**
 * One frame of easing `current` toward `target`, which may keep moving: the gap shrinks by `1 - e^(-rate·dt)`
 * (`rate` per second, `dt` in seconds). At low motion it is the target.
 */
export function approach(current, target, rate, dt, win = globalThis.window) {
  if (motionLevel(win) === 'low' || !(dt > 0)) return motionLevel(win) === 'low' ? target : current;
  return target + (current - target) * Math.exp(-rate * dt);
}

/** The share of the gap one frame of `approach` closes, for callers that ease several values alike. */
export function approachShare(rate, dt, win = globalThis.window) {
  if (motionLevel(win) === 'low') return 1;
  return dt > 0 ? 1 - Math.exp(-rate * dt) : 0;
}

/** A curve without overshoot, for medium motion: ease-out cubic. */
const steady = (k) => 1 - (1 - k) ** 3;

/**
 * From `from` to `to` over `ms` milliseconds, starting at `start` (a `performance.now()` time): `at(now)` gives
 * the value and `done(now)` whether it has arrived. `ease` maps 0–1 to 0–1; `overshoots` says it goes past 1,
 * which medium motion replaces with a steady curve. At low motion it is at `to` at once.
 */
export function tween(from, to, ms, { ease = steady, overshoots = false, start = performance.now(), win = globalThis.window } = {}) {
  const level = motionLevel(win);
  const curve = level === 'medium' && overshoots ? steady : ease;
  const share = (now) => (level === 'low' || ms <= 0 ? 1 : Math.min(1, Math.max(0, (now - start) / ms)));
  return {
    at: (now) => { const k = share(now); return k >= 1 ? to : from + (to - from) * curve(k); },
    done: (now) => share(now) >= 1,
  };
}

/**
 * How many of `length` characters are shown after `elapsed` seconds at `perSecond` characters a second; all of
 * them at low motion.
 */
export function typeOut(length, perSecond, elapsed, win = globalThis.window) {
  if (motionLevel(win) === 'low' || !(perSecond > 0)) return length;
  return Math.min(length, Math.max(0, Math.floor(elapsed * perSecond)));
}
