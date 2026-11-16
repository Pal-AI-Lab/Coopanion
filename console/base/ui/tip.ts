/**
 * Showing and hiding a hint box (`.u-tip`, styles.css). It fades in when shown and fades out over LEAVE_MS when
 * hidden (`.u-tip.leaving`); shown again while fading out, it stays. With reduced motion it goes at once.
 */
export const LEAVE_MS = 120;

const leaving = new WeakMap<HTMLElement, number>();

export function showTip(el: HTMLElement): void {
  const timer = leaving.get(el);
  if (timer !== undefined) { el.ownerDocument.defaultView?.clearTimeout(timer); leaving.delete(el); }
  el.classList.remove('leaving', 'hidden');
}

/** Fades `el` out, or hides it at once (`now`, a press or a scroll, or reduced motion). */
export function hideTip(el: HTMLElement, now = false): void {
  const win = el.ownerDocument.defaultView;
  // already fading out: calling again (a hint hidden on every wheel step) does not put the end off
  if (!now && el.classList.contains('leaving')) return;
  const timer = leaving.get(el);
  if (timer !== undefined) win?.clearTimeout(timer);
  leaving.delete(el);
  const still = !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (now || still || !win || el.classList.contains('hidden')) { el.classList.remove('leaving'); el.classList.add('hidden'); return; }
  el.classList.add('leaving');
  leaving.set(el, win.setTimeout(() => { leaving.delete(el); el.classList.remove('leaving'); el.classList.add('hidden'); }, LEAVE_MS));
}
