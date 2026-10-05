/**
 * Dressing page: the body (Coo or the DeepSeek whale maid); for Coo the palette, four accessory slots and
 * their color channels, for the whale her colour schemes; with a live preview.
 * Every change is saved through `POST /api/skin` (the dark/light switch through `POST /api/prefs`);
 * the World persists it and pushes it to the pet window. Changes made elsewhere arrive over
 * `/socket?role=dress`.
 */
import {
  applyTheme, createPet, createSfx, mini, normalizeSkin, skinCss, wear,
  PALETTES, HEADS, SIDES, GLASSES, NECKS, ACC_COLORS, LINKED, NO_BODY, ROLES, FIGURES,
} from './pet-core.js';

import { bindAppearance } from './appearance.js';
bindAppearance(document, window);

const $ = (s) => document.querySelector(s);

const skinStyle = document.createElement('style');
document.head.appendChild(skinStyle);
const sfx = createSfx({ storageKey: 'cortico-pet.dress-sound.v1', volume: .35 });
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => sfx.unlock(), { capture: true }));

let skin = normalizeSkin(null);
let theme = document.documentElement.dataset.theme;
const modeBtn = $('#mode');
applyTheme(theme, modeBtn);
const preview = $('#preview');
const ctl = createPet(
  { petG: $('#pet'), shadowEl: $('#shadow'), fxG: $('#fx') },
  {
    sfx, roam: 'calm', startX: preview.clientWidth / 2,
    bounds: () => ({ W: preview.clientWidth, H: preview.clientHeight, floorY: preview.clientHeight - 30, S: .5 }),
  },
);
new ResizeObserver(() => ctl.resize()).observe(preview);
const local = (e) => { const r = preview.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
preview.addEventListener('pointerdown', (e) => { if (ctl.pointerDown(local(e))) preview.setPointerCapture(e.pointerId); });
preview.addEventListener('pointermove', (e) => { preview.style.cursor = ctl.pointerMove(local(e)); });
preview.addEventListener('pointerup', () => ctl.pointerUp());
preview.addEventListener('pointerleave', () => ctl.pointerLeave());

modeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme, modeBtn);
  sfx.tick();
  save('/api/prefs', { theme });
});

function save(path, body) {
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { $('#saved').textContent = r.ok ? '已保存' : '没保存上'; })
    .catch(() => { $('#saved').textContent = '没保存上:连不上桌宠服务'; });
}

// the whale's figure and scheme list load the first time she is shown
let whale = null, schemes = null, wanted = 'coo';
fetch('/web/whale/model.json').then((r) => r.json()).then((m) => { schemes = (m.schemes || []).filter((s) => s.ready !== false); render(); }).catch(() => {});
async function showFigure(s) {
  wanted = s.figure;
  if (s.figure !== 'whale') { ctl.setFigure(null); return; }
  whale ??= import('./whale/figure.js').then((m) => m.createWhaleFigure(undefined, { scheme: s.scheme }));
  const fig = await whale;
  if (wanted !== 'whale') return;
  await fig.setScheme(s.scheme, { fade: ctl.figure === fig ? .4 : 0, at: ctl.time });
  // mounting her takes a WebGL context, which a machine without usable GL (a blocklisted GPU and no
  // software fallback) refuses: preview the built-in Coo instead of leaving a body that throws every
  // frame it is drawn
  try { ctl.setFigure(fig); } catch (err) { console.error(err); ctl.setFigure(null); }
}

function apply(next, persist) {
  skin = next;
  ctl.setSkin(skin);
  skinStyle.textContent = skinCss(skin);
  showFigure(skin).catch((err) => console.error(err));
  render();
  if (persist) save('/api/skin', { skin });
}

const CROP = { palette: '18 18 220 220', head: '18 -72 220 220', side: '-52 -4 220 220', glasses: '28 7 220 220', neck: '32 84 220 220' };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function colorRow(slot, item) {
  const row = el('div', 'cmap');
  for (const ch of ROLES[item]) {
    const name = ch === 'main' ? '主色' : '点缀';
    const grp = el('div', 'cm-group');
    grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', name);
    grp.appendChild(el('span', 'cm-label', name));
    for (const src of [...LINKED.filter((l) => !(l.id === 'body' && NO_BODY[slot])), ...ACC_COLORS]) {
      const linked = src.id === 'body' || src.id === 'eye';
      const b = el('button', 'dot' + (linked ? ' linked ' + src.id : ''));
      if (!linked) b.style.cssText = `--dl:${src.l};--dd:${src.d}`;
      b.title = src.label;
      b.setAttribute('aria-label', `${name}:${src.label}`);
      b.setAttribute('aria-pressed', String(skin.colors[slot][ch] === src.id));
      b.addEventListener('click', () => {
        const next = { ...skin, colors: JSON.parse(JSON.stringify(skin.colors)) };
        next.colors[slot][ch] = src.id;
        apply(next, true); sfx.tick();
      });
      grp.appendChild(b);
    }
    row.appendChild(grp);
  }
  return row;
}

function renderFigure() {
  $('#dress').dataset.figure = skin.figure;
  const box = $('#optFigure');
  box.textContent = '';
  const opts = el('div', 'opts');
  for (const [id, label] of FIGURES) {
    const b = el('button', 'opt wide figure');
    b.setAttribute('aria-pressed', String(skin.figure === id));
    const pic = id === 'whale'
      ? `<img src="/web/whale/thumbs/${skin.scheme}.png" alt="" onerror="this.src='/web/whale/thumbs/deepseek.png'">`
      : `<svg viewBox="${CROP.palette}" aria-hidden="true">${mini('neutral', skin)}</svg>`;
    b.innerHTML = `${pic}<span>${label}</span>`;
    b.addEventListener('click', () => { if (skin.figure === id) return; apply({ ...skin, figure: id }, true); sfx.sparkle(); ctl.setExpr('happy'); });
    opts.appendChild(b);
  }
  box.appendChild(opts);
  const sch = $('#optScheme');
  sch.textContent = '';
  if (!schemes) return;
  const list = el('div', 'opts');
  for (const s of schemes) {
    const b = el('button', 'opt wide');
    b.setAttribute('aria-pressed', String(skin.scheme === s.id));
    b.innerHTML = `<img src="/web/whale/thumbs/${s.id}.png" alt=""><span>${s.brand}</span>`;
    b.addEventListener('click', () => { apply({ ...skin, scheme: s.id }, true); sfx.sparkle(); ctl.setExpr('happy'); ctl.pet.sqv += 1.2; });
    list.appendChild(b);
  }
  sch.appendChild(list);
}

function render() {
  renderFigure();
  const pal = $('#optPalette');
  pal.textContent = '';
  const palOpts = el('div', 'opts');
  for (const p of PALETTES) {
    const b = el('button', 'opt swatch');
    b.setAttribute('aria-pressed', String(skin.palette === p.id));
    b.innerHTML = `<svg viewBox="${CROP.palette}" aria-hidden="true" style="--sl-ink:${p.l[0]};--sl-eye:${p.l[1]};--sd-ink:${p.d[0]};--sd-eye:${p.d[1]}">${mini('neutral', { ...skin, head: 'none', side: 'none', glasses: 'none', neck: 'none' })}</svg><span>${p.label}</span>`;
    b.addEventListener('click', () => { apply({ ...skin, palette: p.id }, true); sfx.sparkle(); ctl.setExpr('happy'); });
    palOpts.appendChild(b);
  }
  pal.appendChild(palOpts);
  for (const [slot, list, sel] of [['head', HEADS, '#optHead'], ['side', SIDES, '#optSide'], ['glasses', GLASSES, '#optGlasses'], ['neck', NECKS, '#optNeck']]) {
    const box = $(sel);
    box.textContent = '';
    const opts = el('div', 'opts');
    for (const [id, label] of list) {
      const b = el('button', 'opt');
      b.setAttribute('aria-pressed', String(skin[slot] === id));
      b.innerHTML = `<svg viewBox="${CROP[slot]}" aria-hidden="true">${mini('neutral', { ...skin, [slot]: id })}</svg><span>${label}</span>`;
      b.addEventListener('click', () => {
        apply(wear(skin, slot, id), true);
        sfx.pop(); if (id !== 'none') { sfx.sparkle(); ctl.setExpr('happy'); }
        ctl.pet.sqv += 1.2;
      });
      opts.appendChild(b);
    }
    box.appendChild(opts);
    if (skin[slot] !== 'none') box.appendChild(colorRow(slot, skin[slot]));
  }
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/socket?role=dress`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if ((m.t === 'init' || m.t === 'prefs') && (m.theme === 'dark' || m.theme === 'light') && m.theme !== theme) { theme = m.theme; applyTheme(theme, modeBtn); }
    if ((m.t === 'init' || m.t === 'prefs') && m.skin && JSON.stringify(normalizeSkin(m.skin)) !== JSON.stringify(skin)) apply(normalizeSkin(m.skin), false);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();
apply(skin, false);

let last = performance.now();
/** The last error the frame loop logged, so one that keeps recurring is reported once, not per frame. */
let frameErr = null;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  try {
    ctl.step(dt); ctl.render();
  } catch (err) {
    // a throwing step must not take the loop with it: the next frame is only asked for below, and
    // without it the preview freezes for good (a broken figure throws again on every frame it draws)
    const msg = err?.message ?? String(err);
    if (msg !== frameErr) { frameErr = msg; console.error(err); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
