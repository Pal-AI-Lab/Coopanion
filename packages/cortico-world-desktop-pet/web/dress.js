/**
 * Dressing page: the body (a figure pack, src/packs.ts; Coo is one); for Coo the palette, four accessory slots
 * and their color channels, for another pack a row per dress-up axis of its manifest; with a live preview
 * of the body run as on the desktop (body-host.js).
 * Every change is saved through `POST /api/skin` (the dark/light switch through `POST /api/prefs`);
 * the World persists it and pushes it to the pet window. Changes made elsewhere arrive over
 * `/socket?role=dress`.
 */
import { applyTheme } from './ui.js';
import { createSfx } from './sound.js';
import {
  COO_CSS, mini, normalizeSkin, skinCss, wear,
  PALETTES, HEADS, SIDES, GLASSES, NECKS, ACC_COLORS, LINKED, NO_BODY, ROLES,
} from './coo/coo.js';
import { loadBody } from './body-host.js';

import { bindAppearance } from './appearance.js';
bindAppearance(document, window);

const $ = (s) => document.querySelector(s);

// Coo's drawing classes for the tiles; the page's own colours follow Coo's palette
const cooStyle = document.createElement('style'), skinStyle = document.createElement('style');
cooStyle.textContent = COO_CSS;
document.head.append(cooStyle, skinStyle);
const sfx = createSfx({ storageKey: 'cortico-pet.dress-sound.v1', volume: .35 });
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => sfx.unlock(), { capture: true }));

let skin = normalizeSkin(null);
let theme = document.documentElement.dataset.theme;
const modeBtn = $('#mode');
applyTheme(theme, modeBtn);
const preview = $('#preview');
const bounds = () => ({ W: preview.clientWidth, H: preview.clientHeight, floorY: preview.clientHeight - 30, S: .5 });
/** The body in the preview (body-host.js), and the page's clock. */
let body = null, T = 0;
new ResizeObserver(() => body?.set({ bounds: bounds() })).observe(preview);
const local = (e) => { const r = preview.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
preview.addEventListener('pointerdown', (e) => { const p = local(e); body?.pointer('down', p); if (body?.hit(p)) preview.setPointerCapture(e.pointerId); });
preview.addEventListener('pointermove', (e) => body?.pointer('move', local(e)));
preview.addEventListener('pointerup', (e) => body?.pointer('up', local(e)));
preview.addEventListener('pointerleave', () => body?.pointer('leave', {}));

modeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme, modeBtn);
  body?.set({ theme });
  sfx.tick();
  save('/api/prefs', { theme });
});

function save(path, body) {
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { $('#saved').textContent = r.ok ? '已保存' : '没保存上'; })
    .catch(() => { $('#saved').textContent = '没保存上:连不上桌宠服务'; });
}

// the installed figure packs, asked for again whenever the page hears of a look
let packs = [];
const loadPacks = () => fetch('/api/figures').then((r) => r.json()).then((list) => { packs = list; render(); }).catch(() => {});
loadPacks();
let wanted = null, loading = null;
// a pack that will not load or breaks previews as Coo, as on the desktop
function previewFailed(id, err) {
  console.error(err);
  if (id !== 'coo' && wanted === id) void showFigure({ ...skin, figure: 'coo' });
}
async function showFigure(s) {
  wanted = s.figure;
  if (loading === s.figure) return;
  try {
    if (body?.pack === s.figure) {
      body.set({ skin: s });
      if (s.figure !== 'coo') await body.setScheme(s.scheme, { fade: .4 });
      return;
    }
    loading = s.figure;
    const pack = packs.find((p) => p.id === s.figure) ?? (await (await fetch('/api/figures')).json()).find((p) => p.id === s.figure);
    if (!pack) throw new Error('没有装这个形象');
    const was = body?.layout;
    const holder = {};
    const next = await loadBody({
      layer: $('#figureLayer'), pack, theme, bounds: bounds(),
      start: { x: was?.x ?? preview.clientWidth / 2, facing: was?.facing, skin: s, scheme: s.scheme },
      onEvent: () => {},
      onSound: (name, kind, ...args) => { if (body === holder.body) sfx.play(name, kind, ...args); },
      onError: (err) => { if (body === holder.body) previewFailed(pack.id, err); },
    });
    if (wanted !== s.figure) { next.dispose(); return; }
    holder.body = next;
    next.set({ roam: 'calm' });
    body?.dispose();
    body = next;
    sfx.usePack(pack.base, pack.sounds);
  } catch (err) {
    previewFailed(s.figure, err);
  } finally {
    if (loading === s.figure) loading = null;
  }
  // a pick that came while the body was loading
  if (body?.pack === skin.figure && skin !== s) await showFigure(skin);
}

function apply(next, persist) {
  skin = next;
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

const nameOf = (n) => (n && (n.zh ?? Object.values(n)[0])) || '';
/** The option of each axis that `scheme` picks: a preset id, or the options joined by `-` in axis order. */
function picksOf(pack, scheme) {
  const preset = pack.presets.find((p) => p.id === scheme);
  const parts = (scheme || '').split('-');
  return Object.fromEntries(pack.axes.map((a, i) => {
    const want = preset ? preset.pick[a.id] : parts[i];
    return [a.id, a.options.some((o) => o.id === want) ? want : a.options[0].id];
  }));
}
/** `skin.scheme` for a set of picks: the preset that picks exactly them, else the options joined. */
function schemeOf(pack, picks) {
  const preset = pack.presets.find((p) => pack.axes.every((a) => p.pick[a.id] === picks[a.id]));
  return preset ? preset.id : pack.axes.map((a) => picks[a.id]).join('-');
}
const thumbOf = (pack, picks) => {
  const preset = pack.presets.find((p) => p.id === schemeOf(pack, picks));
  const opt = pack.axes[0]?.options.find((o) => o.id === picks[pack.axes[0].id]);
  const file = preset?.thumb ?? opt?.thumb ?? pack.thumb;
  return file ? pack.base + file : null;
};

function renderFigure() {
  $('#dress').dataset.figure = skin.figure === 'coo' ? 'coo' : 'pack';
  const box = $('#optFigure');
  box.textContent = '';
  const opts = el('div', 'opts');
  const choices = [{ id: 'coo', label: 'Coo', pic: `<svg viewBox="${CROP.palette}" aria-hidden="true">${mini('neutral', skin)}</svg>` },
    ...packs.filter((p) => p.id !== 'coo').map((p) => {
      const src = thumbOf(p, picksOf(p, skin.figure === p.id ? skin.scheme : ''));
      return { id: p.id, label: nameOf(p.name), pic: src ? `<img src="${src}" alt="">` : '' };
    })];
  for (const c of choices) {
    const b = el('button', 'opt wide figure');
    b.setAttribute('aria-pressed', String(skin.figure === c.id));
    b.innerHTML = `${c.pic}<span></span>`;
    b.querySelector('span').textContent = c.label;
    b.addEventListener('click', () => {
      if (skin.figure === c.id) return;
      const pack = packs.find((p) => p.id === c.id);
      apply({ ...skin, figure: c.id, ...(pack && c.id !== 'coo' ? { scheme: schemeOf(pack, picksOf(pack, '')) } : {}) }, true);
      sfx.sparkle(); body?.cue('cheer');
    });
    opts.appendChild(b);
  }
  box.appendChild(opts);
  // a row per axis of the pack on, after the figure row; Coo's own rows are below
  for (const old of document.querySelectorAll('.pack-axis')) old.remove();
  const pack = skin.figure === 'coo' ? null : packs.find((p) => p.id === skin.figure);
  if (!pack) return;
  const picks = picksOf(pack, skin.scheme);
  let after = box;
  for (const axis of pack.axes) {
    const label = el('div', 'row-label pack-axis');
    label.id = `lbAxis-${axis.id}`;
    label.textContent = nameOf(axis.name);
    const slot = el('div', 'slot pack-axis');
    slot.setAttribute('role', 'group');
    slot.setAttribute('aria-labelledby', label.id);
    const list = el('div', 'opts');
    for (const o of axis.options) {
      const b = el('button', 'opt wide');
      b.setAttribute('aria-pressed', String(picks[axis.id] === o.id));
      b.innerHTML = `${o.thumb ? `<img src="${pack.base}${o.thumb}" alt="">` : ''}<span></span>`;
      b.querySelector('span').textContent = nameOf(o.name);
      b.addEventListener('click', () => {
        apply({ ...skin, scheme: schemeOf(pack, { ...picks, [axis.id]: o.id }) }, true);
        sfx.sparkle(); body?.cue('cheer'); body?.cue('bounce');
      });
      list.appendChild(b);
    }
    slot.appendChild(list);
    after.after(label, slot);
    after = slot;
  }
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
    b.addEventListener('click', () => { apply({ ...skin, palette: p.id }, true); sfx.sparkle(); body?.cue('cheer'); });
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
        sfx.pop(); if (id !== 'none') { sfx.sparkle(); body?.cue('cheer'); }
        body?.cue('bounce');
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
    if ((m.t === 'init' || m.t === 'prefs') && (m.theme === 'dark' || m.theme === 'light') && m.theme !== theme) { theme = m.theme; applyTheme(theme, modeBtn); body?.set({ theme }); }
    if (m.t === 'init') loadPacks();
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
    T += dt;
    body?.tick(dt);
    preview.style.cursor = body?.layout?.cursor ?? '';
  } catch (err) {
    // a throwing step must not take the loop with it: the next frame is only asked for below, and
    // without it the preview freezes for good (a broken figure throws again on every frame it draws)
    const msg = err?.message ?? String(err);
    if (msg !== frameErr) { frameErr = msg; console.error(err); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
