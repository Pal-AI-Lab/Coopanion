/**
 * The shapes behind every scene: thick round-capped circular arcs, each with a gap like the logo's
 * C: two concentric groups centred outside the top-right and bottom-left corners, so only part
 * of each arc crosses the frame, and a smaller pair in the bottom-right corner that shows about
 * 70% of its ring. Colors are the scheme's accent and chart colors mixed into the paper, so the
 * arcs stay behind text.
 *
 * `travel` is the rotation clock: the caller integrates speed over time, so a speed-up turns the
 * arcs faster without jumping them. `surge` (0–1) thickens and tints them a little; scene changes
 * use it.
 */
import { svgEl, f1 } from './util.js';

const PAPER = [244, 245, 244];
const MINT = [0, 168, 112], TEAL = [52, 143, 134], LEAF = [84, 180, 148], SAND = [181, 149, 100];
// r radius, w stroke width, gap in degrees, a0 start angle, sp degrees per unit of travel
const ARCS = [
  { cx: 2080, cy: -180, r: 560, w: 72, gap: 80, a0: 150, sp: 5, c: MINT, tint: .15 },
  { cx: 2080, cy: -180, r: 740, w: 52, gap: 120, a0: 320, sp: -3.5, c: LEAF, tint: .22 },
  { cx: -180, cy: 1260, r: 560, w: 78, gap: 90, a0: 330, sp: -4.5, c: TEAL, tint: .13 },
  { cx: -180, cy: 1260, r: 750, w: 54, gap: 130, a0: 120, sp: 3, c: SAND, tint: .17 },
  // the ring's right side past x = 1920 is about 30% of it
  { cx: 1800, cy: 820, r: 215, w: 64, gap: 70, a0: 200, sp: 9, c: MINT, tint: .17 },
  { cx: 1800, cy: 820, r: 128, w: 34, gap: 90, a0: 40, sp: -13, c: SAND, tint: .2 },
];
const mix = (c, k) => `rgb(${c.map((v, i) => Math.round(PAPER[i] + (v - PAPER[i]) * k)).join(' ')})`;

export function createArcs(svg) {
  const parts = ARCS.map((a) => {
    const g = svgEl('g');
    // the arc drawn once, centred on the origin with its gap facing +x; rotation moves the gap
    const h = a.gap / 2 * Math.PI / 180;
    const x = f1(a.r * Math.cos(h)), y = f1(a.r * Math.sin(h));
    const p = svgEl('path', { d: `M${x} ${-y}A${a.r} ${a.r} 0 1 0 ${x} ${y}`, fill: 'none', 'stroke-linecap': 'round' });
    g.appendChild(p);
    svg.appendChild(g);
    return { g, p };
  });
  return {
    render(travel, surge = 0) {
      ARCS.forEach((a, i) => {
        const { g, p } = parts[i];
        g.setAttribute('transform', `translate(${a.cx} ${a.cy}) rotate(${f1(a.a0 + a.sp * travel)})`);
        p.setAttribute('stroke', mix(a.c, a.tint + .04 * surge));
        p.setAttribute('stroke-width', f1(a.w * (1 + .1 * surge)));
      });
    },
  };
}
