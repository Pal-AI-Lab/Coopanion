/**
 * Saved looks (src/config.ts `SavedLook`): read at `GET /api/looks` and written whole through `POST /api/looks`.
 * The dressing page saves, renames and removes them; the look wheel over the pet switches between them.
 */
import { PALETTES, mini, normalizeSkin } from './coo/coo.js';

/** Resolves to the saved looks, or null when they could not be read. */
export const fetchLooks = () => fetch('/api/looks').then((r) => (r.ok ? r.json() : null)).then((l) => (Array.isArray(l) ? l : null)).catch(() => null);

/** Writes the whole list; resolves to the list the World kept, or null when the write failed. */
export const writeLooks = (looks) => fetch('/api/looks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ looks }) })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** What tells two skins apart: a pack and its pick, or Coo's palette, accessories and their colors. */
function lookKey(raw) {
  const s = normalizeSkin(raw);
  return s.figure && s.figure !== 'coo'
    ? JSON.stringify([s.figure, s.scheme ?? ''])
    : JSON.stringify(['coo', s.palette, s.head, s.side, s.glasses, s.neck, s.colors]);
}
export const sameLook = (a, b) => lookKey(a) === lookKey(b);

/** The option of each axis a pack's `scheme` picks: a preset id, or the options joined by `-` in axis order. */
function picksOf(pack, scheme) {
  const preset = pack.presets?.find((p) => p.id === scheme);
  const parts = (scheme || '').split('-');
  return (pack.axes ?? []).map((a, i) => (preset ? preset.pick?.[a.id] : parts[i]));
}

/**
 * The picture of a pack's pick: the thumb of the last axis whose pick differs from the pack's first preset (an
 * outfit changed shows the outfit, a palette changed the palette), else the first axis's; the pack's own without one.
 */
function packThumb(pack, scheme) {
  const axes = pack.axes ?? [];
  const picks = picksOf(pack, scheme), base = picksOf(pack, pack.presets?.[0]?.id);
  let i = axes.length - 1;
  while (i > 0 && picks[i] === base[i]) i--;
  return axes[i]?.options.find((o) => o.id === picks[i])?.thumb ?? pack.thumb ?? null;
}

const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Whether the look's figure is on hand: Coo always, a pack while it is installed. */
export const lookAvailable = (skin, packs) => { const f = normalizeSkin(skin).figure; return !f || f === 'coo' || !!packs?.some((p) => p.id === f); };

/**
 * How much of its tile a look's picture fills for the size on screen it keeps: by the square root of the size, 72% at
 * 100%, the whole tile from about 2× up, 40% at the least; a look without a size is drawn as at 100%.
 */
const pictureFill = (scale) => Math.min(1, Math.max(.4, .72 * Math.sqrt(typeof scale === 'number' ? scale : 1)));

/**
 * A look's picture as HTML: Coo drawn in its palette, or the pack's thumbnail, standing on the tile's bottom edge at
 * `pictureFill(scale)` of it (`.look-pic`, drawn by the page); empty when the pack is gone.
 */
export function lookPicture(skin, packs, dark, scale) {
  const s = normalizeSkin(skin);
  let pic = '';
  if (!s.figure || s.figure === 'coo') {
    const p = PALETTES.find((x) => x.id === s.palette) ?? PALETTES[0];
    const [ink, eye] = dark ? p.d : p.l;
    pic = `<svg viewBox="18 18 220 220" aria-hidden="true" style="--skin-ink:${ink};--skin-eye:${eye}">${mini('neutral', s)}</svg>`;
  } else {
    const pack = packs?.find((p) => p.id === s.figure);
    const thumb = pack && packThumb(pack, s.scheme);
    if (thumb) pic = `<img alt="" src="${escAttr(pack.base + thumb)}">`;
  }
  return pic && `<span class="look-pic" style="--look-fill:${pictureFill(scale).toFixed(3)}">${pic}</span>`;
}
