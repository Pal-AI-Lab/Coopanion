/**
 * The pet's size slider: `min`–`soft` on the main stretch, then a short stretch past a divider for `soft`–`max`.
 * With `soft` at `max` it is one plain stretch in whole `step`s (the 外发光 slider), drawn the same way.
 * While the value is past the divider the short stretch widens (and the whole bar a little, as far as the row
 * allows), the main stretch gives way; back at `soft` or below it shrinks again. Both are animated. A drag leaves what
 * is left of the pointer as it is and grows the bar to the right only (`dragTo`), so the thumb stays under the pointer;
 * the bar settles into its rest layout once let go.
 */
import { prefersStill } from '../../base/motion.ts';

/** Shares of the bar and its width: at rest, and while the value is past the divider. */
const COLLAPSED = { width: 280, main: .88 };
const EXPANDED = { width: 440, main: .45 };
const ANIMATE_MS = 240;

export interface ScaleSliderOptions {
  min: number;
  /** Where the divider sits: the end of the main stretch. */
  soft: number;
  max: number;
  label: string;
  /** One step of the value; the size slider's default moves by .05, and .1 past the divider. */
  step?: number;
  /** The value as read aloud; the size slider's default is a percentage. */
  format?(value: number): string;
  /** Pixels the bar may take in its row. */
  room(): number;
  /** While the value changes (dragging, keys). */
  onInput(value: number): void;
  /** Once a drag or a key press ends. */
  onChange(value: number): void;
}

export interface ScaleSlider {
  el: HTMLElement;
  readonly value: number;
  /** Whether the person is dragging it now. */
  readonly active: boolean;
  set(value: number): void;
  /** Draws again for a new `room()`. */
  relayout(): void;
}

const ease = (k: number) => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** The bar's main stretch and the tail values past the divider are mapped on, and the tail's drawn width, in pixels. */
interface Layout { mainW: number; tailW: number; drawn: number }

export function scaleSlider(doc: Document, o: ScaleSliderOptions): ScaleSlider {
  const el = doc.createElement('div');
  el.className = 'companion-scale';
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', o.label);
  el.setAttribute('aria-valuemin', String(o.min));
  el.setAttribute('aria-valuemax', String(o.max));
  const part = (cls: string) => { const d = doc.createElement('div'); d.className = cls; el.append(d); return d; };
  const main = part('cs-main'), tail = part('cs-tail'), fill = part('cs-fill'), divider = part('cs-divider'), thumb = part('cs-thumb');

  let value = 1;
  /** The bar at rest: 0 collapsed, 1 widened; eased from `from` toward `target` since `startedAt`. */
  let k = 0, from = 0, target = 0, startedAt = 0, raf = 0;
  /**
   * While a drag holds the bar: the main stretch's width at the press, kept; the tail values past the divider are mapped
   * on (`tail`), which only grows; and the tail as drawn, catching up with it from `grownFrom` since `grownAt`.
   */
  let held: { mainW: number; tail: number; grownFrom: number; grownAt: number } | null = null;
  /** After a drag: the bar as it left it, shown less and less over the rest layout since `at`. */
  let left: { mainW: number; tailW: number; at: number } | null = null;
  const reduced = () => prefersStill(doc.defaultView);
  const share = (since: number, now: number) => (reduced() ? 1 : Math.min(1, (now - since) / ANIMATE_MS));

  /** No stretch past a divider: `soft` is the end. */
  const single = o.soft >= o.max;
  const fine = o.step ?? .05, coarse = o.step ?? .1;
  const step = (v: number, up: boolean) => (v > o.soft || (up && v >= o.soft) ? coarse : fine);
  const snap = (v: number) => {
    const c = Math.min(o.max, Math.max(o.min, v));
    const by = c <= o.soft ? fine : coarse;
    return Number((Math.round(c / by) * by).toFixed(4));
  };
  if (single) { tail.hidden = true; divider.hidden = true; }

  /** The bar at rest for `kk`, in pixels. */
  function rest(kk: number): { mainW: number; tailW: number } {
    const room = o.room() || EXPANDED.width;
    const cw = Math.min(COLLAPSED.width, room), ew = Math.min(EXPANDED.width, room);
    if (single) return { mainW: cw, tailW: 0 };
    const e = ease(kk);
    const width = cw + (ew - cw) * e;
    const mainW = cw * COLLAPSED.main + (ew * EXPANDED.main - cw * COLLAPSED.main) * e;
    return { mainW, tailW: width - mainW };
  }
  function layout(now = performance.now()): Layout {
    if (held) return { mainW: held.mainW, tailW: held.tail, drawn: held.grownFrom + (held.tail - held.grownFrom) * ease(share(held.grownAt, now)) };
    k = from + (target - from) * share(startedAt, now);
    const r = rest(k);
    if (!left) return { ...r, drawn: r.tailW };
    const b = 1 - ease(share(left.at, now));
    const mainW = r.mainW + (left.mainW - r.mainW) * b, tailW = r.tailW + (left.tailW - r.tailW) * b;
    return { mainW, tailW, drawn: tailW };
  }
  const xOf = (v: number, l: Layout) => (v <= o.soft
    ? ((v - o.min) / (o.soft - o.min)) * l.mainW
    : l.mainW + ((v - o.soft) / (o.max - o.soft)) * l.tailW);
  const valueAt = (x: number, l: Layout) => (x <= l.mainW
    ? o.min + (Math.max(0, x) / l.mainW) * (o.soft - o.min)
    // with no stretch past the divider (tailW 0), beyond the bar's end is its end, not 0/0
    : l.tailW > 0 ? o.soft + (Math.min(l.tailW, x - l.mainW) / l.tailW) * (o.max - o.soft) : o.soft);

  function draw(l = layout()): void {
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
  function moving(now: number): boolean {
    if (reduced()) return false;
    if (held) return now - held.grownAt < ANIMATE_MS;
    return now - startedAt < ANIMATE_MS || (!!left && now - left.at < ANIMATE_MS);
  }
  function tick(now: number): void {
    draw(layout(now));
    if (left && !held && now - left.at >= ANIMATE_MS) left = null;
    raf = moving(now) ? requestAnimationFrame(tick) : 0;
  }
  const animate = () => { if (!raf) raf = requestAnimationFrame(tick); };
  /** At rest (no drag): the bar widens past the divider and narrows back at it. */
  function settle(): void {
    const want = value > o.soft ? 1 : 0;
    if (want === target) return;
    layout();
    from = k; target = want; startedAt = performance.now();
    animate();
  }
  function update(v: number, notify: boolean): void {
    const next = snap(v);
    if (next === value) return;
    value = next;
    if (!held) settle();
    draw();
    if (notify) o.onInput(value);
  }

  /**
   * A drag keeps what lies left of the pointer as it is: the main stretch keeps its width, and the tail grows to the
   * right, once, when the pointer first goes past the divider; values past it map on the grown tail from that moment on,
   * so the thumb stays under the pointer.
   */
  function dragTo(x: number): void {
    const h = held!;
    if (!single && x > h.mainW) {
      const room = o.room() || EXPANDED.width;
      const want = Math.max(h.tail, Math.min(rest(1).tailW, room - h.mainW));
      if (want > h.tail) {
        const now = performance.now();
        h.grownFrom = layout(now).drawn;
        h.grownAt = now;
        h.tail = want;
        animate();
      }
    }
    update(valueAt(x, layout()), true);
  }
  const localX = (e: PointerEvent) => e.clientX - el.getBoundingClientRect().left;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.focus();
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
    const keys: Record<string, () => number> = {
      ArrowRight: () => value + step(value, true), ArrowUp: () => value + step(value, true),
      ArrowLeft: () => value - step(value, false), ArrowDown: () => value - step(value, false),
      PageUp: () => value + coarse * 5, PageDown: () => value - coarse * 5, Home: () => o.min, End: () => o.max,
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
    get active() { return !!held; },
    set(v: number) { value = snap(v); k = from = target = value > o.soft ? 1 : 0; left = null; draw(); },
    relayout: () => draw(),
  };
}
