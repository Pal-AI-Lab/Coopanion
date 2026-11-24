/**
 * Showing and hiding a hint box (`.u-tip`, styles.css), hidden by its `hidden` class. It fades in when shown and
 * fades out over `--tip-out` when hidden (`.u-tip.leaving`); shown again while fading out, it stays. With low
 * motion it goes at once. The timing is the pet's show-hide.js, as its hover hints use it.
 */
import { cssMs } from 'cortico-world-desktop-pet/web/motion-frames.js';
import { showHide, type ShowHide } from 'cortico-world-desktop-pet/web/show-hide.js';

/** How long a box fades out where the stylesheet does not say. */
export const LEAVE_MS = 120;

const boxes = new WeakMap<HTMLElement, ShowHide>();
const of = (el: HTMLElement): ShowHide => {
  let box = boxes.get(el);
  if (!box) boxes.set(el, box = showHide(el, { hiddenClass: 'hidden' }));
  return box;
};

export function showTip(el: HTMLElement): void {
  of(el).reveal();
}

/** Fades `el` out, or hides it at once (`now`, a press or a scroll, or low motion). */
export function hideTip(el: HTMLElement, now = false): void {
  const box = of(el);
  // already fading out: calling again (a hint hidden on every wheel step) does not put the end off
  if (!now && box.leaving) return;
  box.hide(cssMs(el, '--tip-out', LEAVE_MS), now);
}
