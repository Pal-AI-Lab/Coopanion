/**
 * The video cover: one still 1920×1080 composition in the promo's own parts. The pet fills the
 * bottom-left corner, cut by the frame and leaning back to look up-right; what it says fills the
 * space it looks into, rings centred on the pet open toward that bubble, and the product name
 * runs along the bottom. `cover.cjs` screenshots it at any size.
 */
import { figure, FACES, STAND, heartD, skinCss, normalizeSkin } from '../../packages/cortico-world-desktop-pet/web/pet-core.js';
import { h, svgEl, f1 } from './util.js';
import { Wordmark } from './wordmark.js';

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
// the greeting fills the top right; its centre is where the rings open and the hearts head
const SAY = { x: 1270, y: 300 };

fill().id = 'dots';
// rings around the pet, their gaps turned toward the greeting
const toward = Math.atan2(SAY.y - centre.y, SAY.x - centre.x) * 180 / Math.PI;
const PAPER = [244, 245, 244];
const tint = (c, k) => `rgb(${c.map((v, i) => Math.round(PAPER[i] + (v - PAPER[i]) * k)).join(' ')})`;
const RINGS = [
  { r: 470, w: 70, gap: 70, c: [0, 168, 112], k: .16 },
  { r: 610, w: 50, gap: 56, c: [181, 149, 100], k: .2 },
  { r: 760, w: 80, gap: 46, c: [52, 143, 134], k: .12 },
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

// what the pet says takes the top right, its tail at the pet's face; the product name runs along the bottom
const text = fill();
const bubble = h('div', 'bubble cover-hello', '<p class="b-text">嗨,我是 Coo!</p><p class="sub">你的小小万能桌面伴侣</p>');
text.appendChild(bubble);
new Wordmark(text, 'Coopanion', { x: 1265, y: 880, scale: 1.75 }).render(10, 0);
stage.appendChild(h('div', 'signature', 'by @Pal AI Lab 0 0)'));
document.head.appendChild(h('style', null, `
  .cover-hello{left:640px; top:236px; max-width:none; white-space:nowrap; font-size:150px; font-weight:700; line-height:1.15; padding:48px 96px 58px; border-radius:110px; border-width:12px;
    box-shadow:0 30px 80px var(--shadow); transform:rotate(-6deg); transform-origin:0 100%}
  .cover-hello .b-text{min-height:0; letter-spacing:.01em}
  .cover-hello .sub{margin:16px 0 0 6px; font-size:66px; font-weight:400; color:var(--ink-soft)}
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
