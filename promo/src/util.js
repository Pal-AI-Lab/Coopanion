/**
 * Timing, easing and the soundtrack's beat grid: 155 BPM, bar 0 starting at 0.022 s into the file.
 * The file opens with 1.36 s of silence, so the promo starts the audio there; t = 0 is that point.
 */
export const AUDIO_START = 1.36;
export const BPM = 155;
export const T0 = 0.022 - AUDIO_START;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;
/** Time of beat n / bar n. */
export const beat = (n) => T0 + n * BEAT;
export const bar = (n) => T0 + n * BAR;

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Progress of t through [a, b], clamped. */
export const seg = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
export const ease = {
  outCubic: (k) => 1 - (1 - k) ** 3,
  inCubic: (k) => k ** 3,
  inOutCubic: (k) => (k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  outBack: (k, s = 1.7) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
  outElastic: (k) => (k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - .75) * (2 * Math.PI / 3)) + 1),
};
/** 0 → 1 → 0 bump centred on c with half-width w. */
export const bump = (t, c, w) => { const d = Math.abs(t - c) / w; return d >= 1 ? 0 : .5 + .5 * Math.cos(Math.PI * d); };

/** Deterministic PRNG (mulberry32); the promo swaps it in for Math.random so every render is identical. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
export const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
export const f1 = (n) => Math.round(n * 10) / 10;
