/**
 * Draws a repository banner: the pet from pet-core beside a title in the promo's lettering, in a
 * light and a dark version for GitHub's <picture> switch.
 *
 *   node promo/banner.mjs <companion|desktop-pet|cua> <out-dir>   → <out-dir>/banner.svg, banner-dark.svg
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figure, FACES, STAND, normalizeSkin, wear } from '../packages/cortico-world-desktop-pet/web/pet-core.js';
import { lettering, LETTER_BOX } from './src/wordmark.js';

// strokes at the Cortico banner's weight
const W = 1280, H = 320, SW = 16, MARGIN = 80, GAP_X = 60, GAP_Y = 22, PET_S = .95;
const THEMES = {
  light: { bg: '#FFFFFF', ink: '#1B1626', dim: '#8B8B8F', accent: '#00A870', blush: '#FF8FA8', shadow: 'rgba(27,22,38,.12)', cursor: '#FFFFFF' },
  dark: { bg: '#0D1117', ink: '#FFFFFF', dim: '#8C95A3', accent: '#2FD59B', blush: '#FF7F9E', shadow: 'rgba(0,0,0,.45)', cursor: '#0D1117' },
};
const BANNERS = {
  companion: { label: 'Coopanion', lines: [['Coopanion', 1]], max: 1.1, face: 'happy', skin: {} },
  'desktop-pet': { label: 'cortico-world-desktop-pet', lines: [['cortico world', .52, 'dim'], ['desktop pet', 1]], max: .92, face: 'wink', skin: { head: 'cat' } },
  cua: { label: 'cortico-world-cua', lines: [['cortico world', .52, 'dim'], ['computer use', 1]], max: .92, face: 'neutral', look: [4, 3], skin: {}, cursor: true },
};
const f = (n) => Math.round(n * 10) / 10;

function banner(spec, theme) {
  const c = THEMES[theme];
  let skin = normalizeSkin(null);
  for (const [slot, id] of Object.entries(spec.skin)) skin = wear(skin, slot, id);
  const pet = figure(FACES[spec.face].f(0), { look: spec.look ?? [0, 0], legs: STAND, low: 0, t: 0, blink: 0, acc: skin });

  // title lines: the largest scale that fits beside the pet, capped so a short title does not grow huge
  const petW = 250 * PET_S;
  const avail = W - 2 * MARGIN - petW - GAP_X;
  const laid = spec.lines.map(([text, rel, tone]) => ({ text, rel, tone, ...lettering(text, { accentAt: spec.label === 'Coopanion' ? [1, 2] : undefined }) }));
  const base = Math.min(spec.max, ...laid.map((l) => avail / ((l.width + 2 * SW) * l.rel)));
  laid.forEach((l) => { l.s = base * l.rel; });
  const hasDesc = (l) => /p/.test(l.text);
  // stack the lines by their ascender tops and baselines (descenders hang below)
  let y = 0;
  laid.forEach((l, i) => {
    if (i) y += GAP_Y + (LETTER_BOX.centre - (LETTER_BOX.top + 6)) * l.s;
    l.y = y;
    y += (134 + SW / 2 - LETTER_BOX.centre) * l.s;
  });
  const top = laid[0].y - (LETTER_BOX.centre - (LETTER_BOX.top + 6)) * laid[0].s;
  const last = laid[laid.length - 1];
  const bottom = last.y + ((hasDesc(last) ? 158 : 134) + SW / 2 - LETTER_BOX.centre) * last.s;
  const blockW = Math.max(...laid.map((l) => (l.width + SW) * l.s));
  const shiftY = H / 2 - 4 - (top + bottom) / 2;

  const x0 = (W - (petW + GAP_X + blockW)) / 2;
  const px = x0 + petW / 2, feet = H / 2 + 128 * PET_S - 8;
  const tx = x0 + petW + GAP_X + SW / 2 * base;

  const text = laid.map((l) => {
    const ink = l.tone === 'dim' ? c.dim : c.ink;
    const body = l.glyphs.flat().map((s) => (s.dot
      ? `<circle cx="${s.dot[0]}" cy="${s.dot[1]}" r="9" fill="${ink}"/>`
      : `<path d="${s.d}" stroke="${s.accent ? c.accent : ink}"/>`)).join('');
    return `<g transform="translate(${f(tx)} ${f(l.y + shiftY)}) scale(${f(l.s * 1000) / 1000}) translate(0 ${-LETTER_BOX.centre})" fill="none" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
  }).join('');
  const cursor = spec.cursor
    ? `<path transform="translate(${f(px + 100 * PET_S)} ${f(feet - 150 * PET_S)}) scale(2.1)" d="M2 2L2 30L9 23L14 34L19 32L14 21L24 21Z" fill="${c.cursor}" stroke="${c.ink}" stroke-width="2.2" stroke-linejoin="round"/>`
    : '';
  const style = `.ink{stroke:${c.ink}}.inkf{fill:${c.ink}}.eye{stroke:${c.accent}}.blush{fill:${c.blush}}`
    + `.c-head-main,.c-glasses-main{stroke:${c.ink}}.f-head-main{fill:${c.ink}}`
    + `.c-head-acc,.c-glasses-acc,.c-side-main,.c-side-acc,.c-neck-main,.c-neck-acc{stroke:${c.accent}}.f-head-acc,.f-side-main,.f-side-acc,.f-neck-main,.f-neck-acc{fill:${c.accent}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${spec.label}">
  <title>${spec.label}</title>
  <style>${style}</style>
  <rect width="${W}" height="${H}" fill="${c.bg}"/>
  <ellipse cx="${f(px)}" cy="${f(feet - 2)}" rx="${f(72 * PET_S)}" ry="${f(10 * PET_S)}" fill="${c.shadow}"/>
  <g transform="translate(${f(px)} ${f(feet)}) scale(${PET_S}) translate(-128 -256)">${pet}</g>
  ${cursor}
  ${text}
</svg>
`;
}

const [name, out] = process.argv.slice(2);
const spec = BANNERS[name];
if (!spec || !out) throw new Error(`usage: node promo/banner.mjs <${Object.keys(BANNERS).join('|')}> <out-dir>`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'banner.svg'), banner(spec, 'light'));
writeFileSync(join(out, 'banner-dark.svg'), banner(spec, 'dark'));
console.log(`${name} → ${join(out, 'banner.svg')}, banner-dark.svg`);

if (name === 'companion') {
  const { width, glyphs } = lettering('Coopanion', { accentAt: [1, 2] });
  const paths = glyphs.flat().map(s => s.dot
    ? `<circle cx="${s.dot[0]}" cy="${s.dot[1]}" r="9" fill="currentColor" stroke="none"/>`
    : `<path d="${s.d}"${s.accent ? ' class="accent"' : ''}/>`).join('');
  const code = `// Generated by node promo/banner.mjs companion assets; uses the banner's existing glyphs.
import { brandMark } from './ui/icons.ts';
export function coopanionWordmark(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-170 40 ${width + 186} 126');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '16');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('wordmark');
  svg.innerHTML = ${JSON.stringify(paths)};
  const mark = brandMark(doc);
  mark.setAttribute('x', '-170');
  mark.setAttribute('y', '40');
  mark.setAttribute('width', '126');
  mark.setAttribute('height', '126');
  svg.prepend(mark);
  return svg;
}
`;
  writeFileSync(fileURLToPath(new URL('../console/branding.ts', import.meta.url)), code);
}
