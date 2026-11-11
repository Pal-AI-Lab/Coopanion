/**
 * The pet's size slider, as the settings window draws it (console/features/pet/scale-slider.ts): `min`–`soft` on the
 * main stretch, then a short stretch past a divider for `soft`–`max`. While the value is past the divider the short
 * stretch widens (and the whole bar, as far as `room()` allows); back at `soft` or below it shrinks again, animated.
 * A drag goes on from the thumb while the bar changes under it. Steps are .05 up to `soft` and .1 past it.
 * Styled by `.pet-scale` (pet.css).
 */

/** The bar's width and its main stretch's share: at rest, and while the value is past the divider. */
const WIDTHS = { collapsed: { width: 280, main: .88 }, expanded: { width: 440, main: .45 } };
const ANIMATE_MS = 240;
const FINE = .05, COARSE = .1;
/** The size range on screen (src/config.ts SCALE_MIN, SCALE_MAX) and the divider, as on the settings window's slider. */
export const SIZE = { min: .5, soft: 2, max: 10 };

const ease = (k) => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const still = (doc) => !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * `o`: { min, soft, max, label, room() (pixels the bar may take), onInput(value) while it moves, onChange(value) once a
 * drag or key press ends, widths? (as WIDTHS) }. Returns { el, value, active (being dragged), set(value), relayout() }.
 */
export function scaleSlider(doc, o) {
  const widths = o.widths ?? WIDTHS;
  const el = doc.createElement('div');
  el.className = 'pet-scale';
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', o.label);
  el.setAttribute('aria-valuemin', String(o.min));
  el.setAttribute('aria-valuemax', String(o.max));
  const part = (cls) => { const d = doc.createElement('div'); d.className = cls; el.append(d); return d; };
  const main = part('ps-main'), tail = part('ps-tail'), fill = part('ps-fill'), divider = part('ps-divider'), thumb = part('ps-thumb');

  let value = 1;
  /** 0 at rest, 1 widened; eased toward `target`. */
  let k = 0, from = 0, target = 0, startedAt = 0, raf = 0;
  let dragging = false, lastX = 0, offset = 0;

  const step = (v, up) => (v > o.soft || (up && v >= o.soft) ? COARSE : FINE);
  const snap = (v) => {
    const c = Math.min(o.max, Math.max(o.min, v));
    const by = c <= o.soft ? FINE : COARSE;
    return Number((Math.round(c / by) * by).toFixed(4));
  };

  function layout() {
    const room = o.room() || widths.expanded.width;
    const cw = Math.min(widths.collapsed.width, room), ew = Math.min(widths.expanded.width, room);
    const e = ease(k);
    const width = cw + (ew - cw) * e;
    const mainW = cw * widths.collapsed.main + (ew * widths.expanded.main - cw * widths.collapsed.main) * e;
    return { width, mainW, tailW: width - mainW };
  }
  const xOf = (v, l = layout()) => (v <= o.soft
    ? ((v - o.min) / (o.soft - o.min)) * l.mainW
    : l.mainW + ((v - o.soft) / (o.max - o.soft)) * l.tailW);
  const valueAt = (x, l = layout()) => (x <= l.mainW
    ? o.min + (Math.max(0, x) / l.mainW) * (o.soft - o.min)
    : o.soft + (Math.min(l.tailW, x - l.mainW) / l.tailW) * (o.max - o.soft));

  function draw() {
    const l = layout();
    el.style.width = `${l.width}px`;
    main.style.width = `${l.mainW}px`;
    tail.style.left = divider.style.left = `${l.mainW}px`;
    tail.style.width = `${l.tailW}px`;
    const x = xOf(value, l);
    fill.style.width = `${x}px`;
    thumb.style.left = `${x}px`;
    el.classList.toggle('past', value > o.soft);
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', `${Math.round(value * 100)}%`);
  }

  function tick(now) {
    const t = still(doc) ? 1 : Math.min(1, (now - startedAt) / ANIMATE_MS);
    k = from + (target - from) * t;
    // the bar changed under a held thumb: the pointer now stands that far from it
    if (dragging) offset = xOf(value) - lastX;
    draw();
    raf = t < 1 ? requestAnimationFrame(tick) : 0;
  }
  function settle() {
    const want = value > o.soft ? 1 : 0;
    if (want === target) return;
    from = k; target = want; startedAt = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function update(v, notify) {
    const next = snap(v);
    if (next === value) return;
    value = next;
    settle();
    draw();
    if (notify) o.onInput(value);
  }

  const localX = (e) => e.clientX - el.getBoundingClientRect().left;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    dragging = true;
    lastX = localX(e);
    offset = 0;
    update(valueAt(lastX), true);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    lastX = localX(e);
    update(valueAt(lastX + offset), true);
  });
  const end = () => { if (!dragging) return; dragging = false; o.onChange(value); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const keys = {
      ArrowRight: () => value + step(value, true), ArrowUp: () => value + step(value, true),
      ArrowLeft: () => value - step(value, false), ArrowDown: () => value - step(value, false),
      PageUp: () => value + COARSE * 5, PageDown: () => value - COARSE * 5, Home: () => o.min, End: () => o.max,
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    update(next(), true);
    o.onChange(value);
  });
  draw();
  return {
    el,
    get value() { return value; },
    get active() { return dragging; },
    set(v) { value = snap(v); k = from = target = value > o.soft ? 1 : 0; draw(); },
    /** One step up (`dir` 1) or down (-1), as an arrow key moves it; reported through onInput. */
    nudge(dir) { update(value + (dir > 0 ? step(value, true) : -step(value, false)), true); },
    relayout: draw,
  };
}
