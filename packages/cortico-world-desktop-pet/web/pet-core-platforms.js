import { createPet as createBasePet } from './pet-core.js';
export * from './pet-core.js';

const POLL_MS = 250;
const SUPPORT_EPS = 7;
const FOLLOW_EPS = 48;

const finite = (v) => Number.isFinite(v);

/**
 * Wraps the stock body simulation with desktop-window surfaces while leaving pet-core.js intact.
 * The stock core still owns animation, drag/throw, gravity and landing. This layer only supplies a
 * dynamic floor and turns a grounded body back into `air` when its support disappears under it.
 */
export function createPet(els, opts) {
  const host = window.petHost;
  if (!host?.getPlatforms) return createBasePet(els, opts);

  const rawBounds = opts.bounds;
  const onEvent = opts.onEvent || (() => {});
  let surfaces = [];
  let supportId = null;
  let nextPoll = 0;
  let polling = false;
  let dynamicFloor = null;
  let initialDrop = opts.enter === 'drop';

  const bounds = () => {
    const b = rawBounds();
    return { ...b, floorY: dynamicFloor ?? b.floorY };
  };

  const ctl = createBasePet(els, { ...opts, bounds });
  const rawStep = ctl.step.bind(ctl);
  const rawResize = ctl.resize.bind(ctl);

  const screenFloor = () => rawBounds().floorY;
  const airborne = () => ctl.pet.mode === 'air' || ctl.pet.mode === 'drag' || ctl.pet.mode === 'crouch';

  function normalize(list) {
    const floor = screenFloor();
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string'
      && finite(p.left) && finite(p.right) && finite(p.top) && finite(p.bottom)
      && p.right - p.left >= 16
      && p.top > -64 && p.top < floor - 1) : [];
  }

  function surfaceAt(x, y, tolerance = SUPPORT_EPS) {
    let best = null, bestD = Infinity;
    for (const p of surfaces) {
      if (x < p.left || x > p.right) continue;
      const d = Math.abs(p.top - y);
      if (d <= tolerance && d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  function nextSurfaceBelow(x, y) {
    let top = screenFloor(), found = null;
    for (const p of surfaces) {
      if (x < p.left || x > p.right) continue;
      // Keep the platform a jumping pet just left eligible, but never pull the pet upward through it.
      if (p.top < y - 2 || p.top >= top) continue;
      top = p.top; found = p;
    }
    return { top, surface: found };
  }

  function ceilingCrossing(x, fromY, toY, halfWidth) {
    if (toY >= fromY) return null;
    let hit = null;
    const sweepTop = Math.min(fromY, toY), sweepBottom = Math.max(fromY, toY);
    for (const p of surfaces) {
      if (x + halfWidth < p.left || x - halfWidth > p.right || p.bottom <= p.top) continue;
      const y = p.bottom;
      // A few pixels of tolerance account for 4 px visual sampling, DPI rounding and one-frame
      // motion. The old exact crossing test commonly stepped past this line without matching.
      if (sweepTop <= y + 10 && sweepBottom >= y - 14 && (!hit || y > hit.bottom)) hit = p;
    }
    return hit;
  }

  function moveWithPlatform(next) {
    if (!supportId || airborne()) return;
    const before = surfaces.find((p) => p.id === supportId);
    const after = next.find((p) => p.id === supportId);
    if (!before || !after) return;
    const oldCenter = (before.left + before.right) / 2;
    const newCenter = (after.left + after.right) / 2;
    const dx = newCenter - oldCenter, dy = after.top - before.top;
    if (!dx && !dy) return;
    ctl.pet.x += dx;
    ctl.pet.target += dx;
    ctl.pet.fy += dy;
  }

  function pollPlatforms() {
    const now = performance.now();
    if (polling || now < nextPoll || document.visibilityState !== 'visible') return;
    polling = true;
    nextPoll = now + POLL_MS;
    host.getPlatforms().then((list) => {
      const next = normalize(list);
      moveWithPlatform(next);
      surfaces = next;
    }).catch(() => {
      // Keep the last good snapshot on a transient IPC/native error. A successful empty snapshot
      // still clears it, so closing/minimizing a supporting window makes the pet fall normally.
    }).finally(() => { polling = false; });
  }

  function chooseFloor() {
    const p = ctl.pet;
    const floor = screenFloor();

    // Keep the original startup behavior: appearing Coo falls to the desktop floor once. Later
    // user drops and throws can land on any detected platform.
    if (initialDrop && p.mode === 'air') {
      supportId = null;
      return floor;
    }
    if (p.mode === 'drag') {
      supportId = null;
      return floor;
    }
    if (p.mode === 'air' || p.mode === 'crouch') {
      return nextSurfaceBelow(p.x, p.fy).top;
    }

    const support = surfaceAt(p.x, p.fy, FOLLOW_EPS);
    if (support) {
      supportId = support.id;
      return support.top;
    }
    if (Math.abs(p.fy - floor) <= FOLLOW_EPS) {
      supportId = null;
      return floor;
    }

    // Do not snap an unsupported grounded body to the desktop floor. It gets converted to `air`
    // after this simulation step and gravity takes over on the next one.
    supportId = null;
    return p.fy;
  }

  function startFalling() {
    const p = ctl.pet;
    if (airborne()) return;
    const floor = screenFloor();
    if (Math.abs(p.fy - floor) <= SUPPORT_EPS || surfaceAt(p.x, p.fy, SUPPORT_EPS)) return;

    const previous = p.mode;
    if ((previous === 'walk' || previous === 'run') && p.walkId) {
      const id = p.walkId;
      p.walkId = 0;
      onEvent('interrupted', { walkId: id, x: Math.round(p.x), by: 'air' });
    }
    p.vx = previous === 'walk' || previous === 'run'
      ? p.facing * Math.max(p.speed, previous === 'run' ? 120 : 55)
      : 0;
    p.vy = 0;
    p.airKind = 'ledge';
    p.mode = 'air';
    p.modeT = 0;
    p.turned = false;
    p.startle = false;
    p.skid = false;
    p.cue = 0;
    supportId = null;
    onEvent('mode', { mode: 'air' });
  }

  ctl.step = (dt) => {
    pollPlatforms();
    dynamicFloor = chooseFloor();
    // pet-core caches floorY internally only when resize() runs. Updating it before the stock step
    // lets its existing gravity/land code collide with the nearest platform below the feet.
    rawResize();

    const beforeMode = ctl.pet.mode, beforeVy = ctl.pet.vy;
    const headH = 262 * rawBounds().S;
    const beforeHead = ctl.pet.fy - headH;
    rawStep(dt);

    // Upward head collision against the underside of another native window.
    if (beforeMode === 'air' && beforeVy < 0 && ctl.pet.mode === 'air') {
      const afterHead = ctl.pet.fy - headH;
      const ceiling = ceilingCrossing(ctl.pet.x, beforeHead, afterHead, 42 * rawBounds().S);
      if (ceiling) {
        const impact = -beforeVy;
        ctl.pet.fy = ceiling.bottom + headH + 1;
        ctl.pet.vy = Math.max(140, impact * .25);
        ctl.pet.vx *= .7;
        ctl.pet.airKind = 'bonk';
        ctl.pet.bonkDizzy ||= impact >= 380;
        ctl.pet.sqv += 1.2;
      }
    }

    if (initialDrop && ctl.pet.mode !== 'air') initialDrop = false;
    startFalling();

    if (!airborne()) {
      const s = surfaceAt(ctl.pet.x, ctl.pet.fy, FOLLOW_EPS);
      supportId = s?.id ?? null;
    }
  };

  ctl.resize = () => {
    dynamicFloor = null;
    rawResize();
  };

  Object.defineProperty(ctl, 'platforms', { get: () => surfaces });
  return ctl;
}
