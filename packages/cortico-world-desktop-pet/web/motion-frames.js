/**
 * Motion that code writes frame by frame, shared by the pet's pages and (bundled) the settings window. Each helper
 * takes the time that passed or the clock, never a frame count, so it runs at the same speed on any display, and
 * reads the window's motion level (motion-level.js) itself: low lands at once, medium drops overshoot. The callers
 * keep their own frame clocks (frame-loop.js, the settings window's `lifecycle.frame`).
 */
import { motionLevel } from './motion-level.js';

/**
 * The share of the gap to a target (which may keep moving) one frame of `dt` seconds closes, `1 - e^(-rate·dt)`, so
 * the easing runs at the same speed on any display; 1 at low motion.
 */
export function approachShare(rate, dt, win = globalThis.window) {
  if (motionLevel(win) === 'low') return 1;
  return dt > 0 ? 1 - Math.exp(-rate * dt) : 0;
}

/**
 * How far a change that started at `start` and runs `ms` milliseconds is at `now`, 0 to 1, linear; 1 at low motion.
 * For callers that combine several timed changes and apply their curves themselves.
 */
export function progress(start, ms, now, win = globalThis.window) {
  if (motionLevel(win) === 'low' || ms <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / ms));
}

/**
 * A duration the stylesheet gives `el` (or inherits to it) as a custom property, `--name: 160ms` or `.16s`, in
 * milliseconds; `fallback` where it has none (no stylesheet, as in the tests). Scripts that wait for a CSS animation
 * read its length here, so it is written once.
 */
export function cssMs(el, name, fallback) {
  const view = el?.ownerDocument?.defaultView;
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(view?.getComputedStyle?.(el).getPropertyValue(name) ?? '');
  return m ? Math.round(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1)) : fallback;
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
  const share = (now) => progress(start, ms, now, win);
  return {
    at: (now) => { const k = share(now); return k >= 1 ? to : from + (to - from) * curve(k); },
    done: (now) => share(now) >= 1,
  };
}

/**
 * Grows or shrinks `el` from the size it had (`was`: `w` and/or `h`, in pixels as offsetWidth/offsetHeight give
 * them) to the one it has now, after the caller changed its content. Returns the animation, or nothing when the
 * size did not change or at low motion (it is at its size already). `overshoots` marks an easing that goes past
 * the end, which below full motion becomes a steady one.
 */
export function growFrom(el, was, { duration, easing = 'ease', overshoots = false } = {}) {
  const win = el.ownerDocument.defaultView, level = motionLevel(win);
  if (level === 'low' || !el.animate) return undefined;
  const now = { w: el.offsetWidth, h: el.offsetHeight };
  const from = {}, to = {};
  if (was.w !== undefined && was.w !== now.w) { from.width = was.w + 'px'; to.width = now.w + 'px'; }
  if (was.h !== undefined && was.h !== now.h) { from.height = was.h + 'px'; to.height = now.h + 'px'; }
  if (!Object.keys(from).length) return undefined;
  return el.animate([from, to], { duration, easing: overshoots && level !== 'high' ? 'cubic-bezier(.2,.7,.3,1)' : easing });
}

/**
 * How many of `length` characters are shown after `elapsed` seconds at `perSecond` characters a second; all of
 * them at low motion.
 */
export function typeOut(length, perSecond, elapsed, win = globalThis.window) {
  if (motionLevel(win) === 'low' || !(perSecond > 0)) return length;
  return Math.min(length, Math.max(0, Math.floor(elapsed * perSecond)));
}
