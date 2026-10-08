/**
 * The pet's size slider: `min`–`soft` on the main stretch, then a short stretch past a divider for `soft`–`max`.
 * While the value is past the divider the short stretch widens (and the whole bar a little, as far as the row
 * allows), the main stretch gives way; back at `soft` or below it shrinks again. Both are animated. The value
 * stays where it is while the bar changes under it: a drag goes on from the thumb, not from where the pointer
 * would land on the new scale.
 */

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
  /** 0 at rest, 1 widened; eased toward `target`. */
  let k = 0, from = 0, target = 0, startedAt = 0, raf = 0;
  let dragging = false, lastX = 0, offset = 0;
  const reduced = () => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const step = (v: number, up: boolean) => (v > o.soft || (up && v >= o.soft) ? .1 : .05);
  const snap = (v: number) => {
    const c = Math.min(o.max, Math.max(o.min, v));
    return c <= o.soft ? Math.round(c * 20) / 20 : Math.round(c * 10) / 10;
  };

  /** The bar's width and its main stretch, in pixels, for the current `k`. */
  function layout(): { width: number; mainW: number; tailW: number } {
    const room = o.room() || EXPANDED.width;
    const cw = Math.min(COLLAPSED.width, room), ew = Math.min(EXPANDED.width, room);
    const e = ease(k);
    const width = cw + (ew - cw) * e;
    const mainW = cw * COLLAPSED.main + (ew * EXPANDED.main - cw * COLLAPSED.main) * e;
    return { width, mainW, tailW: width - mainW };
  }
  const xOf = (v: number, l = layout()) => (v <= o.soft
    ? ((v - o.min) / (o.soft - o.min)) * l.mainW
    : l.mainW + ((v - o.soft) / (o.max - o.soft)) * l.tailW);
  const valueAt = (x: number, l = layout()) => (x <= l.mainW
    ? o.min + (Math.max(0, x) / l.mainW) * (o.soft - o.min)
    : o.soft + (Math.min(l.tailW, x - l.mainW) / l.tailW) * (o.max - o.soft));

  function draw(): void {
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

  function tick(now: number): void {
    const t = reduced() ? 1 : Math.min(1, (now - startedAt) / ANIMATE_MS);
    k = from + (target - from) * t;
    // the bar changed under a held thumb: the pointer now stands that far from it
    if (dragging) offset = xOf(value) - lastX;
    draw();
    raf = t < 1 ? requestAnimationFrame(tick) : 0;
  }
  function settle(): void {
    const want = value > o.soft ? 1 : 0;
    if (want === target) return;
    from = k; target = want; startedAt = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function update(v: number, notify: boolean): void {
    const next = snap(v);
    if (next === value) return;
    value = next;
    settle();
    draw();
    if (notify) o.onInput(value);
  }

  const localX = (e: PointerEvent) => e.clientX - el.getBoundingClientRect().left;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.focus();
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
    const keys: Record<string, () => number> = {
      ArrowRight: () => value + step(value, true), ArrowUp: () => value + step(value, true),
      ArrowLeft: () => value - step(value, false), ArrowDown: () => value - step(value, false),
      PageUp: () => value + .5, PageDown: () => value - .5, Home: () => o.min, End: () => o.max,
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
    set(v: number) { value = snap(v); k = from = target = value > o.soft ? 1 : 0; draw(); },
    relayout: draw,
  };
}
