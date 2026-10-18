/**
 * The window tops the body stands and climbs on, and the arithmetic for both.
 *
 * A ledge is `{ x0, x1, y }` in stage pixels: the visible top edge of a desktop window, `x0` its left
 * end, `x1` its right (both inclusive), `y` the height the feet rest at. The window process reads
 * them from the desktop (`host/windows.cjs`); the page hands them over in `bounds()`; with none, the
 * floor is the only ground.
 */

/** The surface a body with its feet at `feetY` meets at `x`: the lowest ledge at or below them, else the floor. */
export function groundAt(ledges, x, feetY, floorY) {
  let best = floorY;
  for (const l of ledges) {
    if (x < l.x0 || x > l.x1) continue;
    if (l.y < feetY - .5) continue;
    if (l.y < best) best = l.y;
  }
  return best;
}

/**
 * The window top the body should climb: the lowest one above the feet that is worth the walk, with
 * the side to reach it from (`side` -1 left edge, 1 right edge) and where that edge is.
 *
 * `reach` is how far it will walk to get to the side, not how close it must already be: from under a
 * window there is no side to climb, so it walks out to one. Null when every top is under `rise` above
 * the feet or more than `reach` away.
 */
export function climbTarget(ledges, x, feetY, { rise = 64, reach = 900 } = {}) {
  let best = null;
  for (const l of ledges) {
    if (l.y > feetY - rise) continue;
    if (x >= l.x0 && x <= l.x1) continue;
    const side = x < l.x0 ? -1 : 1;
    const edgeX = side < 0 ? l.x0 : l.x1;
    if (Math.abs(edgeX - x) > reach) continue;
    if (!best || l.y > best.ledge.y) best = { ledge: l, edgeX, side };
  }
  return best;
}

/** Where the body steps onto `ledge` after climbing its `side` edge: far enough in to stand. */
export function mountX(ledge, side, inset = 34) {
  return side < 0 ? ledge.x0 + inset : ledge.x1 - inset;
}
