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
 *
 * Text follows the app language (i18n.js): the page's own from its tables, the names of figures, Coo's
 * palettes and accessories, and other packs' picks from the packs' manifests.
 */
import { applyTheme } from './ui.js';
import { applyText, language, nameIn, t, useLanguage } from './i18n.js';
import { createSfx } from './sound.js';
import {
  COO_CSS, mini, normalizeSkin, skinCss, wear,
  PALETTES, HEADS, SIDES, GLASSES, NECKS, ACC_COLORS, LINKED, NO_BODY, ROLES,
} from './coo/coo.js';
import { loadBody } from './body-host.js';
import { dressFloor, lightWall, modeButton } from './stage.js';

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
const preview = $('#preview');
// the stage as on the 开始 page's preview (stage.js): a wall that answers the pointer, a floor with icons, the night/day button
const modeBtn = modeButton(preview, () => theme, (next) => { theme = next; body?.set({ theme }); sfx.tick(); }, (next) => save('/api/prefs', { theme: next }));
lightWall(preview);
dressFloor($('#floor'));
/** The page's own text in the app language; the theme button's title is part of it. */
const showText = () => { applyText(); document.title = t('dress.title'); modeBtn.show(theme); };
const ready = useLanguage().then(showText);
applyTheme(theme);
/** The floor is the stage's bottom 48 pixels, as in a tab (pet.css .floor). */
const FLOOR = 48;
const bounds = () => ({ W: preview.clientWidth, H: preview.clientHeight, floorY: preview.clientHeight - FLOOR, S: .5 });
/** The body in the preview (body-host.js), and the page's clock. */
let body = null, T = 0;
new ResizeObserver(() => body?.set({ bounds: bounds() })).observe(preview);
const local = (e) => { const r = preview.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
preview.addEventListener('pointerdown', (e) => { const p = local(e); body?.pointer('down', p); if (body?.hit(p)) preview.setPointerCapture(e.pointerId); });
preview.addEventListener('pointermove', (e) => body?.pointer('move', local(e)));
preview.addEventListener('pointerup', (e) => body?.pointer('up', local(e)));
preview.addEventListener('pointerleave', () => body?.pointer('leave', {}));


function save(path, body) {
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { $('#saved').textContent = t(r.ok ? 'dress.saved' : 'dress.notSaved'); })
    .catch(() => { $('#saved').textContent = t('dress.offline'); });
}

// the installed figure packs, asked for again whenever the page hears of a look, and the ones that did not load
let packs = [];
let packStatus = { importable: false, max: 0, depth: 3, problems: [] };
const loadPacks = () => Promise.all([fetch('/api/figures').then((r) => r.json()), fetch('/api/figures/status').then((r) => r.json())])
  .then(([list, status]) => { packs = list; packStatus = status; render(); }).catch(() => {});
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
  const dlg = $('#importDialog');
  let token = '';
  const show = (html) => { dlg.innerHTML = html; applyText(dlg); if (!dlg.open) dlg.showModal(); };
  const close = () => { if (token) fetch('/api/figures/import/cancel', { method: 'POST' }).catch(() => {}); token = ''; dlg.close(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  const note = (title, text) => {
    show('<h2 id="importTitle"></h2><p class="lead"></p><div class="actions"><button class="btn primary" type="button" data-close data-i18n="import.ok"></button></div>');
    dlg.querySelector('h2').textContent = title;
    dlg.querySelector('.lead').textContent = text;
  };
  const none = () => note(t('import.noneTitle'), t('import.noneText', { depth: packStatus.depth }));

  async function send(body, type) {
    if (body.size > packStatus.max) return note(t('import.tooBigTitle'), t('import.tooBigText', { max: MB(packStatus.max), size: MB(body.size) }));
    show('<h2 id="importTitle" data-i18n="import.reading"></h2>');
    let res;
    try {
      res = await (await fetch('/api/figures/import', { method: 'POST', headers: { 'content-type': type }, body })).json();
    } catch {
      return note(t('import.failed'), t('import.offline'));
    }
    if (res.error) return note(t('import.failed'), res.error);
    if (!res.packs.length && !res.problems.length) return none();
    token = res.token;
    confirm(res);
  }

  function confirm({ packs: found, problems }) {
    show(`<h2 id="importTitle"></h2><ul class="found"></ul><div class="cant"></div>
      <div class="actions"><button class="btn" type="button" data-close data-i18n="import.cancel"></button><button class="btn primary" type="button" data-go data-i18n="import.button"></button></div>`);
    dlg.querySelector('h2').textContent = found.length ? t('import.found', { n: found.length }) : t('import.allBad');
    const ul = dlg.querySelector('.found');
    for (const p of found) {
      const label = ul.appendChild(el('li')).appendChild(el('label'));
      const box = label.appendChild(el('input'));
      box.type = 'checkbox'; box.checked = true; box.value = p.dir;
      const pic = label.appendChild(p.thumb ? el('img') : el('span', 'nopic'));
      if (p.thumb) { pic.src = p.thumb; pic.alt = ''; }
      const info = label.appendChild(el('div', 'info'));
      info.appendChild(el('b')).textContent = nameOf(p.name);
      info.appendChild(el('span', 'meta')).textContent = [t('import.version', { version: p.version }), p.author].filter(Boolean).join(' · ');
      info.appendChild(el('span', 'meta')).textContent = t('import.contents', { axes: p.axes, words: p.words, sounds: p.sounds });
      if (p.credits.length) info.appendChild(el('span', 'meta')).textContent = p.credits.map((c) => t('import.credit', c)).join(t('import.creditSep'));
      if (p.installed) info.appendChild(el('span', 'again')).textContent = p.installed === p.version ? t('import.reinstall', { version: p.version }) : t('import.upgrade', { installed: p.installed, version: p.version });
      if (p.skipped.length) {
        const d = info.appendChild(el('details'));
        d.appendChild(el('summary')).textContent = t('import.skipped', { n: p.skipped.length });
        for (const s of p.skipped) d.appendChild(el('p')).textContent = s;
      }
    }
    const cant = dlg.querySelector('.cant');
    if (problems.length && found.length) cant.appendChild(el('p', 'meta')).textContent = t('import.someBad');
    for (const p of problems) {
      const line = cant.appendChild(el('p', 'warn'));
      line.appendChild(el('b')).textContent = p.dir || t('import.pickedLevel');
      line.append(t('import.reason', { reason: p.reason }));
    }
    const go = dlg.querySelector('[data-go]');
    if (!found.length) { go.remove(); return; }
    const boxes = [...ul.querySelectorAll('input')];
    const sync = () => { go.disabled = !boxes.some((b) => b.checked); };
    for (const b of boxes) b.addEventListener('change', sync);
    go.addEventListener('click', async () => {
      const chosen = found.filter((p) => boxes.some((b) => b.checked && b.value === p.dir));
      // the pack on screen gets its new files the next time it loads
      const replacing = chosen.some((p) => p.id === skin.figure);
      go.disabled = true;
      let res;
      try {
        res = await (await fetch('/api/figures/import/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, dirs: chosen.map((p) => p.dir) }) })).json();
      } catch {
        res = { error: t('import.offline') };
      }
      token = '';
      if (res.error) return note(t('import.failed'), res.error);
      dlg.close();
      $('#saved').textContent = t('import.done', { names: chosen.map((p) => nameOf(p.name)).join(t('import.nameSep')) }) + (replacing ? t('import.replacing') : '');
      sfx.sparkle();
      if (replacing) { body?.dispose(); body = null; }
      await loadPacks();
      if (replacing) void showFigure(skin);
    });
  }

  $('#importZip').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) void send(f, 'application/zip'); });
  $('#importDir').addEventListener('change', (e) => {
    const files = [...e.target.files].map((file) => ({ path: file.webkitRelativePath, file }));
    e.target.value = '';
    const found = packFiles(files, packStatus.depth);
    if (!found.length) return none();
    void send(bundle(found), 'application/x-figure-files');
  });

  return {
    /** Asks what to import. */
    choose() {
      show(`<h2 id="importTitle" data-i18n="import.title"></h2>
        <p class="lead"></p>
        <div class="choices"><button class="btn primary" type="button" data-pick="zip" data-i18n="import.pickZip"></button><button class="btn" type="button" data-pick="dir" data-i18n="import.pickDir"></button></div>
        <p class="meta" data-i18n="import.dropNote"></p>
        <div class="actions"><button class="btn" type="button" data-close data-i18n="import.cancel"></button></div>`);
      dlg.querySelector('.lead').textContent = t('import.lead', { depth: packStatus.depth });
      for (const b of dlg.querySelectorAll('[data-pick]')) b.addEventListener('click', () => $(b.dataset.pick === 'zip' ? '#importZip' : '#importDir').click());
    },
    /** A drop on the page: one zip, or folders. */
    async drop(items) {
      const entries = [...items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
      const zips = entries.filter((e) => e.isFile && /\.zip$/i.test(e.name)), dirs = entries.filter((e) => e.isDirectory);
      if (zips.length === 1 && !dirs.length) return send(await new Promise((ok, bad) => zips[0].file(ok, bad)), 'application/zip');
      if (!dirs.length) return note(t('import.cannot'), t('import.dropOne'));
      show('<h2 id="importTitle" data-i18n="import.reading"></h2>');
      const files = [];
      try {
        for (const d of dirs) files.push(...await droppedFiles(d, d.name, packStatus.depth));
      } catch (err) {
        return note(t('import.readFailed'), String(err?.message ?? err));
      }
      const found = packFiles(files, packStatus.depth);
      if (!found.length) return none();
      return send(bundle(found), 'application/x-figure-files');
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
  const pal = $('#optPalette');
  pal.textContent = '';
  const palOpts = el('div', 'opts');
  for (const p of PALETTES) {
    const b = el('button', 'opt swatch');
    b.setAttribute('aria-pressed', String(skin.palette === p.id));
    b.innerHTML = `<svg viewBox="${CROP.palette}" aria-hidden="true" style="--sl-ink:${p.l[0]};--sl-eye:${p.l[1]};--sd-ink:${p.d[0]};--sd-eye:${p.d[1]}">${mini('neutral', { ...skin, head: 'none', side: 'none', glasses: 'none', neck: 'none' })}</svg><span></span>`;
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
    if ((m.t === 'init' || m.t === 'prefs') && (m.theme === 'dark' || m.theme === 'light') && m.theme !== theme) { theme = m.theme; applyTheme(theme); modeBtn.show(theme); body?.set({ theme }); }
    if (m.t === 'init') loadPacks();
    if ((m.t === 'init' || m.t === 'prefs') && m.skin && JSON.stringify(normalizeSkin(m.skin)) !== JSON.stringify(skin)) apply(normalizeSkin(m.skin), false);
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
