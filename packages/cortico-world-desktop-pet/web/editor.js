/**
 * The layered-figure editor: place a pack's PNG layers, preview and record its motions, and write
 * the result back to the pack's model.json. Installed packs only; images it adds go to the pack's
 * img/. Layer boxes are in the 256x256 figure space, feet at y=256, drawn at SCALE.
 */
import { t, useLanguage, applyText } from './i18n.js';
const LOGO = 256;
const SCALE = 3;
const $ = (id) => document.getElementById(id);
const view = $('view');
const ctx = view.getContext('2d');

const state = {
  packs: [],
  pack: null,
  model: null,
  base: '',
  images: new Map(),
  selected: null,
  anim: { id: '', t: 0, playing: false, seconds: 1 },
  drag: null,
  dirty: false,
  needsRender: true,
  plans: new Map(),
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const round = (v) => Math.round(v * 100) / 100;

function status(text, bad = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}

/* ---------- images and packs ---------- */
function loadImage(src) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => bad(new Error(src));
    img.src = state.base + src;
  });
}

async function boot() {
  await useLanguage();
  applyText();
  document.title = t('editor.title');
  const packs = await (await fetch('/api/figures')).json();
  state.packs = packs.filter((p) => p.model && p.removable !== false);
  const sel = $('pack');
  sel.innerHTML = '';
  if (!state.packs.length) {
    status(t('editor.noPacks'), true);
    $('save').disabled = true;
    return;
  }
  for (const p of state.packs) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p.name?.zh ?? p.name?.en ?? p.id) + `（${p.id}）`;
    sel.appendChild(o);
  }
  sel.value = (() => {
    const want = new URLSearchParams(location.search).get('pack');
    if (want && state.packs.some((p) => p.id === want)) return want;
    const saved = localStorage.getItem('editor.pack');
    return saved && state.packs.some((p) => p.id === saved) ? saved : state.packs[0].id;
  })();
  sel.addEventListener('change', () => { localStorage.setItem('editor.pack', sel.value); void openPack(sel.value); });
  await openPack(sel.value);
}

async function openPack(id) {
  const pack = state.packs.find((p) => p.id === id);
  if (!pack) return;
  state.pack = pack;
  state.base = pack.base;
  state.selected = null;
  state.anim = { id: '', t: 0, playing: false, seconds: 1 };
  state.dirty = false;
  state.images.clear();
  state.plans.clear();
  const res = await fetch(state.base + pack.model);
  if (!res.ok) { status(t('editor.loadFailed'), true); return; }
  state.model = await res.json();
  state.model.layers = Array.isArray(state.model.layers) ? state.model.layers : [];
  state.model.motions = state.model.motions && typeof state.model.motions === 'object' ? state.model.motions : {};
  await Promise.all(state.model.layers.map(async (l) => {
    if (!l || typeof l.src !== 'string') return;
    try { state.images.set(l.src, await loadImage(l.src)); } catch { state.images.set(l.src, null); }
  }));
  buildPlans();
  renderLayers();
  renderMotions();
  syncInspector();
  $('save').disabled = false;
  status(t('editor.opened', { pack: pack.id, layers: state.model.layers.length, motions: Object.keys(state.model.motions).length }));
  state.needsRender = true;
}

function buildPlans() {
  state.plans.clear();
  for (const [id, def] of Object.entries(state.model.motions)) {
    const byLayer = new Map(), all = [];
    for (const tr of Array.isArray(def?.tracks) ? def.tracks : []) {
      if (!tr || !Array.isArray(tr.keys)) continue;
      if (tr.layer === '*') all.push(tr);
      else if (typeof tr.layer === 'string') {
        if (!byLayer.has(tr.layer)) byLayer.set(tr.layer, []);
        byLayer.get(tr.layer).push(tr);
      }
    }
    state.plans.set(id, { all, byLayer });
  }
}

/* ---------- sampling and drawing ---------- */
function sample(tracks, t) {
  const out = { x: 0, y: 0, r: 0, s: 1, a: 1 };
  for (const tr of tracks ?? []) {
    const keys = tr.keys;
    if (!Array.isArray(keys) || !keys.length) continue;
    let i = 0;
    while (i < keys.length - 1 && t > num(keys[i + 1].t, 0)) i++;
    const a = keys[i], b = keys[i + 1];
    const ta = num(a.t, 0), tb = b ? num(b.t, ta) : ta;
    const u = b && tb > ta ? clamp((t - ta) / (tb - ta), 0, 1) : 1;
    const at = (key, dflt) => {
      const va = num(a[key], dflt), vb = num(b?.[key], dflt);
      return va + (vb - va) * u;
    };
    out.x += at('x', 0); out.y += at('y', 0); out.r += at('r', 0);
    out.s *= at('s', 1); out.a *= at('a', 1);
  }
  return out;
}

function layerOf(id) { return state.model?.layers.find((l) => l.id === id) ?? null; }
function pivotOf(layer) {
  if (Array.isArray(layer.pivot)) return layer.pivot;
  if (Array.isArray(state.model?.pivot)) return state.model.pivot;
  return [LOGO / 2, LOGO];
}
function sortedLayers() {
  return state.model.layers.slice().sort((a, b) => num(a.z, 0) - num(b.z, 0));
}

function drawLayer(layer, xf) {
  const img = state.images.get(layer.src);
  if (!img || xf.a <= .001) return;
  const [px, py] = pivotOf(layer);
  const [bx, by, bw, bh] = layer.box;
  ctx.save();
  ctx.translate(xf.x * SCALE, xf.y * SCALE);
  ctx.translate(px * SCALE, py * SCALE);
  ctx.rotate(xf.r * Math.PI / 180);
  ctx.scale(xf.s, xf.s);
  ctx.translate(-px * SCALE, -py * SCALE);
  ctx.globalAlpha = clamp(xf.a, 0, 1) * clamp(num(layer.alpha, 1), 0, 1);
  ctx.drawImage(img, bx * SCALE, by * SCALE, bw * SCALE, bh * SCALE);
  ctx.restore();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  if (!state.model) return;
  const plan = state.anim.id ? state.plans.get(state.anim.id) : null;
  const t = state.anim.id ? state.anim.t : 0;
  const all = sample(plan?.all, t);
  const gp = Array.isArray(state.model.pivot) ? state.model.pivot : [LOGO / 2, LOGO];
  ctx.save();
  ctx.translate(gp[0] * SCALE + all.x * SCALE, gp[1] * SCALE + all.y * SCALE);
  ctx.rotate(all.r * Math.PI / 180);
  ctx.scale(all.s, all.s);
  ctx.translate(-gp[0] * SCALE, -gp[1] * SCALE);
  for (const layer of sortedLayers()) {
    const m = sample(plan?.byLayer.get(layer.id), t);
    drawLayer(layer, m);
  }
  ctx.restore();
  // the selected layer: its box and its pivot
  const sel = state.selected ? layerOf(state.selected) : null;
  if (sel) {
    const [bx, by, bw, bh] = sel.box;
    ctx.save();
    ctx.translate(all.x * SCALE, all.y * SCALE);
    ctx.strokeStyle = '#6E8BFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(bx * SCALE, by * SCALE, bw * SCALE, bh * SCALE);
    ctx.setLineDash([]);
    const [px, py] = pivotOf(sel);
    ctx.strokeStyle = '#FFC857';
    ctx.beginPath();
    ctx.moveTo(px * SCALE - 9, py * SCALE); ctx.lineTo(px * SCALE + 9, py * SCALE);
    ctx.moveTo(px * SCALE, py * SCALE - 9); ctx.lineTo(px * SCALE, py * SCALE + 9);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- layer list ---------- */
function renderLayers() {
  const list = $('layerList');
  list.innerHTML = '';
  const layers = state.model ? sortedLayers().reverse() : [];
  if (!layers.length) {
    const li = document.createElement('li');
    li.className = 'muted small';
    li.textContent = t('editor.noLayers');
    list.appendChild(li);
    return;
  }
  for (const layer of layers) {
    const li = document.createElement('li');
    li.dataset.id = layer.id;
    if (layer.id === state.selected) li.classList.add('on');
    const img = state.images.get(layer.src);
    const thumb = document.createElement('img');
    if (img) thumb.src = img.src; else thumb.alt = '?';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const id = document.createElement('div');
    id.className = 'id'; id.textContent = layer.id;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const alpha = num(layer.alpha, 1);
    sub.textContent = `z ${num(layer.z, 0)} · ${Math.round(layer.box[2])}×${Math.round(layer.box[3])}${alpha < 1 ? ` · ${t('editor.alpha')} ${alpha}` : ''}`;
    meta.append(id, sub);
    const ops = document.createElement('div');
    ops.className = 'ops';
    const up = document.createElement('button');
    up.type = 'button'; up.textContent = '↑'; up.title = t('editor.moveUp');
    up.addEventListener('click', (e) => { e.stopPropagation(); moveLayer(layer, 1); });
    const down = document.createElement('button');
    down.type = 'button'; down.textContent = '↓'; down.title = t('editor.moveDown');
    down.addEventListener('click', (e) => { e.stopPropagation(); moveLayer(layer, -1); });
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕'; del.title = t('editor.removeLayer');
    del.addEventListener('click', (e) => { e.stopPropagation(); removeLayer(layer); });
    ops.append(up, down, del);
    li.append(thumb, meta, ops);
    li.addEventListener('click', () => selectLayer(layer.id));
    list.appendChild(li);
  }
}

function selectLayer(id) {
  state.selected = id;
  renderLayers();
  syncInspector();
  state.needsRender = true;
}

function moveLayer(layer, dir) {
  const ordered = sortedLayers();
  const i = ordered.indexOf(layer);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ordered.length) return;
  const other = ordered[j];
  const z = num(layer.z, 0), z2 = num(other.z, 0);
  layer.z = z2 === z ? z + dir * .5 : z2;
  other.z = z2 === z ? z2 - dir * .5 : z;
  state.dirty = true;
  renderLayers();
  state.needsRender = true;
}

function removeLayer(layer) {
  if (!confirm(t('editor.confirmRemove', { id: layer.id }))) return;
  state.model.layers = state.model.layers.filter((l) => l !== layer);
  if (state.selected === layer.id) state.selected = null;
  state.dirty = true;
  renderLayers();
  syncInspector();
  state.needsRender = true;
}

/* ---------- inspector ---------- */
function syncInspector() {
  const layer = state.selected ? layerOf(state.selected) : null;
  $('layerName').textContent = layer ? `${layer.id}  (${layer.src})` : t('editor.none');
  const fields = ['lx', 'ly', 'lw', 'lh', 'lz', 'la', 'lpx', 'lpy', 'lsrc'];
  for (const id of fields) $(id).disabled = !layer;
  if (!layer) {
    for (const id of ['lx', 'ly', 'lw', 'lh', 'lz', 'la', 'lpx', 'lpy', 'lsrc']) $(id).value = '';
    return;
  }
  const [px, py] = pivotOf(layer);
  $('lx').value = round(layer.box[0]);
  $('ly').value = round(layer.box[1]);
  $('lw').value = round(layer.box[2]);
  $('lh').value = round(layer.box[3]);
  $('lz').value = num(layer.z, 0);
  $('la').value = round(num(layer.alpha, 1));
  $('lpx').value = round(px);
  $('lpy').value = round(py);
  $('lsrc').value = layer.src;
  updateChannelInputs();
}

/** The motion channel inputs: the motion, the time, and the selected layer's sampled values. */
function updateChannelInputs() {
  const layer = state.selected ? layerOf(state.selected) : null;
  const plan = state.anim.id ? state.plans.get(state.anim.id) : null;
  const m = layer && plan ? sample(plan.byLayer.get(layer.id), state.anim.t) : { x: 0, y: 0, r: 0, s: 1, a: 1 };
  $('kr').value = Math.round(m.r);
  $('kx').value = round(m.x);
  $('ky').value = round(m.y);
  $('ks').value = round(m.s);
  $('ka').value = clamp(round(m.a), 0, 1);
  $('trackInfo').textContent = layer && state.anim.id
    ? t('editor.channel', { motion: state.anim.id, time: state.anim.t.toFixed(2), layer: layer.id })
    : t('editor.trackHint');
}

/* ---------- motions ---------- */
function renderMotions() {
  const sel = $('motion');
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = ''; none.textContent = t('editor.noMotion');
  sel.appendChild(none);
  for (const id of Object.keys(state.model?.motions ?? {})) {
    const o = document.createElement('option');
    o.value = id; o.textContent = id;
    sel.appendChild(o);
  }
  sel.value = state.anim.id;
}

function onMotionChange() {
  const sel = $('motion');
  state.anim.id = sel.value;
  state.anim.t = 0;
  state.anim.playing = false;
  const def = state.model.motions[state.anim.id];
  state.anim.seconds = Math.max(.1, num(def?.seconds, 1));
  $('time').max = String(state.anim.seconds);
  $('time').value = '0';
  $('motionLength').textContent = def ? `${state.anim.seconds.toFixed(2)} s` : '—';
  $('play').textContent = t('editor.play');
  updateChannelInputs();
  state.needsRender = true;
}

function togglePlay() {
  if (!state.anim.id) return;
  state.anim.playing = !state.anim.playing;
  if (state.anim.playing && state.anim.t >= state.anim.seconds - .01) state.anim.t = 0;
  $('play').textContent = state.anim.playing ? t('editor.pause') : t('editor.play');
  state.needsRender = true;
}

function recordKey() {
  const layer = state.selected ? layerOf(state.selected) : null;
  if (!layer || !state.anim.id) return status(t('editor.pickLayerAndMotion'), true);
  const def = state.model.motions[state.anim.id];
  if (!def) return;
  def.tracks = Array.isArray(def.tracks) ? def.tracks : [];
  let track = def.tracks.find((tr) => tr.layer === layer.id);
  if (!track) { track = { layer: layer.id, keys: [] }; def.tracks.push(track); }
  const at = round(state.anim.t);
  const key = {
    t: at,
    r: num(Number($('kr').value), 0),
    x: num(Number($('kx').value), 0),
    y: num(Number($('ky').value), 0),
    s: num(Number($('ks').value), 1),
    a: num(Number($('ka').value), 1),
  };
  track.keys = (track.keys ?? []).filter((k) => Math.abs(num(k.t, 0) - at) > 1e-3);
  track.keys.push(key);
  track.keys.sort((a, b) => num(a.t, 0) - num(b.t, 0));
  state.dirty = true;
  buildPlans();
  status(t('editor.recorded', { motion: state.anim.id, layer: layer.id, time: at.toFixed(2) }));
  updateChannelInputs();
  state.needsRender = true;
}

function newMotion() {
  const id = prompt(t('editor.newMotionId'));
  if (!id) return;
  if (state.model.motions[id]) return status(t('editor.motionExists'), true);
  const seconds = Number(prompt(t('editor.motionSeconds'), '1.6')) || 1.6;
  state.model.motions[id] = { seconds, tracks: [] };
  state.dirty = true;
  renderMotions();
  $('motion').value = id;
  $('motion').dispatchEvent(new Event('change'));
  status(t('editor.motionCreated', { id }));
}

/* ---------- canvas input ---------- */
function pointerPos(e) {
  const r = view.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * LOGO,
    y: ((e.clientY - r.top) / r.height) * LOGO,
  };
}

function hitTest(p) {
  const layers = sortedLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    const [x, y, w, h] = l.box;
    if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) return l;
  }
  return null;
}

view.addEventListener('pointerdown', (e) => {
  if (!state.model) return;
  view.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  const hit = hitTest(p);
  if (hit) selectLayer(hit.id);
  else { state.selected = null; renderLayers(); syncInspector(); state.needsRender = true; }
  const layer = hit;
  if (!layer) return;
  state.drag = {
    mode: e.altKey ? 'pivot' : 'move',
    start: p,
    box: layer.box.slice(),
    pivot: pivotOf(layer).slice(),
    layer,
  };
});

view.addEventListener('pointermove', (e) => {
  if (!state.drag) return;
  const p = pointerPos(e);
  const dx = p.x - state.drag.start.x, dy = p.y - state.drag.start.y;
  const layer = state.drag.layer;
  if (state.drag.mode === 'move') {
    layer.box = [round(state.drag.box[0] + dx), round(state.drag.box[1] + dy), state.drag.box[2], state.drag.box[3]];
  } else {
    layer.pivot = [round(state.drag.pivot[0] + dx), round(state.drag.pivot[1] + dy)];
  }
  state.dirty = true;
  syncInspector();
  state.needsRender = true;
});

function endDrag() { state.drag = null; }
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);

view.addEventListener('wheel', (e) => {
  const layer = state.selected ? layerOf(state.selected) : null;
  if (!layer) return;
  e.preventDefault();
  const f = e.deltaY > 0 ? .96 : 1.04;
  const w = layer.box[2] * f, h = layer.box[3] * f;
  layer.box = [layer.box[0], layer.box[1], round(Math.max(1, w)), round(Math.max(1, h))];
  state.dirty = true;
  syncInspector();
  state.needsRender = true;
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const layer = state.selected ? layerOf(state.selected) : null;
  if (!layer) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { removeLayer(layer); e.preventDefault(); return; }
  const step = e.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = moves[e.key];
  if (!m) return;
  e.preventDefault();
  layer.box = [round(layer.box[0] + m[0]), round(layer.box[1] + m[1]), layer.box[2], layer.box[3]];
  state.dirty = true;
  syncInspector();
  state.needsRender = true;
});

/* ---------- property inputs ---------- */
function bindNumber(id, apply) {
  $(id).addEventListener('change', () => {
    const layer = state.selected ? layerOf(state.selected) : null;
    if (!layer) return;
    apply(layer, Number($(id).value));
    state.dirty = true;
    state.needsRender = true;
    renderLayers();
  });
}
bindNumber('lx', (l, v) => { l.box[0] = round(num(v, l.box[0])); });
bindNumber('ly', (l, v) => { l.box[1] = round(num(v, l.box[1])); });
bindNumber('lw', (l, v) => { l.box[2] = round(Math.max(1, num(v, l.box[2]))); });
bindNumber('lh', (l, v) => { l.box[3] = round(Math.max(1, num(v, l.box[3]))); });
bindNumber('lz', (l, v) => { l.z = num(v, l.z); });
bindNumber('la', (l, v) => { l.alpha = clamp(num(v, 1), 0, 1); });
bindNumber('lpx', (l, v) => { l.pivot = [round(num(v, pivotOf(l)[0])), pivotOf(l)[1]]; });
bindNumber('lpy', (l, v) => { l.pivot = [pivotOf(l)[0], round(num(v, pivotOf(l)[1]))]; });

/* ---------- save and add images ---------- */
async function save() {
  if (!state.pack) return;
  const body = JSON.stringify(state.model, null, 2);
  try {
    const res = await fetch(`/api/figures/${encodeURIComponent(state.pack.id)}/model`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error ?? res.statusText);
    state.dirty = false;
    status(t('editor.saved', { layers: state.model.layers.length, motions: Object.keys(state.model.motions).length }));
  } catch (err) {
    status(t('editor.saveFailed', { error: err?.message ?? err }), true);
  }
}

async function addFiles(files) {
  if (!state.pack) return;
  for (const file of files) {
    const clean = file.name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[^A-Za-z0-9_-]/, 'x');
    const name = `layer-${Date.now().toString(36)}-${clean}`;
    const res = await fetch(`/api/figures/${encodeURIComponent(state.pack.id)}/asset?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file,
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { status(t('editor.uploadFailed', { error: out.error ?? res.statusText }), true); continue; }
    let img = null;
    try { img = await loadImage(out.path); } catch { /* a layer without its size still gets added */ }
    const ratio = img ? img.width / img.height : 1;
    const h = 160, w = h * ratio;
    const id = `layer-${Date.now().toString(36)}`;
    const layer = {
      id,
      src: out.path,
      box: [round(LOGO / 2 - w / 2), round(LOGO - h), round(w), round(h)],
      z: Math.max(0, ...state.model.layers.map((l) => num(l.z, 0))) + 1,
      pivot: [LOGO / 2, LOGO],
    };
    state.model.layers.push(layer);
    if (img) state.images.set(out.path, img);
    state.selected = layer.id;
    state.dirty = true;
    renderLayers();
    syncInspector();
    state.needsRender = true;
    status(t('editor.layerAdded', { id, src: out.path }));
  }
}

$('addLayer').addEventListener('click', () => $('files').click());
$('files').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) void addFiles(f); });
$('save').addEventListener('click', () => void save());
$('play').addEventListener('click', togglePlay);
$('newMotion').addEventListener('click', newMotion);
$('record').addEventListener('click', recordKey);
$('motion').addEventListener('change', onMotionChange);
$('time').addEventListener('input', (e) => {
  state.anim.playing = false;
  $('play').textContent = t('editor.play');
  state.anim.t = Number(e.target.value);
  updateChannelInputs();
  state.needsRender = true;
});

/* ---------- frame loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000);
  last = now;
  if (state.anim.playing && state.anim.id) {
    state.anim.t += dt;
    if (state.anim.t >= state.anim.seconds) state.anim.t %= state.anim.seconds;
    $('time').value = String(state.anim.t);
    updateChannelInputs();
    state.needsRender = true;
  }
  $('timeText').textContent = `${state.anim.t.toFixed(2)} s`;
  if (state.needsRender) {
    draw();
    state.needsRender = false;
  }
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

void boot();
requestAnimationFrame(frame);
