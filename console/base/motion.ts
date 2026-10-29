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
 * Opens or closes `el` by its own measured size, with a fade alongside, so its neighbours move with
 * it. The size and every padding and margin on the axis go to zero, so the closed frame takes the
 * space `hidden` takes and the open frame the space the element ends at: nothing jumps when the
 * animation hands over to the stylesheet. Borders keep their width (the browser draws any width under
 * a pixel as a whole one), and the far margin gives their width back instead. With reduced motion it
 * only toggles `hidden`.
 */
export function fold(el: HTMLElement, open: boolean, opts: FoldOptions = {}): void {
  const { axis = 'y', duration = 240, easing = 'cubic-bezier(.32,.72,0,1)', shift = 0, hide = true, clip = true } = opts;
  const win = el.ownerDocument.defaultView;
  for (const running of el.getAnimations?.() ?? []) running.cancel();
  if (prefersStill(win) || !el.animate) { if (hide) el.hidden = !open; return; }
  el.hidden = false;
  const style = win!.getComputedStyle(el);
  const [size, min, sides] = axis === 'y' ? ['height', 'min-height', ['top', 'bottom']] as const : ['width', 'min-width', ['left', 'right']] as const;
  const full: Keyframe = { opacity: 1, transform: 'none' };
  const none: Keyframe = { opacity: 0, transform: shift ? `translateX(${shift}px)` : 'none' };
  for (const property of [size, min, ...sides.flatMap(side => [`padding-${side}`, `margin-${side}`])]) {
    const key = property.replace(/-./g, part => part[1].toUpperCase());
    full[key] = style.getPropertyValue(property); none[key] = '0px';
  }
  const borders = sides.reduce((sum, side) => sum + (parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0), 0);
  if (borders) none[axis === 'y' ? 'marginBottom' : 'marginRight'] = `${-borders}px`;
  const overflow = el.style.overflow;
  if (clip) el.style.overflow = 'hidden';
  const motion = el.animate(open ? [none, full] : [full, none], { duration, easing, fill: !open && !hide ? 'forwards' : 'none' });
  const restore = () => { if (clip) el.style.overflow = overflow; };
  void motion.finished.then(() => { restore(); if (!open && hide) el.hidden = true; }, restore);
}
