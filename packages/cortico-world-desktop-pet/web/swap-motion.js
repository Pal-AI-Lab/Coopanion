/**
 * How a body changes on a stage, shared by the pet window and the dressing page's preview:
 * - another figure: the old body fades out as the new one fades in (`swapOut`, disposed after it, and `swapIn`), both
 *   on one course of sizes with a small dip; put on at another size (`ratio`, the new size over the old), that course
 *   runs from the old size to the new, so the size and the figure change in one movement;
 * - another look of the same figure: the body dips and rises once (`restyle`);
 * - a new size: the drawn size follows the asked one on a spring (`springSize`) instead of jumping.
 *
 * The body's frame window (body-host.js `el`) is animated with the Web Animations API: its inline style belongs to the
 * halo (body-host.js setHalo), which rewrites it every frame. With reduced motion nothing moves: the change is immediate.
 *
 * A figure switch starts WARM_MS late: the new body, hidden meanwhile, draws its first frames (its textures, its first
 * layout) before it is shown, so that work does not fall on the fade's frames. SWAP_MS is how long a switch takes in all,
 * for a page that draws fewer frames at rest to draw every one meanwhile.
 */
/** How long the new body draws hidden before the switch shows it, and the whole switch, in milliseconds. */
const WARM_MS = 90, SWAP_RUN_MS = 340;
/** The whole switch, with a frame's margin for the last frames to land. */
export const SWAP_MS = WARM_MS + SWAP_RUN_MS + 40;

const still = (win) => !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The point `p` (stage pixels) as a transform origin inside `el`, whose box may be a cut-down window of the stage. */
function originIn(el, p, stage) {
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  return `${p.x - (r.left - s.left)}px ${p.y - (r.top - s.top)}px`;
}

/** Where a body stands: its feet, the bottom middle of its box. */
function feet(l) { return { x: l.box.x + l.box.w / 2, y: l.box.y + l.box.h }; }

/** A size ratio as the switch draws it: past these bounds the bodies would cover the screen or vanish mid-fade. */
const drawnRatio = (ratio) => Math.min(4, Math.max(.25, ratio));

/** When in the switch each step of its course falls, and the opacities of the body going and the body coming there. */
const OFFSETS = [0, .55, .85, 1], OUT_OPACITY = [1, .35, 0, 0], IN_OPACITY = [0, .65, 1, 1];
/** A small dip and rise over the course, so a switch at one size still moves. */
const DIP = [1, .97, 1.015, 1];
const SWAP_EASE = 'ease-in-out';

/**
 * The switch's course of sizes in the old body's units: from 1 to `r`, most of the way by the middle. The old body is drawn
 * at it and the new one, drawn at its own size, at it over `r`, so both show the same size at every moment.
 */
function course(el, l, stage, ratio, of, opacity) {
  const r = drawnRatio(ratio), transformOrigin = originIn(el, feet(l), stage);
  const sizes = [1, r ** .75, r, r];
  return OFFSETS.map((offset, i) => ({ offset, opacity: opacity[i], transformOrigin, transform: `scale(${(sizes[i] * DIP[i] / of(r)).toFixed(4)})` }));
}

/**
 * Fades `body` out along the switch's course, then disposes of it. Its halo goes at once: two blurred halos drawn over
 * each other for the length of the fade cost more than the fade.
 */
export function swapOut(body, stage, ratio = 1) {
  const el = body?.el, l = body?.layout;
  if (!el || !l || still(stage.ownerDocument.defaultView)) { body?.dispose(); return; }
  body.setHalo(0, 0);
  const frames = course(el, l, stage, ratio, () => 1, OUT_OPACITY);
  // a body still fading in from a switch a moment ago fades out from where it is, not from fully shown
  const running = el.getAnimations?.() ?? [];
  if (running.length) {
    const now = getComputedStyle(el);
    frames[0] = { ...frames[0], opacity: Number(now.opacity), transform: now.transform === 'none' ? frames[0].transform : now.transform };
    for (const a of running) a.cancel();
  }
  const a = el.animate(frames, { duration: SWAP_RUN_MS, delay: WARM_MS, easing: SWAP_EASE, fill: 'forwards' });
  a.finished.then(() => body.dispose(), () => body.dispose());
}

/**
 * Fades `body` in along the switch's course, after WARM_MS hidden; `l` is where it stands when it has not said yet.
 */
export function swapIn(body, stage, l = body?.layout, ratio = 1) {
  const el = body?.el;
  if (!el || !l || still(stage.ownerDocument.defaultView)) return;
  el.animate(course(el, l, stage, ratio, (r) => r, IN_OPACITY), { duration: SWAP_RUN_MS, delay: WARM_MS, easing: SWAP_EASE, fill: 'backwards' });
}

/** A dip toward the feet and back: the same figure in another look; RESTYLE_MS long. */
export const RESTYLE_MS = 280;
export function restyle(body, stage) {
  const el = body?.el, l = body?.layout;
  if (!el || !l || still(stage.ownerDocument.defaultView)) return;
  const transformOrigin = originIn(el, feet(l), stage);
  el.animate([
    { transform: 'scale(1)', transformOrigin },
    { transform: 'scale(1.03, .96)', transformOrigin, offset: .35 },
    { transform: 'scale(1)', transformOrigin },
  ], { duration: RESTYLE_MS, easing: 'ease-out' });
}

/**
 * A size that follows the one asked for on a slightly underdamped spring, so a large change overshoots a little and
 * settles in about a third of a second; `step(dt)` advances it and says whether it moved.
 */
export function springSize(start) {
  let x = start, v = 0, to = start;
  const K = 260, C = 2 * Math.sqrt(K) * .78;
  return {
    get value() { return x; },
    get target() { return to; },
    /** Whether it is still on its way. */
    get moving() { return x !== to || v !== 0; },
    set(next) { to = next; },
    /** Puts it at `next` at once. */
    jump(next) { x = to = next; v = 0; },
    step(dt) {
      if (x === to && v === 0) return false;
      const h = Math.min(dt, 1 / 30);
      v += (K * (to - x) - C * v) * h;
      x += v * h;
      if (Math.abs(to - x) < .0015 && Math.abs(v) < .02) { x = to; v = 0; }
      return true;
    },
  };
}
