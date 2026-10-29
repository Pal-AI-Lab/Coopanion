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

export interface Reflow {
  /** Animates from the measured layout to the current one, in `container` or the one measured. */
  play(container?: HTMLElement): void;
}

const REFLOW_MS = 280, REFLOW_EASING = 'cubic-bezier(.32,.72,0,1)';

/**
 * Measures the items in `container` (those matching `selector`, keyed by `key`) before a change, so
 * the change can then play as motion: an item that stays slides from where it was, one that
 * appears fades in, and one that went fades out where it stood while the rest close the gap. Only
 * items in the window are animated. An item is "there" while it has a box; hidden or filtered-out
 * items count as gone. With reduced motion `play` does nothing.
 */
export function measureReflow(container: HTMLElement, selector: string, key: (el: HTMLElement) => string | undefined): Reflow {
  const win = container.ownerDocument.defaultView;
  const before = new Map<string, { el: HTMLElement; parent: HTMLElement | null; rect: DOMRect; display: string }>();
  // Rects include a running slide, so an interrupted reflow continues from where the items are.
  if (!prefersStill(win)) for (const el of container.querySelectorAll<HTMLElement>(selector)) {
    const id = key(el), rect = el.getBoundingClientRect();
    if (id && rect.height) before.set(id, { el, parent: el.parentElement, rect, display: win!.getComputedStyle(el).display });
  }
  for (const ghost of container.querySelectorAll('.motion-ghost')) ghost.remove();
  return {
    play(target = container) {
      if (!before.size || !win || !target.animate) return;
      const seen = new Set<string>(), inView = (rect: DOMRect) => rect.bottom > 0 && rect.top < win.innerHeight;
      for (const el of target.querySelectorAll<HTMLElement>(selector)) {
        for (const running of el.getAnimations()) if (running.id === 'reflow') running.cancel();
        const id = key(el), rect = el.getBoundingClientRect();
        if (!id || !rect.height) continue;
        seen.add(id);
        const was = before.get(id);
        if (!was) { if (inView(rect)) el.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], { id: 'reflow', duration: REFLOW_MS, easing: REFLOW_EASING }); continue; }
        const dx = was.rect.left - rect.left, dy = was.rect.top - rect.top;
        if ((Math.abs(dx) > .5 || Math.abs(dy) > .5) && (inView(rect) || inView(was.rect)))
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { id: 'reflow', duration: REFLOW_MS, easing: REFLOW_EASING });
      }
      // What went fades out as a copy where it stood, above the gap the rest are closing: in its own
      // parent while that is still shown, so the styles it had there still apply.
      for (const [id, was] of before) {
        if (seen.has(id) || !inView(was.rect)) continue;
        const host = was.parent?.isConnected && was.parent.getClientRects().length && target.contains(was.parent) ? was.parent : target;
        const box = host.getBoundingClientRect();
        if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const ghost = was.el.cloneNode(true) as HTMLElement;
        ghost.classList.add('motion-ghost'); ghost.removeAttribute('id'); ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
        for (const attr of ['data-name', 'data-key']) { ghost.removeAttribute(attr); for (const inner of ghost.querySelectorAll(`[${attr}]`)) inner.removeAttribute(attr); }
        Object.assign(ghost.style, {
          position: 'absolute', display: was.display, margin: '0', pointerEvents: 'none', boxSizing: 'border-box',
          left: `${was.rect.left - box.left - host.clientLeft + host.scrollLeft}px`, top: `${was.rect.top - box.top - host.clientTop + host.scrollTop}px`,
          width: `${was.rect.width}px`, height: `${was.rect.height}px`,
        });
        host.append(ghost);
        const out = ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }], { duration: REFLOW_MS * .7, easing: 'ease-out', fill: 'forwards' });
        void out.finished.then(() => ghost.remove(), () => ghost.remove());
      }
    },
  };
}
