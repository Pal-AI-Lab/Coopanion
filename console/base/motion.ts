/** Motion helpers shared by the settings window's pages. */

/** Whether the system asks for reduced motion. */
export function prefersStill(win: Window | null | undefined): boolean {
  return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export interface FoldOptions {
  /** Which size opens and closes: the height (default) or the width. */
  axis?: 'x' | 'y';
  duration?: number;
  easing?: string;
  /** Pixels the content slides in from, or out to, along x. */
  shift?: number;
  /** Set `hidden` once a close ends (default). Without it the closed size holds until the caller removes the element. */
  hide?: boolean;
  /** Clip the content to the changing size (default). Off when the caller's own style clips it. */
  clip?: boolean;
}

/**
 * Opens or closes `el` by its own measured size, with its padding and a fade alongside, so its
 * neighbours move with it. With reduced motion it only toggles `hidden`.
 */
export function fold(el: HTMLElement, open: boolean, opts: FoldOptions = {}): void {
  const { axis = 'y', duration = 240, easing = 'cubic-bezier(.32,.72,0,1)', shift = 0, hide = true, clip = true } = opts;
  const win = el.ownerDocument.defaultView;
  for (const running of el.getAnimations?.() ?? []) running.cancel();
  if (prefersStill(win) || !el.animate) { if (hide) el.hidden = !open; return; }
  el.hidden = false;
  const style = win!.getComputedStyle(el);
  const moved = shift ? `translateX(${shift}px)` : 'none';
  const full = axis === 'y'
    ? { height: `${el.offsetHeight}px`, minHeight: style.minHeight, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, marginBottom: style.marginBottom, opacity: 1, transform: 'none' }
    : { width: `${el.offsetWidth}px`, paddingRight: style.paddingRight, opacity: 1, transform: 'none' };
  const none = axis === 'y'
    ? { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', marginBottom: '0px', opacity: 0, transform: moved }
    : { width: '0px', paddingRight: '0px', opacity: 0, transform: moved };
  const overflow = el.style.overflow;
  if (clip) el.style.overflow = 'hidden';
  const motion = el.animate(open ? [none, full] : [full, none], { duration, easing, fill: !open && !hide ? 'forwards' : 'none' });
  const restore = () => { if (clip) el.style.overflow = overflow; };
  void motion.finished.then(() => { restore(); if (!open && hide) el.hidden = true; }, restore);
}
