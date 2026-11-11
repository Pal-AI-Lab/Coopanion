/**
 * How a body changes on a stage, shared by the pet window and the dressing page's preview:
 * - another figure: the old body fades out shrinking a little toward its feet (`swapOut`, disposed after it), and the
 *   new one fades in from a little smaller and settles (`swapIn`);
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
export const WARM_MS = 90, SWAP_MS = WARM_MS + 340;

const still = (win) => !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The point `p` (stage pixels) as a transform origin inside `el`, whose box may be a cut-down window of the stage. */
function originIn(el, p, stage) {
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  return `${p.x - (r.left - s.left)}px ${p.y - (r.top - s.top)}px`;
}

/** Where a body stands: its feet, the bottom middle of its box. */
function feet(l) { return { x: l.box.x + l.box.w / 2, y: l.box.y + l.box.h }; }

/**
 * Fades `body` out, shrinking a little toward its feet, then disposes of it. Its halo goes at once: two blurred halos
 * drawn over each other for the length of the fade cost more than the fade.
 */
export function swapOut(body, stage) {
  const el = body?.el, l = body?.layout;
  if (!el || !l || still(stage.ownerDocument.defaultView)) { body?.dispose(); return; }
  body.setHalo(0, 0);
  const transformOrigin = originIn(el, feet(l), stage);
  const a = el.animate([
    { transform: 'scale(1)', opacity: 1, transformOrigin },
    { transform: 'scale(.88)', opacity: 0, transformOrigin },
  ], { duration: 200, delay: WARM_MS, easing: 'ease-in', fill: 'forwards' });
  a.finished.then(() => body.dispose(), () => body.dispose());
}

/**
 * Fades `body` in from a little smaller and lets it settle, after WARM_MS hidden; `l` is where it stands when it has
 * not said yet.
 */
export function swapIn(body, stage, l = body?.layout) {
  const el = body?.el;
  if (!el || !l || still(stage.ownerDocument.defaultView)) return;
  const transformOrigin = originIn(el, feet(l), stage);
  el.animate([
    { transform: 'scale(.88)', opacity: 0, transformOrigin },
    { transform: 'scale(.88)', opacity: 0, transformOrigin, offset: .3 },
    { transform: 'scale(1.02)', opacity: 1, transformOrigin, offset: .8 },
    { transform: 'scale(1)', opacity: 1, transformOrigin },
  ], { duration: 340, delay: WARM_MS, easing: 'ease-out', fill: 'backwards' });
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
