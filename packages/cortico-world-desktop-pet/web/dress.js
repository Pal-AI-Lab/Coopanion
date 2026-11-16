/**
 * Dressing page: the body (a figure pack, src/packs.ts; Coo is one); for Coo the palette, four accessory slots
 * and their color channels, for another pack a row per dress-up axis of its manifest; with a live preview
 * of the body run as on the desktop (body-host.js).
 * Every change is saved through `POST /api/skin` (the dark/light switch through `POST /api/prefs`);
 * the World persists it and pushes it to the pet window. Changes made elsewhere arrive over
 * `/socket?role=dress`.
 *
 * Packs are imported here too (src/pack-import.ts): a zip as it is, or the folders a picked or dropped folder
 * holds a pack in (a folder with figure.json, up to `depth` levels down, not looking inside a pack), framed
 * as the server reads them (`bundle`). The server says what it found; the person picks what to install.
 * A pack the server lists as `removable` is uninstalled from its tile (`POST /api/figures/remove`).
 *
 * The size row under the figures sets the size on screen (`POST /api/prefs` `scale`) while its slider moves; the World
 * keeps a size per figure, so picking another figure puts it on at its own. The preview keeps its one size.
 *
 * The round buttons on the preview save the look worn, with the size on screen, as a new one (looks.js), and, once the
 * look picked from the saved ones has changed, save the changes to it; the favourites are listed first in one row, to put
 * on with a click (at their size, when they have one), rename, remove or drag to another place.
 *
 * Text follows the app language (i18n.js): the page's own from its tables, the names of figures, Coo's
 * palettes and accessories, and other packs' picks from the packs' manifests.
 */
import { ICONS, themeButton } from './ui.js';
import { applyText, language, nameIn, t, useLanguage } from './i18n.js';
import { createSfx } from './sound.js';
import {
  COO_CSS, mini, normalizeSkin, skinCss, wear,
  PALETTES, HEADS, SIDES, GLASSES, NECKS, ACC_COLORS, LINKED, NO_BODY, ROLES,
} from './coo/coo.js';
import { loadBody } from './body-host.js';
import { fetchLooks, lookAvailable, lookPicture, sameLook, writeLooks } from './looks.js';
import { dragRow } from './drag-row.js';
import { SIZE, scaleSlider, sizeEcho } from './scale-slider.js';
import { restyle, swapIn, swapOut } from './swap-motion.js';
import { announcePainted, dressFloor, glowColor, lightWall, modeButton, setGlow } from './stage.js';

import { bindAppearance, hostDressDialogs } from './appearance.js';
import { localDressDialogs } from './dist/dress-dialog.js';
import { mountHints } from './hints.js';
bindAppearance(document, window);
/** The settings window's dialog when the page is embedded in it; null when the page draws its own. */
const dialogStop = new AbortController();
window.addEventListener('pagehide', () => dialogStop.abort(), { once: true });
const dialogs = hostDressDialogs(document, window) ?? localDressDialogs(document, dialogStop.signal);
mountHints(document);

const $ = (s) => document.querySelector(s);

// Coo's drawing classes for the tiles; the page's own colours follow Coo's palette
const cooStyle = document.createElement('style'), skinStyle = document.createElement('style');
cooStyle.textContent = COO_CSS;
document.head.append(cooStyle, skinStyle);
const sfx = createSfx({ storageKey: 'cortico-pet.dress-sound.v1', volume: .35 });
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => sfx.unlock(), { capture: true }));

let skin = normalizeSkin(null);
const root = document.documentElement;
/** The pet's night/day setting. */
let theme = root.dataset.theme;
const preview = $('#preview');
/**
 * The pet's night/day shows on the preview only (dress.css themes `#preview` by its own data-theme); the rest of
 * the page follows the settings window when embedded (appearance.js sets data-ui-theme), else the pet's setting.
 */
const showTheme = () => { preview.dataset.theme = theme; root.dataset.theme = root.dataset.uiTheme ?? theme; };
new MutationObserver(showTheme).observe(root, { attributes: true, attributeFilter: ['data-ui-theme'] });
// the stage as on the 开始 page's preview (stage.js): a wall that answers the pointer, a floor with icons, the night/day button
const modeBtn = modeButton(preview, () => theme, (next) => { theme = next; showTheme(); body?.set({ theme }); renderLooks(); sfx.tick(); }, (next) => save('/api/prefs', { theme: next }), themeButton);
lightWall(preview);
dressFloor($('#floor'));
/** The page's own text in the app language; the theme button's title is part of it. */
const showText = () => { applyText(); document.title = t('dress.title'); modeBtn.show(theme); showScale(); };
const ready = useLanguage().then(showText);
showTheme();
/** The floor is the stage's bottom 48 pixels, as in a tab (pet.css .floor). */
const FLOOR = 48;
const bounds = () => ({ W: preview.clientWidth, H: preview.clientHeight, floorY: preview.clientHeight - FLOOR, S: .5 });
/** The body in the preview (body-host.js). */
let body = null;
new ResizeObserver(() => body?.set({ bounds: bounds() })).observe(preview);
const local = (e) => { const r = preview.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
preview.addEventListener('pointerdown', (e) => { const p = local(e); body?.pointer('down', p); if (body?.hit(p)) preview.setPointerCapture(e.pointerId); });
preview.addEventListener('pointermove', (e) => body?.pointer('move', local(e)));
preview.addEventListener('pointerup', (e) => body?.pointer('up', local(e)));
preview.addEventListener('pointerleave', () => body?.pointer('leave', {}));

function save(path, body) {
  return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { $('#saved').textContent = r.ok ? '' : t('dress.notSaved'); })
    .catch(() => { $('#saved').textContent = t('dress.offline'); });
}

// the installed figure packs, asked for again whenever the page hears of a look, and the ones that did not load
let packs = [];
let packStatus = { importable: false, large: Infinity, depth: 3, problems: [] };
const loadPacks = () => Promise.all([fetch('/api/figures').then((r) => r.json()), fetch('/api/figures/status').then((r) => r.json())])
  .then(([list, status]) => { packs = list; packStatus = status; lightFor(skin); render(); }).catch(() => {});
/** The preview's light in the picked body's colors (stage.js glowColor), the settings window's theme color when its pack names none. */
const lightFor = (s) => setGlow(preview, glowColor(packs.find((p) => p.id === s.figure), s));
loadPacks();
let wanted = null, loading = null;
/** The look last put on the preview's body, so only a change is animated. */
let shownLook = null;
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
      // another look of the figure shown: a dip, as on the desktop
      const look = JSON.stringify(s);
      if (shownLook && look !== shownLook) restyle(body, preview);
      shownLook = look;
      if (s.figure !== 'coo') await body.setScheme(s.scheme, { fade: .4 });
      return;
    }
    loading = s.figure;
    const pack = packs.find((p) => p.id === s.figure) ?? (await (await fetch('/api/figures')).json()).find((p) => p.id === s.figure);
    if (!pack) throw new Error(t('figure.notInstalled'));
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
    // the theme may have arrived while the body was loading
    next.set({ roam: 'calm', theme });
    const old = body;
    body = next;
    shownLook = JSON.stringify(s);
    if (old) {
      swapOut(old, preview);
      swapIn(next, preview, next.layout ?? was);
    }
    sfx.usePack(pack.base, pack.sounds);
  } catch (err) {
    previewFailed(s.figure, err);
  } finally {
    if (loading === s.figure) loading = null;
  }
  // a pick that came while the body was loading
  if (body?.pack === skin.figure && skin !== s) await showFigure(skin);
}

/** Shows `next`; `persist` saves it, a number saves it at that size on screen. */
function apply(next, persist) {
  skin = next;
  // the page's tiles follow the page's light/dark, the preview the pet's
  skinStyle.textContent = skinCss(skin) + skinCss(skin, '#preview');
  lightFor(skin);
  showFigure(skin).catch((err) => console.error(err));
  render();
  if (persist) return save('/api/skin', typeof persist === 'number' ? { skin, scale: persist } : { skin });
}

const CROP = { palette: '18 18 220 220', head: '18 -72 220 220', side: '-52 -4 220 220', glasses: '28 7 220 220', neck: '32 84 220 220' };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function colorRow(slot, item) {
  const row = el('div', 'cmap');
  for (const ch of ROLES[item]) {
    const name = t(ch === 'main' ? 'dress.main' : 'dress.accent');
    const grp = el('div', 'cm-group');
    grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', name);
    grp.appendChild(el('span', 'cm-label', name));
    for (const src of [...LINKED.filter((l) => !(l.id === 'body' && NO_BODY[slot])), ...ACC_COLORS]) {
      const linked = src.id === 'body' || src.id === 'eye';
      const b = el('button', 'dot' + (linked ? ' linked ' + src.id : ''));
      if (!linked) b.style.cssText = `--dl:${src.l};--dd:${src.d}`;
      b.title = t(`color.${src.id}`);
      b.setAttribute('aria-label', t('dress.colorOf', { channel: name, color: b.title }));
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

const nameOf = nameIn;
/** The name Coo's manifest gives an option of `axis` (palette or an accessory slot), its id until the packs have loaded. */
const cooName = (axis, id) => nameIn(packs.find((p) => p.id === 'coo')?.axes.find((a) => a.id === axis)?.options.find((o) => o.id === id)?.name) || id;
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

function renderFigure() {
  $('#dress').dataset.figure = skin.figure === 'coo' ? 'coo' : 'pack';
  const box = $('#optFigure');
  box.textContent = '';
  const opts = el('div', 'opts');
  const choices = [{ id: 'coo', label: 'Coo', svg: `<svg viewBox="${CROP.palette}" aria-hidden="true">${mini('neutral', skin)}</svg>` },
    // a pack shows its own picture whatever it wears; the rows below show the picks
    ...packs.filter((p) => p.id !== 'coo').map((p) => ({ id: p.id, label: nameOf(p.name), thumb: p.thumb ? p.base + p.thumb : null, pack: p }))];
  for (const c of choices) {
    const b = el('button', 'opt wide figure', c.svg);
    b.setAttribute('aria-pressed', String(skin.figure === c.id));
    b.title = c.label;
    if (c.thumb) Object.assign(b.appendChild(el('img')), { src: c.thumb, alt: '' });
    b.appendChild(el('span')).textContent = c.label;
    b.addEventListener('click', () => {
      if (skin.figure === c.id) return;
      const pack = packs.find((p) => p.id === c.id);
      apply({ ...skin, figure: c.id, ...(pack && c.id !== 'coo' ? { scheme: schemeOf(pack, picksOf(pack, '')) } : {}) }, true);
      sfx.sparkle(); body?.cue('cheer');
    });
    if (c.pack?.removable) {
      const tile = opts.appendChild(el('span', 'figure-tile'));
      tile.append(b, removeButton(c.pack));
    } else opts.appendChild(b);
  }
  if (packStatus.importable) {
    const b = el('button', 'opt wide figure import', '<svg viewBox="0 0 52 52" aria-hidden="true"><path d="M26 15v22M15 26h22"/></svg><span></span>');
    b.querySelector('span').textContent = t('import.button');
    b.title = t('import.title');
    b.addEventListener('click', () => { sfx.tick(); importDialog.choose(); });
    opts.appendChild(b);
  }
  box.appendChild(opts);
  if (packStatus.problems.length) {
    const d = el('details', 'pack-problems');
    d.appendChild(el('summary')).textContent = t('import.unloaded', { n: packStatus.problems.length });
    const ul = d.appendChild(el('ul'));
    for (const p of packStatus.problems) {
      const li = ul.appendChild(el('li'));
      li.appendChild(el('b')).textContent = p.dir;
      li.append(t('import.reason', { reason: p.reason }));
    }
    box.appendChild(d);
  }
  // a row per axis of the pack on, after the figure row; Coo's own rows are below
  for (const old of document.querySelectorAll('.pack-axis')) old.remove();
  const pack = skin.figure === 'coo' ? null : packs.find((p) => p.id === skin.figure);
  if (!pack) return;
  const picks = picksOf(pack, skin.scheme);
  let after = $('#optSize');
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
      if (o.thumb) Object.assign(b.appendChild(el('img')), { src: pack.base + o.thumb, alt: '' });
      b.appendChild(el('span')).textContent = nameOf(o.name);
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

/* ---------- uninstalling packs ---------- */

/** The trash button in an installed pack's tile corner, shown while the tile is hovered or focused; it asks in the dialog. */
function removeButton(pack) {
  const b = el('button', 'pack-erase', ICONS.trash);
  b.type = 'button';
  b.title = t('remove.label', { name: nameOf(pack.name) });
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', () => { sfx.tick(); importDialog.remove(pack); });
  return b;
}

/* ---------- size on screen ---------- */

/** Milliseconds between the sizes sent while the slider moves, so the pet on the desktop follows it. */
const SCALE_SEND_MS = 120;
/** The size on screen, as the World last said or this page last set it. */
let scale = 1;
const scaleText = el('span', 'size-value');
const scaleBox = $('#optSize');
const scaleRow = scaleBox.appendChild(el('div', 'size-row'));
const sizer = scaleSlider(document, {
  ...SIZE, label: '',
  room: () => scaleRow.clientWidth - scaleText.offsetWidth - 14,
  onInput: (v) => { scale = v; showScale(); scaleTimer ??= setTimeout(sendScale, SCALE_SEND_MS); },
  // the favourites' changed marks follow the size once the drag ends, not on every send
  onChange: () => { clearTimeout(scaleTimer); sendScale(); renderLooks(); },
});
scaleRow.append(sizer.el, scaleText);
new ResizeObserver(() => sizer.relayout()).observe(scaleRow);
let scaleTimer = null;
/** Sizes the World pushes, held while the slider is in use or this page's newer size is on its way (scale-slider.js sizeEcho). */
const scaleHeard = sizeEcho((v) => { if (v === scale) return; scale = v; sizer.set(v); showScale(); renderLooks(); });
function showScale() { scaleText.textContent = `${Math.round(scale * 100)}%`; sizer.el.setAttribute('aria-label', t('dress.size')); }
function sendScale() {
  scaleTimer = null;
  scaleHeard.sent(scale);
  void save('/api/prefs', { scale });
}
showScale();

/* ---------- saved looks ---------- */

let looks = [];
/** Whether a read of the saved looks has succeeded: `POST /api/looks` replaces the whole list, so nothing is written before. */
let looksRead = false;
/** The saved look picked last, whose changes the update button saves; null when none is picked. */
let activeLook = null;
const loadLooks = () => fetchLooks().then((list) => {
  if (list) {
    looks = list;
    looksRead = true;
    if (!looks.some((l) => l.id === activeLook)) activeLook = looks.find(isWorn)?.id ?? null;
  }
  renderLooks();
});
/** Whether `look` is what the pet wears now: its skin, at its size when it keeps one. */
const isWorn = (look) => sameLook(look.skin, skin) && (look.scale ?? scale) === scale;
const lookId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** A new look's name: the pack and its preset, or Coo and its palette. */
function lookName(s) {
  const pack = s.figure && s.figure !== 'coo' ? packs.find((p) => p.id === s.figure) : null;
  if (!pack) return `Coo · ${cooName('palette', s.palette)}`;
  const preset = pack.presets.find((p) => p.id === s.scheme);
  return preset ? `${nameOf(pack.name)} · ${nameOf(preset.name)}` : nameOf(pack.name);
}

const saveLookBtn = $('#saveLook'), updateLookBtn = $('#updateLook');
saveLookBtn.innerHTML = ICONS.addLook;
updateLookBtn.innerHTML = ICONS.saveLook;
const bump = (btn) => { btn.classList.remove('done'); void btn.offsetWidth; btn.classList.add('done'); };
saveLookBtn.addEventListener('click', async () => {
  sfx.tick();
  if (!looksRead) await loadLooks();
  if (!looksRead) { $('#saved').textContent = t('dress.notSaved'); return; }
  const had = looks.find((l) => sameLook(l.skin, skin) && l.scale === scale);
  if (had) { $('#saved').textContent = t('looks.exists', { name: had.name }); return; }
  const id = lookId();
  const next = await writeLooks([...looks, { id, name: lookName(skin), skin, scale }]);
  if (!next) { $('#saved').textContent = t('dress.notSaved'); return; }
  $('#saved').textContent = '';
  looks = next;
  activeLook = id;
  renderLooks();
  sfx.sparkle(); body?.cue('cheer');
  bump(saveLookBtn);
});
updateLookBtn.addEventListener('click', async () => {
  sfx.tick();
  const next = await writeLooks(looks.map((l) => (l.id === activeLook ? { ...l, skin, scale } : l)));
  if (!next) { $('#saved').textContent = t('dress.notSaved'); return; }
  $('#saved').textContent = '';
  looks = next;
  renderLooks();
  sfx.sparkle(); body?.cue('cheer');
});

function renderLooks() {
  const box = $('#optLooks');
  const active = looks.find((l) => l.id === activeLook);
  const changed = !!active && !isWorn(active);
  saveLookBtn.title = t('looks.save');
  saveLookBtn.setAttribute('aria-label', saveLookBtn.title);
  updateLookBtn.hidden = !changed;
  if (changed) { updateLookBtn.title = t('looks.update', { name: active.name }); updateLookBtn.setAttribute('aria-label', updateLookBtn.title); }
  box.textContent = '';
  if (!looks.length) { box.appendChild(el('p', 'looks-empty')).textContent = t('looks.empty'); return; }
  const opts = el('div', 'looks-strip');
  for (const look of looks) {
    const tile = el('span', 'look-tile');
    tile.dataset.id = look.id;
    const b = el('button', 'opt wide look', lookPicture(look.skin, packs, theme === 'dark', look.scale));
    if (typeof look.scale === 'number') b.appendChild(el('b', 'look-size')).append(`${Math.round(look.scale * 100)}%`);
    b.type = 'button';
    const gone = packs.length > 0 && !lookAvailable(look.skin, packs);
    b.disabled = gone;
    b.classList.toggle('gone', gone);
    b.setAttribute('aria-pressed', String(look.id === activeLook));
    b.classList.toggle('changed', changed && look.id === activeLook);
    b.appendChild(el('span')).textContent = b.title = look.name;
    // picking a look again lets it go: the save button then saves a new one
    b.addEventListener('click', () => {
      if (look.id === activeLook) { activeLook = null; renderLooks(); sfx.tick(); return; }
      activeLook = look.id;
      if (isWorn(look)) { renderLooks(); sfx.tick(); return; }
      if (typeof look.scale === 'number') { scale = look.scale; sizer.set(scale); showScale(); scaleHeard.sent(scale); }
      apply(normalizeSkin(look.skin), typeof look.scale === 'number' ? look.scale : true);
      sfx.sparkle(); body?.cue('cheer');
    });
    const acts = el('span', 'look-acts');
    const act = (icon, label, cls, fn) => {
      const a = acts.appendChild(el('button', cls, icon));
      a.type = 'button'; a.title = label; a.setAttribute('aria-label', label);
      a.addEventListener('click', (e) => { e.stopPropagation(); sfx.tick(); fn(); });
    };
    act(ICONS.pencil, t('looks.rename'), 'look-act', () => renameLook(tile, look));
    act(ICONS.trash, t('looks.delete', { name: look.name }), 'look-act danger', () => importDialog.forget(look, async () => {
      const next = await writeLooks(looks.filter((l) => l.id !== look.id));
      if (next) { looks = next; if (activeLook === look.id) activeLook = null; renderLooks(); } else $('#saved').textContent = t('dress.notSaved');
    }));
    tile.append(b, acts);
    opts.appendChild(tile);
  }
  box.appendChild(gallery(opts));
}

// a favourite is dragged to another place in the row; the row scrolls when it is held near an end
dragRow($('#optLooks'), {
  item: (target) => (target.closest('.look-act, .look-name') ? null : target.closest('.looks-strip > .look-tile')),
  key: (tile) => tile.dataset.id,
  copyClass: 'look-drag-copy',
  drop: async (order) => {
    const byId = new Map(looks.map((l) => [l.id, l]));
    const next = await writeLooks(order.map((id) => byId.get(id)).filter(Boolean));
    if (next) looks = next;
    else { $('#saved').textContent = t('dress.notSaved'); renderLooks(); }
  },
});

/** A row with an arrow at each end, shown once it holds more than fit; each moves it by what shows. */
function gallery(strip) {
  const row = el('div', 'looks-gallery');
  const arrow = (dir) => {
    const b = el('button', 'g-arrow', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir < 0 ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'}"/></svg>`);
    b.type = 'button';
    b.setAttribute('aria-label', t(dir < 0 ? 'looks.prev' : 'looks.next'));
    b.addEventListener('click', () => { sfx.tick(); strip.scrollBy({ left: dir * strip.clientWidth * .8 }); });
    return b;
  };
  const prev = arrow(-1), next = arrow(1);
  const sync = () => {
    const more = strip.scrollWidth > strip.clientWidth + 1;
    prev.hidden = next.hidden = !more;
    prev.disabled = strip.scrollLeft <= 1;
    next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  };
  strip.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(strip);
  row.append(prev, strip, next);
  // the look worn comes into view
  requestAnimationFrame(() => {
    const on = strip.querySelector('[aria-pressed="true"]')?.parentElement;
    if (on && on.offsetLeft + on.offsetWidth > strip.clientWidth) { strip.style.scrollBehavior = 'auto'; strip.scrollLeft = on.offsetLeft; strip.style.scrollBehavior = ''; }
    sync();
  });
  return row;
}

/** A field over the name; Enter or leaving it keeps the new name, Escape keeps the old one. */
function renameLook(tile, look) {
  const input = el('input', 'look-name');
  input.value = look.name;
  input.maxLength = 40;
  input.setAttribute('aria-label', t('looks.rename'));
  tile.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (keep) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (keep && name && name !== look.name) {
      const next = await writeLooks(looks.map((l) => (l.id === look.id ? { ...l, name } : l)));
      if (next) looks = next; else $('#saved').textContent = t('dress.notSaved');
    }
    renderLooks();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void finish(true);
    else if (e.key === 'Escape') void finish(false);
  });
  input.addEventListener('blur', () => void finish(true));
}

/* ---------- importing packs ---------- */

const MB = (n) => `${Math.round(n / 1048576)} MB`;

/** The page's framing of files for `POST /api/figures/import` (src/pack-import.ts `filesFromBundle`). */
function bundle(files) {
  const enc = new TextEncoder();
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  return new Blob(files.flatMap(({ path, file }) => { const name = enc.encode(path); return [u32(name.length), name, u32(file.size), file]; }));
}

/**
 * The files of the packs among `files` ({ path, file }, each path starting with the folder picked): the folders
 * with a figure.json at most `depth` levels below the picked one, and not inside another of them.
 */
function packFiles(files, depth) {
  const dirs = files.map((f) => f.path.split('/')).filter((p) => p[p.length - 1] === 'figure.json' && p.length - 2 <= depth)
    .map((p) => p.slice(0, -1).join('/')).sort((a, b) => a.length - b.length);
  const roots = dirs.filter((d, i) => !dirs.slice(0, i).some((r) => d.startsWith(r + '/')));
  return files.filter((f) => roots.some((r) => f.path.startsWith(r + '/')));
}

/** The files under a dropped folder (a FileSystemDirectoryEntry), as `packFiles` takes them: only what could be in a pack is read. */
async function droppedFiles(entry, path, depth) {
  const list = [];
  const reader = entry.createReader();
  for (let batch; (batch = await new Promise((ok, bad) => reader.readEntries(ok, bad))).length;) list.push(...batch);
  const inPack = depth === Infinity || list.some((e) => e.isFile && e.name === 'figure.json');
  const out = [];
  for (const e of list) {
    if (e.isFile && inPack) out.push({ path: `${path}/${e.name}`, file: await new Promise((ok, bad) => e.file(ok, bad)) });
    // inside a pack every folder is read; above one, only as deep as a pack is looked for
    else if (e.isDirectory && (inPack || depth > 0)) out.push(...await droppedFiles(e, `${path}/${e.name}`, inPack ? Infinity : depth - 1));
  }
  return out;
}

const importDialog = (() => {
  let token = '', revision = 0, working = false;
  const cancel = { key: 'cancel', label: t('import.cancel') };
  const show = (view, answer = () => close()) => {
    const current = ++revision;
    dialogs.show(view, result => { if (current === revision && !dialogStop.signal.aborted) answer(result); });
  };
  const close = () => {
    revision++; dialogs.close();
    if (token) void fetch('/api/figures/import/cancel', { method: 'POST', keepalive: true }).catch(() => {});
    token = '';
  };
  dialogStop.signal.addEventListener('abort', close, { once: true });
  const note = (title, text) => show({ title, body: text, actions: [{ key: 'cancel', label: t('import.ok'), kind: 'primary' }] });
  const none = () => note(t('import.noneTitle'), t('import.noneText', { depth: packStatus.depth }));
  const busy = title => show({ title, busy: true, actions: [] });

  async function send(body, type) {
    if (working || dialogStop.signal.aborted) return;
    working = true; busy(t('import.reading'));
    let res;
    try {
      res = await (await fetch('/api/figures/import', { method: 'POST', headers: { 'content-type': type }, body, signal: dialogStop.signal })).json();
    } catch (err) {
      if (!dialogStop.signal.aborted) note(t('import.failed'), t('import.offline'));
      return;
    } finally { working = false; }
    if (dialogStop.signal.aborted) return;
    if (res.error) return note(t('import.failed'), res.error);
    token = res.token;
    if (!res.packs.length && !res.problems.length) return none();
    confirm(res, body.size);
  }

  function confirm({ packs: found, problems }, size) {
    const warnings = [];
    if (found.length && size > packStatus.large) warnings.push(t('import.large', { size: MB(size) }));
    if (problems.length && found.length) warnings.push(t('import.someBad'));
    for (const p of problems) warnings.push((p.dir || t('import.pickedLevel')) + t('import.reason', { reason: p.reason }));
    show({
      title: found.length ? t('import.found', { n: found.length }) : t('import.allBad'),
      selectable: true,
      items: found.map(p => ({
        key: p.dir, label: nameOf(p.name), image: p.thumb ? new URL(p.thumb, location.href).href : undefined,
        meta: [
          [t('import.version', { version: p.version }), p.author].filter(Boolean).join(' · '),
          t('import.contents', { axes: p.axes, words: p.words, sounds: p.sounds }),
          ...(p.credits.length ? [p.credits.map(c => t('import.credit', c)).join(t('import.creditSep'))] : []),
        ],
        notice: p.installed ? p.installed === p.version ? t('import.reinstall', { version: p.version }) : t('import.upgrade', { installed: p.installed, version: p.version }) : undefined,
        details: p.skipped.length ? { title: t('import.skipped', { n: p.skipped.length }), lines: p.skipped } : undefined,
      })),
      warnings, actions: [cancel, ...(found.length ? [{ key: 'install', label: t('import.button'), kind: 'primary', selection: true }] : [])],
    }, result => {
      if (result.action !== 'install') { close(); return; }
      const chosen = found.filter(p => result.selected.includes(p.dir));
      if (chosen.length) void install(chosen);
    });
  }

  function replace(chosen, conflicts) {
    show({ title: t('import.replaceTitle'), body: t('import.replaceText'),
      items: chosen.filter(p => conflicts.includes(p.id)).map(p => ({ key: p.id, label: nameOf(p.name), meta: [p.id] })),
      actions: [cancel, { key: 'replace', label: t('import.replace'), kind: 'danger' }],
    }, result => { if (result.action === 'replace') void install(chosen, conflicts); else close(); });
  }

  async function install(chosen, replaceIds = []) {
    if (working || dialogStop.signal.aborted) return;
    working = true; busy(t('import.button') + '…');
    let res;
    try {
      res = await (await fetch('/api/figures/import/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, dirs: chosen.map(p => p.dir), replace: replaceIds }), signal: dialogStop.signal })).json();
    } catch { res = { error: t('import.offline') }; }
    finally { working = false; }
    if (dialogStop.signal.aborted) return;
    if (res.error) return note(t('import.failed'), res.error);
    if (res.conflicts) return replace(chosen, res.conflicts);
    token = ''; close();
    const replacing = chosen.some(p => p.id === skin.figure);
    $('#saved').textContent = t('import.done', { names: chosen.map(p => nameOf(p.name)).join(t('import.nameSep')) }) + (replacing ? t('import.replacing') : '');
    sfx.sparkle();
    if (replacing) { body?.dispose(); body = null; }
    await loadPacks();
    if (replacing) void showFigure(skin);
  }

  async function uninstall(pack) {
    working = true; busy(t('remove.go') + '…');
    let res;
    try {
      res = await (await fetch('/api/figures/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pack.id }), signal: dialogStop.signal })).json();
    } catch { res = { error: t('import.offline') }; }
    finally { working = false; }
    if (dialogStop.signal.aborted) return;
    if (res.error) return note(t('remove.failed'), res.error);
    close();
    if (skin.figure === pack.id) await apply({ ...skin, figure: 'coo' }, true);
    $('#saved').textContent = t('remove.done', { name: nameOf(pack.name) });
    await loadPacks();
  }

  return {
    /** Asks before a saved look is deleted; `go` deletes it. */
    forget(look, go) {
      if (working) return;
      close();
      show({ title: t('looks.deleteTitle', { name: look.name }), body: t('looks.deleteLead'),
        actions: [cancel, { key: 'forget', label: t('looks.deleteGo'), kind: 'danger' }],
      }, result => { close(); if (result.action === 'forget') void go(); });
    },
    /** Asks before deleting an installed pack; the pet wearing it changes to Coo. */
    remove(pack) {
      if (working) return;
      close();
      show({ title: t('remove.title', { name: nameOf(pack.name) }), body: t('remove.lead'),
        actions: [cancel, { key: 'remove', label: t('remove.go'), kind: 'danger' }],
      }, result => { if (result.action === 'remove') void uninstall(pack); else close(); });
    },
    choose() {
      if (working) return;
      close();
      show({ title: t('import.title'), body: t('import.lead', { depth: packStatus.depth }) + '\n' + t('import.dropNote'),
        actions: [cancel, { key: 'directory', label: t('import.pickDir'), file: 'directory' }, { key: 'zip', label: t('import.pickZip'), kind: 'primary', file: 'zip' }],
      }, result => {
        if (result.action === 'zip' && result.files?.length === 1) void send(result.files[0].file, 'application/zip');
        else if (result.action === 'directory' && result.files?.length) {
          const found = packFiles(result.files, packStatus.depth);
          if (!found.length) none(); else void send(bundle(found), 'application/x-figure-files');
        } else close();
      });
    },
    async drop(items) {
      if (working) return;
      close();
      const entries = [...items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
      const zips = entries.filter(e => e.isFile && /\.zip$/i.test(e.name)), dirs = entries.filter(e => e.isDirectory);
      working = true; busy(t('import.reading'));
      let upload;
      try {
        if (zips.length === 1 && !dirs.length) upload = { body: await new Promise((ok, bad) => zips[0].file(ok, bad)), type: 'application/zip' };
        else if (!dirs.length) { note(t('import.cannot'), t('import.dropOne')); return; }
        else {
          const files = [];
          for (const d of dirs) files.push(...await droppedFiles(d, d.name, packStatus.depth));
          const found = packFiles(files, packStatus.depth);
          if (!found.length) { none(); return; }
          upload = { body: bundle(found), type: 'application/x-figure-files' };
        }
      } catch (err) { if (!dialogStop.signal.aborted) note(t('import.readFailed'), String(err?.message ?? err)); return; }
      finally { working = false; }
      return send(upload.body, upload.type);
    },
  };
})();

// a zip or folders dragged onto the page
const dropHint = $('#dropHint');
const dragging = (e) => packStatus.importable && e.dataTransfer?.types.includes('Files');
let dragDepth = 0;
document.addEventListener('dragenter', (e) => { if (!dragging(e)) return; e.preventDefault(); dragDepth++; dropHint.hidden = false; });
document.addEventListener('dragover', (e) => { if (dragging(e)) e.preventDefault(); });
document.addEventListener('dragleave', () => { if (dragDepth && !--dragDepth) dropHint.hidden = true; });
document.addEventListener('drop', (e) => {
  if (!dragging(e)) return;
  e.preventDefault();
  dragDepth = 0; dropHint.hidden = true;
  void importDialog.drop(e.dataTransfer.items);
});

function render() {
  renderFigure();
  renderLooks();
  const pal = $('#optPalette');
  pal.textContent = '';
  const palOpts = el('div', 'opts');
  for (const p of PALETTES) {
    const b = el('button', 'opt swatch');
    b.setAttribute('aria-pressed', String(skin.palette === p.id));
    b.innerHTML = `<svg viewBox="${CROP.palette}" aria-hidden="true" style="--sl-ink:${p.l[0]};--sl-eye:${p.l[1]};--sd-ink:${p.d[0]};--sd-eye:${p.d[1]}">${mini('neutral', { ...skin, palette: p.id, head: 'none', side: 'none', glasses: 'none', neck: 'none' })}</svg><span></span>`;
    b.querySelector('span').textContent = cooName('palette', p.id);
    b.addEventListener('click', () => { apply({ ...skin, palette: p.id }, true); sfx.sparkle(); body?.cue('cheer'); });
    palOpts.appendChild(b);
  }
  pal.appendChild(palOpts);
  for (const [slot, list, sel] of [['head', HEADS, '#optHead'], ['side', SIDES, '#optSide'], ['glasses', GLASSES, '#optGlasses'], ['neck', NECKS, '#optNeck']]) {
    const box = $(sel);
    box.textContent = '';
    const opts = el('div', 'opts');
    for (const id of list) {
      const b = el('button', 'opt');
      b.setAttribute('aria-pressed', String(skin[slot] === id));
      b.innerHTML = `<svg viewBox="${CROP[slot]}" aria-hidden="true">${mini('neutral', { ...skin, [slot]: id })}</svg><span></span>`;
      b.querySelector('span').textContent = cooName(slot, id);
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
    if ((m.t === 'init' || m.t === 'prefs') && (m.theme === 'dark' || m.theme === 'light') && m.theme !== theme) { theme = m.theme; showTheme(); modeBtn.show(theme); body?.set({ theme }); renderLooks(); }
    if (m.t === 'init') { loadPacks(); void loadLooks(); announcePainted(); }
    if ((m.t === 'init' || m.t === 'prefs') && typeof m.scale === 'number') scaleHeard.heard(m.scale, sizer.active || !!scaleTimer);
    if ((m.t === 'init' || m.t === 'prefs') && m.skin && JSON.stringify(normalizeSkin(m.skin)) !== JSON.stringify(skin)) {
      const worn = looks.find((l) => sameLook(l.skin, m.skin) && (l.scale ?? scale) === scale);
      if (worn) activeLook = worn.id;
      apply(normalizeSkin(m.skin), false);
    }
    if ((m.t === 'init' || m.t === 'prefs') && m.sounds && typeof m.sounds === 'object') sfx.configure({ volume: m.sounds.volume });
    if ((m.t === 'init' || m.t === 'prefs') && typeof m.language === 'string' && m.language !== language()) void useLanguage(m.language).then(() => { showText(); render(); });
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
void ready.then(() => { connect(); apply(skin, false); });

let last = performance.now();
/** The last error the frame loop logged, so one that keeps recurring is reported once, not per frame. */
let frameErr = null;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  try {
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
