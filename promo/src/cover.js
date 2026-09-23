/**
 * The video cover: one still 1920×1080 composition in the promo's own parts. The pet fills the
 * bottom-left corner, cut by the frame and leaning back to look up-right; what it says fills the
 * space it looks into, and the product name runs along the bottom; rings centred on the pet open
 * toward the "Coo" at the start of that name. `cover.cjs` screenshots it at any size.
 */
import { figure, FACES, STAND, heartD, skinCss, normalizeSkin } from '../../packages/cortico-world-desktop-pet/web/pet-core.js';
import { h, svgEl, f1 } from './util.js';
import { Wordmark, lettering } from './wordmark.js';

const W = 1920, H = 1080;
const stage = document.getElementById('stage');
stage.dataset.theme = 'light';
const fill = () => { const d = h('div', 'layer fill'); stage.appendChild(d); return d; };
const rad = (a) => a * Math.PI / 180;

// the pet: feet below the frame, leaning back 16°, the C's open side facing the title
const PET = { x: 430, floor: 1150, S: 3.5, tilt: -16 };
const toStage = (lx, ly) => {
  const x = (lx - 128) * PET.S, y = (ly - 256) * PET.S, r = rad(PET.tilt);
  return { x: PET.x + x * Math.cos(r) - y * Math.sin(r), y: PET.floor + x * Math.sin(r) + y * Math.cos(r) };
};
const centre = toStage(128, 128);
// the product name along the bottom with a large initial C, and the middle of its "Coo"
const NAME = { x: 1272, y: 896, scale: 1.72, cap: { r: 62, cy: 114, width: 29 } };
const COO = (() => {
  const { width, at } = lettering('Coopanion', NAME);
  const mid = (at[0] + at[2] + 48) / 2; // left of the C to right of the second o
  return { x: NAME.x + (mid + 19 - (width + 38) / 2) * NAME.scale, y: NAME.y };
})();

fill().id = 'dots';
// rings around the pet, their gaps turned toward the "Coo"
const toward = Math.atan2(COO.y - centre.y, COO.x - centre.x) * 180 / Math.PI;
const PAPER = [244, 245, 244];
const tint = (c, k) => `rgb(${c.map((v, i) => Math.round(PAPER[i] + (v - PAPER[i]) * k)).join(' ')})`;
const RINGS = [
  { r: 470, w: 70, gap: 90, c: [0, 168, 112], k: .16 },
  { r: 610, w: 50, gap: 80, c: [181, 149, 100], k: .2 },
  { r: 760, w: 80, gap: 74, c: [52, 143, 134], k: .12 },
];
const ringSvg = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
ringSvg.innerHTML = RINGS.map(({ r, w, gap, c, k }) => {
  const a0 = rad(toward + gap / 2), a1 = rad(toward - gap / 2 + 360);
  const p = (a) => `${f1(centre.x + r * Math.cos(a))} ${f1(centre.y + r * Math.sin(a))}`;
  return `<path d="M${p(a0)}A${r} ${r} 0 1 1 ${p(a1)}" fill="none" stroke="${tint(c, k)}" stroke-width="${w}" stroke-linecap="round"/>`;
}).join('');
fill().appendChild(ringSvg);

const skin = normalizeSkin(null);
document.head.appendChild(h('style', null, skinCss(skin, '#stage')));
const petSvg = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
fill().appendChild(petSvg);
// hearts rising from the head toward the space left of the title, smaller and fainter as they go
const HEARTS = [[500, 300, 1.45, 1, 10], [592, 206, 1.1, .8, -4], [668, 126, .8, .6, -14]];
petSvg.innerHTML =
  `<g transform="translate(${PET.x} ${PET.floor}) rotate(${PET.tilt}) scale(${PET.S}) translate(-128 -256)">${figure({ ...FACES.happy.f(0), blush: .75 }, { look: [5, -4], legs: STAND, low: 0, t: 0, blink: 0, acc: skin })}</g>` +
  HEARTS.map(([x, y, s, o, r]) => `<path class="heart" opacity="${o}" transform="translate(${x} ${y}) rotate(${r}) scale(${s})" d="${heartD(0, 0, 1)}"/>`).join('');

// what the pet says sits on its line of sight, tilted with it, the tail back at its face; the product name runs along the bottom
const text = fill();
const bubble = h('div', 'bubble cover-hello', '<p class="b-text">嗨,我是 Coo!</p><p class="sub">你的小小万能桌面伴侣</p>');
text.appendChild(bubble);
new Wordmark(text, 'Coopanion', NAME).render(10, 0);
stage.appendChild(h('div', 'signature', 'by @Pal AI Lab 0 0)'));
document.head.appendChild(h('style', null, `
  .cover-hello{left:1200px; top:380px; max-width:none; white-space:nowrap; font-size:150px; font-weight:700; line-height:1.15; padding:48px 96px 58px; border-radius:110px; border-width:12px;
    box-shadow:0 30px 80px var(--shadow); transform:translate(-50%, -50%) rotate(-15deg); transform-origin:50% 50%}
  .cover-hello .b-text{min-height:0; letter-spacing:.01em}
  .cover-hello .sub{margin:16px 0 0 6px; font-size:68px; font-weight:700; color:#46464C}
  /* the tail leaves the lower left corner toward the pet's face */
  .cover-hello::after{left:-37px; bottom:120px; width:64px; height:64px; border-width:12px; border-bottom-right-radius:18px; transform:rotate(118deg)}
`));

// fit the 1920×1080 stage into whatever window size the screenshot uses
const fit = () => {
  const k = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `scale(${k})`;
};
addEventListener('resize', fit);
fit();
