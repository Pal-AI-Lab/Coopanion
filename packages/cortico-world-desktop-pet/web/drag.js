/**
 * Reordering by dragging, down a list or along a row, with the pointer rather than the browser's drag and drop, which
 * always shows its cursor and a faint snapshot of the element and does not scroll the list. The pressed element lifts
 * out as a copy that follows the pointer with the pointer itself hidden, and stays behind as an empty place the list
 * moves to where it would land (moveGap), the items it passes sliding aside. Near the list's ends it scrolls, faster
 * the nearer the pointer is. Esc, a cancelled pointer or the window losing focus cancels; a drag the page is left in
 * the middle of just ends, so the pointer shows again. The caller decides where things land and what a drop means.
 *
 * Used by the dressing page's favourite looks (drag-row.js, across) and, bundled, the settings window's lists
 * (console/base/drag.ts, down). Slides follow the motion level (motion-level.js): none at low motion.
 */
import { motionLevel } from './motion-level.js';

const DRAG_SLOP = 4, SCROLL_EDGE = 56, SCROLL_MAX = 18, SHIFT_MS = 180, SHIFT_EASING = 'cubic-bezier(.32,.72,0,1)';

/** The names an axis reads and writes. */
const AXES = {
  y: { client: 'clientY', start: 'top', end: 'bottom', size: 'height', scroll: 'scrollTop', scrollSize: 'scrollHeight', offsetSize: 'offsetHeight', translate: 'translateY', matrix: 'm42' },
  x: { client: 'clientX', start: 'left', end: 'right', size: 'width', scroll: 'scrollLeft', scrollSize: 'scrollWidth', offsetSize: 'offsetWidth', translate: 'translateX', matrix: 'm41' },
};

/**
 * `o`: { axis ('y' by default), pick(target) (the element a press on `target` lifts, or null), lifted?(el),
 * locate(at) (where a drop at viewport coordinate `at` would land: on every move and scroll step), drop(el, copyAt)
 * (the copy is gone; `copyAt` is where it showed along the axis, to slide the element in from), cancel(),
 * scroller (the element, or a function giving it, that scrolls near its ends), copyClass, layer? }.
 * With `layer` (a positioned box) the copy is laid inside its content, which cannot grow under it; without, the copy is
 * fixed in the window and kept inside the scroller. `signal` ends it.
 */
export function dragItems(root, o, signal) {
  const doc = root.ownerDocument, win = doc.defaultView, A = AXES[o.axis ?? 'y'];
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, signal ? { ...opts, signal } : opts);
  const scroller = () => (typeof o.scroller === 'function' ? o.scroller() : o.scroller);
  let press, lift;
  on(root, 'pointerdown', (event) => {
    if (event.button !== 0 || lift) return;
    const source = event.target, el = o.pick(source);
    if (el) press = { id: event.pointerId, x: event.clientX, y: event.clientY, source, el };
  });
  // An image inside would start the browser's own drag, which cancels this one.
  on(root, 'dragstart', (event) => { if (press) event.preventDefault(); });
  function start(event) {
    const { el, source } = press, box = el.getBoundingClientRect();
    const copy = el.cloneNode(true);
    copy.classList.add(o.copyClass); copy.inert = true; copy.setAttribute('aria-hidden', 'true');
    copy.style.width = `${box.width}px`; copy.style.height = `${box.height}px`;
    let limit = 0;
    if (o.layer) {
      // The layer's content as it is now: a copy past it would lengthen it, and the list would scroll on.
      limit = o.layer[A.scrollSize];
      o.layer.append(copy);
    } else {
      copy.style.top = `${box.top}px`; copy.style.left = `${box.left}px`;
      doc.body.append(copy);
    }
    lift = { el, copy, offset: press[o.axis === 'x' ? 'x' : 'y'] - box[A.start], limit, at: event[A.client], scroller: scroller() };
    // Moving the scroll by hand each frame: a smooth scroll-behavior would trail behind.
    lift.behavior = lift.scroller.style.scrollBehavior;
    lift.scroller.style.scrollBehavior = 'auto';
    el.classList.add('is-dragging'); doc.documentElement.classList.add('is-list-dragging');
    win.getSelection()?.removeAllRanges();
    o.lifted?.(el);
    // Keeps the moves coming when the pointer leaves the window; a pointer the browser no longer tracks cannot be captured.
    try { source.setPointerCapture?.(event.pointerId); } catch { /* The drag goes on without capture. */ }
  }
  /** Keeps the copy under the pointer, inside the layer's content or the scroller. */
  function place() {
    if (!lift) return;
    const size = lift.copy[A.offsetSize];
    if (o.layer) {
      const at = lift.at - lift.offset - o.layer.getBoundingClientRect()[A.start] + o.layer[A.scroll];
      lift.copy.style[A.start] = `${Math.max(0, Math.min(at, lift.limit - size))}px`;
    } else {
      const box = lift.scroller.getBoundingClientRect();
      lift.copy.style[A.start] = `${Math.max(box[A.start], Math.min(lift.at - lift.offset, box[A.end] - size))}px`;
    }
  }
  /** Scrolls while the pointer is near the scroller's ends, faster the nearer it is. */
  function scroll() {
    if (!lift) return;
    lift.frame = undefined;
    const box = lift.scroller.getBoundingClientRect(), at = lift.at;
    const depth = at < box[A.start] + SCROLL_EDGE ? at - box[A.start] - SCROLL_EDGE : at > box[A.end] - SCROLL_EDGE ? at - box[A.end] + SCROLL_EDGE : 0;
    if (!depth) return;
    const was = lift.scroller[A.scroll];
    lift.scroller[A.scroll] += Math.sign(depth) * Math.max(1, Math.min(SCROLL_MAX, Math.abs(depth) / SCROLL_EDGE * SCROLL_MAX));
    if (lift.scroller[A.scroll] === was) return;
    o.locate(at); place();
    lift.frame = win.requestAnimationFrame(scroll);
  }
  on(win, 'pointermove', (event) => {
    if (!press || event.pointerId !== press.id) return;
    if (!lift) { if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_SLOP) return; start(event); }
    event.preventDefault();
    // Placed after the list has moved its gap, which may have shifted what it scrolls over.
    lift.at = event[A.client]; o.locate(lift.at); place();
    if (lift.frame === undefined) lift.frame = win.requestAnimationFrame(scroll);
  });
  on(win, 'pointerup', (event) => {
    if (!press || event.pointerId !== press.id) return;
    press = undefined;
    if (!lift) return;
    // The click that follows a drag, in the same turn, is the drop, not a click on the element.
    const swallow = (stop) => { stop.stopPropagation(); stop.preventDefault(); };
    on(win, 'click', swallow, { capture: true, once: true });
    win.setTimeout(() => win.removeEventListener('click', swallow, { capture: true }), 0);
    const { el, copy } = lift, at = copy.getBoundingClientRect()[A.start];
    end(); o.drop(el, at);
  });
  const abandon = () => { press = undefined; if (lift) { end(); o.cancel(); } };
  on(win, 'pointercancel', (event) => { if (press && event.pointerId === press.id) abandon(); });
  on(doc, 'keydown', (event) => { if (event.key === 'Escape' && lift) abandon(); });
  on(win, 'blur', abandon);
  signal?.addEventListener('abort', () => { press = undefined; end(); }, { once: true });
  function end() {
    if (!lift) return;
    if (lift.frame !== undefined) win.cancelAnimationFrame(lift.frame);
    lift.copy.remove(); lift.el.classList.remove('is-dragging');
    lift.scroller.style.scrollBehavior = lift.behavior;
    lift = undefined;
    doc.documentElement.classList.remove('is-list-dragging');
  }
}

/** An element's box without the slide it may be in the middle of, so a drop target does not chase the animation. */
export function settledBox(el) {
  const win = el.ownerDocument.defaultView, box = el.getBoundingClientRect(), transform = win.getComputedStyle(el).transform;
  const matrix = transform && transform !== 'none' && win.DOMMatrixReadOnly ? new win.DOMMatrixReadOnly(transform) : null;
  const dx = matrix ? matrix.m41 : 0, dy = matrix ? matrix.m42 : 0;
  return { top: box.top - dy, bottom: box.bottom - dy, height: box.height, left: box.left - dx, right: box.right - dx, width: box.width };
}

/** Slides `el` from `delta` pixels away along the axis to its place; nothing at low motion. */
export function slideIn(el, delta, axis = 'y', id) {
  if (Math.abs(delta) <= .5 || motionLevel(el.ownerDocument.defaultView) === 'low') return;
  el.animate?.([{ transform: `${AXES[axis].translate}(${delta}px)` }, { transform: 'none' }], { ...(id ? { id } : {}), duration: SHIFT_MS, easing: SHIFT_EASING });
}

/** Moves the dragged element's empty place to `next` in `parent`; the `moving` elements it passes slide aside. */
export function moveGap(gap, parent, next, moving, axis = 'y') {
  if (next === gap || (gap.parentElement === parent && gap.nextElementSibling === next)) return;
  const A = AXES[axis];
  const others = moving.filter((el) => !gap.contains(el));
  // Each starts from where it shows now, mid-slide or not.
  const from = new Map(others.map((el) => [el, el.getBoundingClientRect()[A.start]]));
  for (const el of others) for (const running of el.getAnimations?.() ?? []) if (running.id === 'drag-shift') running.cancel();
  parent.insertBefore(gap, next);
  for (const [el, at] of from) slideIn(el, at - el.getBoundingClientRect()[A.start], axis, 'drag-shift');
}
