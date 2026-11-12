/**
 * The slider of the pet's pages and of the settings window (console/features/pet/index.ts, through pet-ui.d.ts):
 * `min`–`soft` on the main stretch, then a short stretch past a divider for `soft`–`max`; with `soft` at `max` it is one
 * plain stretch (the 外发光 and 音量 sliders). While the value is past the divider the short stretch widens (and the
 * whole bar, as far as `room()` allows); back at `soft` or below it shrinks again, animated. A drag leaves what is left
 * of the pointer as it is and grows the bar to the right only (`dragTo`), so the thumb stays under the pointer; the bar
 * settles into its rest layout once let go. Steps are `step`, or .05 up to `soft` and .1 past it.
 * Each page styles it by its root class: `.pet-scale` (pet.css, dress.css) or the settings window's `.companion-scale`
 * (home.css); the parts are `.ps-main`, `.ps-tail`, `.ps-fill`, `.ps-divider` and `.ps-thumb` on both.
 */

/** The bar's width and its main stretch's share: at rest, and while the value is past the divider. */
const WIDTHS = { collapsed: { width: 280, main: .88 }, expanded: { width: 440, main: .45 } };
const ANIMATE_MS = 240;
/** Milliseconds after the last step by key or wheel that the knob still shows as held (`.stepping`, pet.css). */
const STEP_HOLD_MS = 300;
const FINE = .05, COARSE = .1;
/** The size range on screen (src/config.ts SCALE_MIN, SCALE_MAX) and the divider, as on the settings window's slider. */
export const SIZE = { min: .5, soft: 2, max: 10 };

/**
 * A page that sends sizes to the World and hears the World's back: `sent(v)` when it sends one; `heard(v, busy)` for each
 * size the World pushes, `busy` while the page's own slider is held or a send is pending. A size heard while busy, or within
 * `ms` of a send and unlike it, is older than that send and is held; the size held when the window ends without an echo
 * is taken then (`take(v)`), so a size set elsewhere meanwhile is not lost.
 */
export function sizeEcho(take, ms = 1000) {
  let sent = NaN, at = -Infinity, held = null, timer = 0;
  const settle = () => { timer = 0; if (held === null) return; const v = held; held = null; take(v); };
  return {
    sent(v) {
      sent = v; at = performance.now(); held = null;
      clearTimeout(timer);
      timer = setTimeout(settle, ms);
    },
    heard(v, busy = false) {
      if (busy || (v !== sent && performance.now() - at < ms)) { held = v; return; }
      held = null;
      take(v);
    },
  };
}

const ease = (k) => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const still = (doc) => !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * `o`: { min, soft, max, label, room() (pixels the bar may take), onInput(value) while it moves, onChange(value) once a
 * drag or key press ends, step? (one step of the value), format?(value) (the value read aloud, a percentage by default),
 * widths? (as WIDTHS), className? (the root's, `pet-scale` by default) }. Returns { el, value, active (being dragged),
 * set(value), nudge(dir), relayout() }.
 */
export function scaleSlider(doc, o) {
  const widths = o.widths ?? WIDTHS;
  const el = doc.createElement('div');
  el.className = o.className ?? 'pet-scale';
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', o.label);
  el.setAttribute('aria-valuemin', String(o.min));
  el.setAttribute('aria-valuemax', String(o.max));
  const part = (cls) => { const d = doc.createElement('div'); d.className = cls; el.append(d); return d; };
  const main = part('ps-main'), tail = part('ps-tail'), fill = part('ps-fill'), divider = part('ps-divider'), thumb = part('ps-thumb');

  let value = 1;
  /** The bar at rest: 0 collapsed, 1 widened; eased from `from` toward `target` since `startedAt`. */
  let k = 0, from = 0, target = 0, startedAt = 0;
  /**
   * While a drag holds the bar: the main stretch's width at the press, kept; the tail values past the divider are mapped
   * on (`tail`), which only grows; and the tail as drawn (`shown`), catching up with it from `grownFrom` since `grownAt`.
   */
  let held = null;
  /** After a drag: the bar as it left it, shown less and less over the rest layout since `at`. */
  let left = null;
  let raf = 0;

  /** No stretch past a divider: `soft` is the end. */
  const single = o.soft >= o.max;
  if (single) { tail.hidden = true; divider.hidden = true; }
  const fine = o.step ?? FINE, coarse = o.step ?? COARSE;
  const step = (v, up) => (v > o.soft || (up && v >= o.soft) ? coarse : fine);
  const snap = (v) => {
    const c = Math.min(o.max, Math.max(o.min, v));
    const by = c <= o.soft ? fine : coarse;
    return Number((Math.round(c / by) * by).toFixed(4));
  };

  /** The bar at rest for `kk`: its width, its main stretch and the tail past the divider, in pixels. */
  function rest(kk) {
    const room = o.room() || widths.expanded.width;
    const cw = Math.min(widths.collapsed.width, room), ew = Math.min(widths.expanded.width, room);
    if (single) return { mainW: cw, tailW: 0 };
    const e = ease(kk);
    const width = cw + (ew - cw) * e;
    const mainW = cw * widths.collapsed.main + (ew * widths.expanded.main - cw * widths.collapsed.main) * e;
    return { mainW, tailW: width - mainW };
  }
  /** The bar now: `mainW` and `tailW` map values to pixels, `drawn` is the tail's drawn width. */
  function layout(now = performance.now()) {
    if (held) {
      const t = still(doc) ? 1 : Math.min(1, (now - held.grownAt) / ANIMATE_MS);
      return { mainW: held.mainW, tailW: held.tail, drawn: held.grownFrom + (held.tail - held.grownFrom) * ease(t) };
    }
    const kk = from + (target - from) * (still(doc) ? 1 : Math.min(1, (now - startedAt) / ANIMATE_MS));
    k = kk;
    const r = rest(kk);
    if (!left) return { ...r, drawn: r.tailW };
    const b = 1 - ease(still(doc) ? 1 : Math.min(1, (now - left.at) / ANIMATE_MS));
    const mainW = r.mainW + (left.mainW - r.mainW) * b, tailW = r.tailW + (left.tailW - r.tailW) * b;
    return { mainW, tailW, drawn: tailW };
  }
  const xOf = (v, l) => (v <= o.soft
    ? ((v - o.min) / (o.soft - o.min)) * l.mainW
    : l.mainW + ((v - o.soft) / (o.max - o.soft)) * l.tailW);
  const valueAt = (x, l) => (x <= l.mainW
    ? o.min + (Math.max(0, x) / l.mainW) * (o.soft - o.min)
    // with no stretch past the divider (tailW 0), beyond the bar's end is its end, not 0/0
    : l.tailW > 0 ? o.soft + (Math.min(l.tailW, x - l.mainW) / l.tailW) * (o.max - o.soft) : o.soft);

  function draw(l = layout()) {
    el.style.width = `${l.mainW + l.drawn}px`;
    main.style.width = `${l.mainW}px`;
    tail.style.left = divider.style.left = `${l.mainW}px`;
    tail.style.width = `${l.drawn}px`;
    const x = xOf(value, l);
    fill.style.width = `${x}px`;
    thumb.style.left = `${x}px`;
    el.classList.toggle('past', value > o.soft);
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', o.format?.(value) ?? `${Math.round(value * 100)}%`);
  }

  /** Whether any of the bar's changes is still under way at `now`. */
  function moving(now) {
    if (still(doc)) return false;
    if (held) return now - held.grownAt < ANIMATE_MS;
    return now - startedAt < ANIMATE_MS || (!!left && now - left.at < ANIMATE_MS);
  }
  function tick(now) {
    draw(layout(now));
    if (left && !held && now - left.at >= ANIMATE_MS) left = null;
    raf = moving(now) ? requestAnimationFrame(tick) : 0;
  }
  const animate = () => { if (!raf) raf = requestAnimationFrame(tick); };
  /** At rest (no drag): the bar widens past the divider and narrows back at it. */
  function settle() {
    const want = value > o.soft ? 1 : 0;
    if (want === target) return;
    layout();
    from = k; target = want; startedAt = performance.now();
    animate();
  }
  function update(v, notify) {
    const next = snap(v);
    if (next === value) return;
    value = next;
    if (!held) settle();
    draw();
    if (notify) o.onInput(value);
  }

  /**
   * A step by key or wheel moves the knob as a drag does: held (`.stepping`) until a moment after the last step, and
   * gliding to each new place instead of jumping.
   */
  let stepTimer = 0;
  function stepTo(v) {
    el.classList.add('stepping');
    clearTimeout(stepTimer);
    stepTimer = setTimeout(() => el.classList.remove('stepping'), STEP_HOLD_MS);
    update(v, true);
  }

  /**
   * A drag keeps what lies left of the pointer as it is: the main stretch keeps its width, and the tail grows to the
   * right, once, when the pointer first goes past the divider; values past it map on the grown tail from that moment on,
   * so the thumb stays under the pointer.
   */
  function dragTo(x) {
    if (!single && x > held.mainW) {
      const room = o.room() || widths.expanded.width;
      const want = Math.max(held.tail, Math.min(rest(1).tailW, room - held.mainW));
      if (want > held.tail) {
        const now = performance.now();
        held.grownFrom = layout(now).drawn;
        held.grownAt = now;
        held.tail = want;
        animate();
      }
    }
    update(valueAt(x, layout()), true);
  }
  const localX = (e) => e.clientX - el.getBoundingClientRect().left;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    // a drag follows the pointer at once: no glide left over from a step a moment ago
    clearTimeout(stepTimer);
    el.classList.remove('stepping');
    const l = layout();
    held = { mainW: l.mainW, tail: l.tailW, grownFrom: l.drawn, grownAt: -Infinity };
    left = null;
    dragTo(localX(e));
  });
  // the bar as the drag left it settles into the rest layout for the value let go at
  const end = () => {
    if (!held) return;
    const l = layout();
    held = null;
    left = { mainW: l.mainW, tailW: l.drawn, at: performance.now() };
    k = from = target = value > o.soft ? 1 : 0;
    animate();
    draw();
    o.onChange(value);
  };
  el.addEventListener('pointermove', (e) => {
    if (!held) return;
    // a move with no button down: the release was missed (let go over another window), and the drag is over
    if (e.buttons === 0) { end(); return; }
    dragTo(localX(e));
  });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // the page lost the pointer without a release reaching it: a drag left held would keep the pet window taking the mouse
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('keydown', (e) => {
    const keys = {
      ArrowRight: () => value + step(value, true), ArrowUp: () => value + step(value, true),
      ArrowLeft: () => value - step(value, false), ArrowDown: () => value - step(value, false),
      PageUp: () => value + coarse * 5, PageDown: () => value - coarse * 5, Home: () => o.min, End: () => o.max,
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    stepTo(next());
    o.onChange(value);
  });
  draw();
  /** Whether a value was set from outside yet: the first one, the value the page opens with, is drawn at rest at once. */
  let placed = false;
  return {
    el,
    get value() { return value; },
    get active() { return !!held; },
    /** A value set from outside: the knob moves there, and the bar widens or narrows as a step makes it. */
    set(v) {
      const next = snap(v);
      if (!placed) { placed = true; value = next; k = from = target = value > o.soft ? 1 : 0; left = null; draw(); return; }
      if (next === value) return;
      value = next;
      if (!held) settle();
      draw();
    },
    /** One step up (`dir` 1) or down (-1), as an arrow key moves it; reported through onInput. */
    nudge(dir) { stepTo(value + (dir > 0 ? step(value, true) : -step(value, false))); },
    relayout: () => draw(),
  };
}
