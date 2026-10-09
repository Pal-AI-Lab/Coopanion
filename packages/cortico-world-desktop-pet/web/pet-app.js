/**
 * The pet page. Connects to the World over `/socket?role=pet`, runs the body of the figure pack the
 * skin names (Coo's or another, in a sandboxed frame, body-host.js), and turns World orders (say,
 * ask, walk, act, listen, and the steps of an app's conversation) into bubbles and motion. It
 * reports back only what happened on screen: arrivals, answers, touches, typed text, and 16 kHz
 * microphone audio while voice input is on.
 *
 * In the pet window (`window.petHost` from the preload) the page is transparent and the
 * window ignores the mouse except over the figure, a bubble, the menu or the hover buttons.
 * Colors follow the World's `theme` through `data-theme` on the root element, and text the app
 * language (i18n.js): the one stamped on the page, then the one the World's prefs carry.
 */
import { applyTheme, clamp, f, ICONS } from './ui.js';
import { language, t, useLanguage } from './i18n.js';
import { createSfx } from './sound.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from './coo/coo.js';
import { loadBody } from './body-host.js';

const $ = (s) => document.querySelector(s);
const host = window.petHost || null;
document.body.classList.add(host ? 'desk' : 'tab');

const stage = $('#stage');
const bubble = $('#bubble'), heardEl = $('#heard'), trail = $('#trail'), menu = $('#menu');
const tools = $('#tools');
// Coo's drawing classes for the menu's avatar; the bubbles and buttons take their colours from Coo's palette
const cooStyle = document.createElement('style'), skinStyle = document.createElement('style');
cooStyle.textContent = COO_CSS;
document.head.append(cooStyle, skinStyle);

const prefs = {
  roam: 'calm', sound: true, theme: document.documentElement.dataset.theme, scale: 1, user: '', mic: false, micDevice: '', bot: null,
  /** Voice input: switched on, recognizer ready, why not, how to talk, and the mode in force. */
  voice: { enabled: false, ready: false, detail: null, hint: '', mode: 'hold' },
  /** The actions shown as buttons beside the pet on hover. */
  hoverButtons: ['chat', 'voice'],
  rememberPosition: false,
  /** Double-clicking the pet opens the typing box. */
  doubleClickChat: false,
  statusBubble: true,
  /** Draw at the moving frame rate while the body rests too. */
  /** Frames a second while the body moves; 0 follows the display. */
  frameRate: 60,
  lockFrameRate: false,
};
const sfx = createSfx();
if (host) sfx.unlock();
else ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => sfx.unlock(), { capture: true }));

const floorGap = () => (host ? 2 : 48);
const bounds = () => ({ W: innerWidth, H: innerHeight, floorY: innerHeight - floorGap(), S: .42 * prefs.scale });
/**
 * The body on screen (body-host.js), null until the first one is ready, and the words it does (its pack's
 * vocab, by id). `T` is the page's clock, in seconds of frames drawn.
 */
let body = null, words = new Map(), T = 0;
/** Where the body last said it is (body-host.js `layout`), or null. */
const at = () => body?.layout ?? null;
/** What the body is told of the page: talking orders hold its roaming off, and these states. */
const bodyState = { listening: false, thinking: false, thoughtShown: true, dialogOpen: false };
const holdRoam = (seconds) => body?.set({ hold: seconds });
addEventListener('resize', () => {
  body?.set({ bounds: bounds() });
  // the World reads walk targets and drop spots against the stage the pet is on now
  send({ t: 'hello', screen: { w: innerWidth, h: innerHeight } });
});

/* ---------- connection ---------- */
let ws = null, backoff = 500, watching = false;
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function connect() {
  ws = new WebSocket(`ws://${location.host}/socket?role=pet&host=${host ? 'window' : 'tab'}`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { backoff = 500; send({ t: 'hello', screen: { w: innerWidth, h: innerHeight }, host: host ? 'window' : 'tab' }); };
  ws.onmessage = (e) => { try { onOrder(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = (e) => {
    ws = null;
    stopMic();
    // the World gave up on these steps when the page went; it asks again once the page is back
    dropDialogs();
    setStatus(null);
    if (e.code === 4000) return; // replaced by a newer pet page
    setTimeout(connect, backoff);
    backoff = Math.min(8000, backoff * 2);
  };
}
// the text is in before anything is shown
void useLanguage().then(() => { document.title = t('pet.title'); host?.setLanguage?.(language()); connect(); });

/*
 * ---------- the body: a figure pack (src/packs.ts; Coo is one) run in a sandboxed frame ----------
 * The World hears which body is on screen (`figure`), so the bot is told of a switch, and of a pack that
 * would not load or broke while running (no usable WebGL, a missing texture, a bug in its code): the page
 * then shows Coo instead. A body just loaded also says which words of its vocabulary it knows (`words`,
 * null when it does not say).
 */
let skin = normalizeSkin(null), wanted = null;
function reportFigure(id, ok, reason, scheme, known) {
  send({ t: 'figure', id, ok, ...(scheme ? { scheme } : {}), ...(reason ? { reason } : {}), ...(known !== undefined ? { words: known } : {}) });
}
function bodyFailed(id, err) {
  console.error(err);
  reportFigure(id, false, String(err?.message ?? err));
  // Coo stands in; when Coo itself will not run there is nothing left to show
  if (id !== 'coo' && wanted === id) showFigure({ ...skin, figure: 'coo' }).catch((e) => console.error(e));
}
/** Where the first body stands: the spot the World remembered (`restorePosition`), facing the middle of the screen. */
let firstX = null;
/** The pack whose body is being loaded: skins that come meanwhile wait for it (`skin` holds the latest). */
let loading = null;
async function showFigure(s) {
  wanted = s.figure;
  if (loading === s.figure) return;
  // a pick changed while the same pack is on screen fades in; Coo's picks are its skin
  if (body?.pack === s.figure) {
    body.set({ skin: s });
    if (s.figure !== 'coo') await body.setScheme(s.scheme, { fade: .45 });
    reportFigure(s.figure, true, null, s.figure === 'coo' ? null : s.scheme);
    return;
  }
  loading = s.figure;
  try { await swapBody(s); } finally { if (loading === s.figure) loading = null; }
  // a pick that came while the body was loading
  if (body?.pack === skin.figure && skin !== s) await showFigure(skin);
}
async function swapBody(s) {
  const pack = (await (await fetch('/api/figures')).json()).find((p) => p.id === s.figure);
  if (!pack) throw new Error(t('figure.notInstalled'));
  const was = at();
  const x = was?.x ?? firstX ?? innerWidth * .7;
  const holder = {};
  const next = await loadBody({
    layer: $('#figureLayer'), pack, theme: prefs.theme, bounds: bounds(),
    // the new body stands where the old one stood; the first one drops in
    start: { x, facing: was?.facing ?? (x < innerWidth / 2 ? 1 : -1), enter: body ? undefined : 'drop', skin: s, scheme: s.scheme },
    onEvent: (kind, d) => { if (body === holder.body) onBody(kind, d); },
    onSound: (name, kind, ...args) => { if (body === holder.body) sfx.play(name, kind, ...args); },
    onError: (err) => { if (body === holder.body) bodyFailed(pack.id, err); },
  });
  if (wanted !== s.figure) { next.dispose(); return; }
  holder.body = next;
  next.set({ roam: prefs.roam, ...bodyState });
  body?.dispose();
  body = next;
  words = new Map(pack.vocab.map((w) => [w.id, w]));
  sfx.usePack(pack.base, pack.sounds);
  reportFigure(s.figure, true, null, s.figure === 'coo' ? null : s.scheme, next.words);
}
async function applyFigure(s) {
  try { await showFigure(s); } catch (err) { bodyFailed(s.figure, err); }
}

/**
 * The pet window puts the pet where it stood when the World last stopped (`startX`, a share of the window
 * width) from the first `init` only; after a reconnect it stays where it is. While `rememberPosition` is on it
 * reports where the pet stands each time the body changes mode, so the World holds the place of its last stop.
 */
let restored = false, sentX = null;
function restorePosition(startX) {
  sentX = null;
  if (restored) return;
  restored = true;
  // She starts facing the middle of the screen rather than always right (#59), so a pet
  // resting on the right half is not turned away from the likely interaction area.
  if (host && typeof startX === 'number') {
    firstX = startX * innerWidth;
    body?.place(firstX, firstX < innerWidth / 2 ? 1 : -1);
  }
}
function reportPosition() {
  const l = at();
  if (!host || !prefs.rememberPosition || !l) return;
  const x = l.x / innerWidth;
  if (sentX !== null && Math.abs(x - sentX) * innerWidth < 1) return;
  sentX = x;
  send({ t: 'position', x });
}

function applyPrefs(p) {
  if (p.skin) { skin = normalizeSkin(p.skin); skinStyle.textContent = skinCss(skin); void applyFigure(skin); }
  if (p.roam) { prefs.roam = p.roam; body?.set({ roam: p.roam }); }
  if (typeof p.sound === 'boolean') { prefs.sound = p.sound; sfx.set(p.sound); }
  if (p.sounds && typeof p.sounds === 'object') sfx.configure({ kinds: p.sounds, snoreSeconds: p.sounds.snoreSeconds });
  if (p.theme === 'dark' || p.theme === 'light') { prefs.theme = p.theme; applyTheme(p.theme); body?.set({ theme: p.theme }); }
  if (typeof p.scale === 'number') { prefs.scale = p.scale; body?.set({ bounds: bounds() }); }
  if (typeof p.rememberPosition === 'boolean') { prefs.rememberPosition = p.rememberPosition; reportPosition(); }
  if (typeof p.user === 'string') prefs.user = p.user;
  if (typeof p.micDevice === 'string' && p.micDevice !== prefs.micDevice) { prefs.micDevice = p.micDevice; stopMic(); }
  if (typeof p.mic === 'boolean') { prefs.mic = p.mic; p.mic && !watching ? startMic() : stopMic(); }
  if (p.voice && typeof p.voice === 'object') prefs.voice = { ...prefs.voice, ...p.voice };
  if (typeof p.doubleClickChat === 'boolean') prefs.doubleClickChat = p.doubleClickChat;
  if (typeof p.statusBubble === 'boolean') { prefs.statusBubble = p.statusBubble; setBody({ thoughtShown: p.statusBubble }); }
  if (typeof p.lockFrameRate === 'boolean') prefs.lockFrameRate = p.lockFrameRate;
  if (typeof p.frameRate === 'number' && p.frameRate >= 0) prefs.frameRate = p.frameRate;
  // the window process does the hiding; the page only passes the setting on
  if (typeof p.hideWhenFullscreen === 'boolean') host?.hideWhenFullscreen?.(p.hideWhenFullscreen);
  if (Array.isArray(p.hoverButtons)) prefs.hoverButtons = p.hoverButtons.filter((id) => typeof id === 'string' && id in ACTIONS);
  if (p.bot) { prefs.bot = p.bot; if (!menu.hidden && !menu.querySelector('.m-head.confirm')) renderMenuHead(); }
  if (typeof p.language === 'string' && p.language !== language()) void switchLanguage(p.language);
  if ('status' in p) setStatus(p.status);
  refreshButtons();
}

/** A new app language: what is drawn from the page's own text is drawn again; bubbles already up keep theirs. */
async function switchLanguage(code) {
  await useLanguage(code);
  document.title = t('pet.title');
  host?.setLanguage?.(code);
  if (!menu.hidden && !menu.querySelector('.m-head.confirm')) renderMenuHead();
  refreshButtons();
}

function onOrder(m) {
  switch (m.t) {
    case 'init': restorePosition(m.startX); applyPrefs(m); break;
    case 'prefs': applyPrefs(m); break;
    case 'watching': watching = true; stopMic(); break;
    case 'say': dropAsks(); queue.push({ kind: 'say', id: m.id, beats: m.beats, i: -1 }); holdRoam(20); break;
    case 'ask': dropAsks(); queue.push({ kind: 'ask', id: m.id, question: m.question, options: m.options || [], own: m.own !== false }); holdRoam(20); break;
    case 'confirm': dropAsks(); queue.push({ kind: 'ask', confirm: true, id: m.id, question: m.question, options: m.options, own: false }); holdRoam(20); break;
    case 'walk': walk(m); break;
    case 'walk-stop': body?.stopWalk(m.id); break;
    case 'ask-close': closeAsk(m.id); break;
    case 'act': acts.push(...m.actions); holdRoam(20); break;
    case 'listen': onListen(m); break;
    case 'status': setStatus(m.status); break;
    case 'dialog': queue.push({ kind: 'dialog', id: m.id, d: m }); holdRoam(20); break;
    case 'dialog-update': updateDialog(m); break;
    case 'dialog-close': endDialog(m.id); break;
  }
}

/** Tells the body of a change in the page's states (listening, thinking, a bubble that wants it to stay put). */
function setBody(change) {
  if (Object.entries(change).every(([k, v]) => bodyState[k] === v)) return;
  Object.assign(bodyState, change);
  body?.set(change);
}

/* ---------- body events → World ---------- */
const walkTargets = new Map();
function onBody(kind, d) {
  if (kind === 'arrived' || kind === 'interrupted') {
    if (!d.walkId || !walkTargets.has(d.walkId)) return;
    walkTargets.delete(d.walkId);
    send({ t: kind, walkId: d.walkId, x: (typeof d.x === 'number' ? d.x : at()?.x ?? 0) / innerWidth, by: d.by });
  } else if (kind === 'touch') {
    send({ t: 'touch', ...d });
    if (d.kind === 'grab') closeMenu();
  } else if (kind === 'mode') {
    reportPosition();
  } else if (kind === 'done') {
    // a word that ends on its own (a walk across the screen) lets the next one start at once
    if (d.word === actWord) actUntil = T;
  }
}

function walk(m) {
  const x = m.to === 'cursor' ? (pointerSeen ? lastPointer.x : innerWidth / 2) : clamp(Number(m.to), 0, 1) * innerWidth;
  holdRoam(20);
  if (!body) { send({ t: 'interrupted', walkId: m.id, x: .5, by: 'none' }); return; }
  walkTargets.set(m.id, true);
  body.walk(x, !!m.run, m.id);
}

/* ---------- actions: words of the body's vocabulary, one after another ---------- */
const acts = [];
/** When the word playing lets the next one start (its `seconds`, or its `done`), and which word it is. */
let actUntil = 0, actWord = null;
function stepActs() {
  if (T < actUntil || !acts.length) return;
  const l = at();
  if (!l || l.busy) return;
  const a = acts.shift();
  body.do(a);
  actWord = a;
  actUntil = T + (words.get(a)?.seconds ?? 1);
  holdRoam(15);
}

/* ---------- say / ask ---------- */
const queue = [];
let item = null;
/** Where typing pauses: sentence and clause marks, Latin and full-width (Chinese and Japanese share 。、). */
const PAUSE = /[,.!?;:…，。！？；：、]/, SILENT = /[\s,.!?;:…，。！？；：、「」『』()（）]/;

/** A newer question replaces the bot's open one; a World's confirmation stays until answered. */
function dropAsks() {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'ask' && !queue[i].confirm) queue.splice(i, 1);
  if (item && item.kind === 'ask' && !item.answered && !item.confirm) closeBubble();
}

function openBubble(kind, html) {
  bubble.className = 'bubble ' + kind;
  bubble.removeAttribute('aria-label');
  delete bubble.dataset.kind; delete bubble.dataset.icon;
  bubble.innerHTML = html;
  bubble.hidden = false;
  void bubble.offsetWidth;
  bubble.classList.add('pop');
}
function closeBubble() {
  releaseKeys(item);
  if (item?.kind === 'dialog') talk.motion = null;
  bubble.hidden = true; bubble.innerHTML = '';
  item = null;
}

/**
 * While a question's options are up, the pet window takes the keyboard so 1–9 pick one right
 * away, and gives it back to the window that had it once the question is answered or gone.
 */
function grabKeys(it) {
  if (!host?.grabFocus || !it.options.length) return;
  it.grabbed = true;
  host.grabFocus();
}
function releaseKeys(it) {
  if (!it?.grabbed) return;
  it.grabbed = false;
  host.releaseFocus();
}

function startItem(it) {
  item = it;
  if (it.kind === 'dialog') { openDialog(it); return; }
  if (it.kind === 'ask') {
    openBubble('ask', `<button class="b-close" type="button" aria-label="${esc(t('bubble.close'))}">×</button><p class="b-text"></p><div class="b-opts" hidden></div>`);
    bubble.querySelector('.b-close').addEventListener('click', () => dismissAsk());
    it.text = it.question; it.shown = 0; it.acc = 0; it.optsShown = false;
    sfx.pop();
  }
}

function stepDialog(dt) {
  if (!item && queue.length && at() && !at().busy) startItem(queue.shift());
  const it = item;
  if (!it) return;
  if (it.kind === 'say') {
    if (it.i < 0 || it.beatDone) {
      if (it.beatDone && T < it.holdUntil) return;
      it.i++;
      it.beatDone = false;
      if (it.i >= it.beats.length) { closeBubble(); return; }
      const b = it.beats[it.i];
      let lead = 0;
      for (const a of b.actions || []) { acts.push(a); lead = .45; }
      it.shown = 0; it.acc = 0; it.fired = 0; it.startAt = T + lead;
      if (b.text) { openBubble('say', '<p class="b-text"></p>'); sfx.pop(); } else { bubble.hidden = true; }
      return;
    }
    const b = it.beats[it.i];
    if (T < it.startAt) return;
    if (!b.text) { it.beatDone = true; it.holdUntil = T + .8; return; }
    typeText(it, b.text, dt, b.anchors || []);
    if (it.shown >= b.text.length && !it.beatDone) {
      it.beatDone = true;
      const last = it.i === it.beats.length - 1;
      it.holdUntil = T + (last ? 1.6 + b.text.length * .07 : .9 + b.text.length * .03);
    }
    return;
  }
  if (it.kind === 'ask') {
    if (it.shown < it.text.length) { typeText(it, it.text, dt, []); return; }
    if (!it.optsShown) { it.optsShown = true; showOptions(it); }
  }
  if (it.kind === 'dialog') stepTalk(it, dt);
}

function typeText(it, text, dt, anchors) {
  const p = bubble.querySelector('.b-text');
  if (!p || it.shown >= text.length) return;
  it.acc += dt * 20;
  while (it.acc >= 1 && it.shown < text.length) {
    const ch = text[it.shown++];
    it.acc -= PAUSE.test(ch) ? 5 : 1;
    if (!SILENT.test(ch)) { sfx.babble(ch); body?.talk(); }
    while (it.fired < anchors.length && anchors[it.fired].at <= it.shown) acts.push(...anchors[it.fired++].actions);
  }
  if (it.marks?.length) p.innerHTML = marked(text, it.shown, it.marks);
  else p.textContent = text.slice(0, it.shown);
}

/** The first `n` characters of `text`, escaped, with every one of `words` in it wrapped for the theme color. */
function marked(text, n, words) {
  const on = new Array(text.length).fill(false);
  for (const w of words) {
    if (!w) continue;
    for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + w.length)) on.fill(true, i, i + w.length);
  }
  let out = '', open = false;
  for (let i = 0; i < n; i++) {
    if (on[i] !== open) { out += on[i] ? '<b class="d-mark">' : '</b>'; open = on[i]; }
    out += esc(text[i]);
  }
  return open ? out + '</b>' : out;
}

function showOptions(it) {
  const box = bubble.querySelector('.b-opts');
  it.options.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'b-opt';
    b.innerHTML = i < 9 ? `<kbd>${i + 1}</kbd><span></span>` : '<span></span>';
    b.querySelector('span').textContent = label;
    b.style.animationDelay = (i * .07) + 's';
    b.addEventListener('click', () => answer(b, { index: i }));
    box.appendChild(b);
    setTimeout(() => sfx.blub(), i * 70);
  });
  if (it.own) {
    const form = document.createElement('form');
    form.className = 'b-own';
    form.innerHTML = `<input type="text" maxlength="200" autocomplete="off" placeholder="${esc(t('bubble.ownPlaceholder'))}" aria-label="${esc(t('bubble.ownLabel'))}"><button type="submit">${esc(t('bubble.send'))}</button>`;
    form.style.animationDelay = (it.options.length * .07) + 's';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input'), v = input.value.trim();
      if (!v) { input.focus(); return; }
      answer(form, { text: v });
    });
    box.appendChild(form);
  }
  box.hidden = false;
  grabKeys(it);
}

function answer(node, a) {
  const it = item;
  if (!it || it.kind !== 'ask' || it.answered) return;
  it.answered = true;
  sfx.select();
  node.classList.add('chosen');
  bubble.querySelectorAll('.b-opt, .b-own').forEach((n) => { if (n !== node) n.classList.add('dim'); });
  send(it.confirm ? { t: 'confirmed', id: it.id, index: a.index } : { t: 'answer', askId: it.id, ...a });
  // the bubble stays a moment longer; the keyboard goes back now
  releaseKeys(it);
  body?.cue('cheer');
  setTimeout(() => { if (item === it) closeBubble(); }, 700);
}
/** The question was answered elsewhere (the chat page): it leaves the queue or the bubble without an answer from here. */
function closeAsk(id) {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'ask' && queue[i].id === id) queue.splice(i, 1);
  if (item && item.kind === 'ask' && item.id === id && !item.answered) { item.answered = true; closeBubble(); }
}
function dismissAsk() {
  const it = item;
  if (!it || it.kind !== 'ask' || it.answered) return;
  it.answered = true;
  send(it.confirm ? { t: 'confirmed', id: it.id, index: null } : { t: 'answer', askId: it.id, dismissed: true });
  closeBubble();
}

/* ---------- an app's conversation: one step at a time in Coo's bubble ---------- */
/** How Coo moves while a step's choice cards are up, around the spot the bubble is pinned to. */
const talk = { motion: null, next: 0 };
/** Pixels Coo strays either side of the bubble while showing a motion. */
const TALK_RANGE = 240;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function dropDialogs() {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'dialog') queue.splice(i, 1);
  if (item?.kind === 'dialog') closeBubble();
}

function openDialog(it) {
  const d = it.d;
  const dots = Array.isArray(d.step) ? Array.from({ length: d.step[1] }, (_, i) => `<i class="${i + 1 < d.step[0] ? 'past' : i + 1 === d.step[0] ? 'on' : ''}"></i>`).join('') : '';
  openBubble('talk', `${dots || d.closable ? `<div class="d-top"><span class="d-dots">${dots}</span>${d.closable ? `<button class="b-close" type="button" aria-label="${esc(t('bubble.skip'))}" title="${esc(t('bubble.skip'))}">×</button>` : ''}</div>` : ''}<p class="b-text"></p><div class="d-body" hidden></div>`);
  bubble.querySelector('.b-close')?.addEventListener('click', () => settleDialog(it, { closed: true }));
  for (const a of d.actions || []) acts.push(a);
  it.text = d.text || ''; it.shown = 0; it.acc = 0; it.bodyShown = false; it.readUntil = 0;
  it.marks = Array.isArray(d.marks) ? d.marks.filter((w) => typeof w === 'string') : [];
  sfx.pop();
}

function stepTalk(it, dt) {
  if (it.shown < it.text.length) { typeText(it, it.text, dt, []); return; }
  if (it.bodyShown) return;
  it.bodyShown = true;
  if (!it.d.input) { it.readUntil = T + 1.4 + it.text.length * .05; return; }
  showDialogInput(it);
}

/** A step with nothing to answer ends once its line has been read. */
function stepTalkRead() {
  const it = item;
  if (it?.kind === 'dialog' && it.readUntil && T > it.readUntil) settleDialog(it, { done: true });
}

function showDialogInput(it) {
  const body = bubble.querySelector('.d-body'), input = it.d.input;
  if (!body) return;
  if (input.kind === 'buttons') {
    if (input.keys) body.insertAdjacentHTML('beforeend', `<div class="d-keys"><kbd class="d-key${input.taps > 1 ? ' taps' : ''}">${esc(input.keys)}</kbd>${input.taps > 1 ? `<span class="d-taps">×${Number(input.taps)}</span>` : ''}</div>`);
    const row = Object.assign(document.createElement('div'), { className: 'd-row' });
    input.options.forEach((o, i) => row.appendChild(pill(o.label, o.primary, () => settleDialog(it, { index: i }))));
    body.appendChild(row);
  } else if (input.kind === 'choices') {
    const cards = Object.assign(document.createElement('div'), { className: 'd-cards' });
    const pick = (i, speak) => {
      it.value = i;
      cards.querySelectorAll('.d-card').forEach((c, k) => c.classList.toggle('on', k === i));
      const o = input.options[i];
      // the bubble stays put from here on, so the cards do not run off while Coo shows how it moves
      if (it.pinX === undefined) { const a = at()?.bubble ?? { x: innerWidth / 2, y: innerHeight }; it.pinX = a.x; it.pinY = a.y; }
      talk.motion = o?.motion ?? null; talk.next = 0;
      if (speak && o?.line) { it.text = o.line; it.shown = 0; it.acc = 0; }
    };
    input.options.forEach((o, i) => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'd-card';
      c.style.animationDelay = (i * .07) + 's';
      const image = typeof o.image === 'string' && o.image.startsWith('data:image/') ? `<img class="d-cardimg" alt="" src="${esc(o.image)}">` : '';
      c.innerHTML = `${image || (o.icon && ICONS[o.icon] ? `<span class="d-cardic">${ICONS[o.icon]}</span>` : '')}<span class="d-cardlbl">${esc(o.label)}</span>${o.level ? `<b class="d-level">${esc(o.level)}</b>` : ''}`;
      c.addEventListener('click', () => { sfx.tick(); pick(i, true); });
      cards.appendChild(c);
      setTimeout(() => sfx.blub(), i * 70);
    });
    body.appendChild(cards);
    const row = Object.assign(document.createElement('div'), { className: 'd-row' });
    row.appendChild(pill(input.confirm, true, () => settleDialog(it, { index: it.value ?? 0 })));
    body.appendChild(row);
    pick(typeof input.value === 'number' ? input.value : 0, false);
  } else if (input.kind === 'text') {
    const form = Object.assign(document.createElement('form'), { className: 'd-field' });
    form.innerHTML = `<input type="${input.secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false" maxlength="${Number(input.maxLength) || 200}">${input.secret ? `<button class="d-peek" type="button" aria-label="${esc(t('bubble.peek'))}" title="${esc(t('bubble.peek'))}">${ICONS.eye}</button>` : ''}<button class="d-send" type="submit"></button>`;
    const field = form.querySelector('input');
    field.placeholder = input.placeholder || '';
    field.value = input.value || '';
    if (Array.isArray(input.suggestions) && input.suggestions.length && !input.secret) {
      const list = document.createElement('datalist');
      list.id = `d-list-${it.id}`;
      for (const s of input.suggestions) list.appendChild(Object.assign(document.createElement('option'), { value: String(s) }));
      form.appendChild(list);
      field.setAttribute('list', list.id);
    }
    field.setAttribute('aria-label', it.text);
    form.querySelector('.d-send').textContent = input.submit;
    form.querySelector('.d-peek')?.addEventListener('click', (e) => {
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      e.currentTarget.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      field.focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = field.value.trim();
      if (!v) { form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); field.focus(); return; }
      settleDialog(it, { text: v });
    });
    body.appendChild(form);
    if (input.link || input.alt) {
      const row = Object.assign(document.createElement('div'), { className: 'd-links' });
      if (input.link) {
        const a = Object.assign(document.createElement('a'), { className: 'd-link', href: input.link.url, target: '_blank', rel: 'noopener' });
        a.innerHTML = `<span></span>${ICONS.external}`;
        a.querySelector('span').textContent = input.link.label;
        row.appendChild(a);
      }
      if (input.alt) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'd-alt', textContent: input.alt });
        b.addEventListener('click', () => settleDialog(it, { alt: true }));
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    // the window takes the keyboard so the box can be typed in right away
    host?.focus?.();
    setTimeout(() => field.focus(), 30);
  } else if (input.kind === 'progress') {
    body.innerHTML = `<div class="d-bar${typeof it.progress === 'number' ? '' : ' wait'}"><i></i></div><div class="d-barlbl"><span></span><b></b></div>`;
    body.querySelector('.d-barlbl span').textContent = input.label || '';
    drawProgress(it);
  }
  body.hidden = false;
  body.querySelector('.d-send, .d-pill.primary')?.focus?.({ preventScroll: true });
}

function pill(label, primary, onClick) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: `d-pill${primary ? ' primary' : ''}`, textContent: label });
  b.addEventListener('click', onClick);
  return b;
}

function drawProgress(it) {
  const bar = bubble.querySelector('.d-bar');
  if (!bar) return;
  const p = it.progress;
  bar.classList.toggle('wait', typeof p !== 'number');
  bar.querySelector('i').style.width = typeof p === 'number' ? `${Math.round(clamp(p, 0, 1) * 100)}%` : '';
  bubble.querySelector('.d-barlbl b').textContent = typeof p === 'number' ? `${Math.floor(clamp(p, 0, 1) * 100)}%` : '';
}

function updateDialog(m) {
  const it = item?.kind === 'dialog' && item.id === m.id ? item : queue.find((q) => q.kind === 'dialog' && q.id === m.id);
  if (!it) return;
  if ('progress' in m) it.progress = m.progress;
  if (typeof m.text === 'string') {
    it.d = { ...it.d, text: m.text };
    if (it === item) { it.text = m.text; it.shown = 0; it.acc = 0; }
  }
  if (it === item) drawProgress(it);
}

function endDialog(id) {
  const i = queue.findIndex((q) => q.kind === 'dialog' && q.id === id);
  if (i >= 0) queue.splice(i, 1);
  if (item?.kind === 'dialog' && item.id === id) closeBubble();
}

function settleDialog(it, answer) {
  if (item !== it || it.answered) return;
  it.answered = true;
  send({ t: 'dialog', id: it.id, ...answer });
  if (answer.done) { closeBubble(); return; }
  sfx.select();
  bubble.querySelectorAll('button, input').forEach((n) => { n.disabled = true; });
  if ('index' in answer) bubble.querySelectorAll('.d-pill')[answer.index]?.classList.add('chosen');
  // the chosen button shows a moment; the app's next step waits in the queue meanwhile
  setTimeout(() => { if (item === it) closeBubble(); }, 260);
}

/** Coo shows the picked card's motion near the pinned bubble: standing still, strolling, or running about. */
function stepTalkMotion() {
  const it = item;
  if (it?.kind !== 'dialog') return;
  holdRoam(20);
  const l = at();
  if (!talk.motion || it.pinX === undefined || !l || l.busy || T < talk.next || l.mode !== 'idle') return;
  const home = it.pinX, R = Math.min(TALK_RANGE, innerWidth * .25);
  if (talk.motion === 'still') {
    if (Math.abs(l.x - home) > 30) body.walk(home, false, 0);
    talk.next = T + 1;
    return;
  }
  const run = talk.motion === 'run';
  if (run && Math.random() < .3 && words.has('hop')) { body.do('hop'); talk.next = T + .5; return; }
  // to the other side of the bubble each time, so every move is plain to see
  const x = l.x < home ? home + R * (.4 + Math.random() * .6) : home - R * (.4 + Math.random() * .6);
  body.walk(clamp(x, 40, innerWidth - 40), run, 0);
  talk.next = T + (run ? .1 : 1.2 + Math.random() * 1.2);
}

/* ---------- typed input: the hover button, or double-click when switched on ---------- */
function openInput() {
  closeMenu();
  if (item && item.kind === 'ask' && !item.answered) return;
  if (item) closeBubble();
  item = { kind: 'input' };
  const expand = prefs.bot?.buttons?.chat
    ? `<button class="b-expand" type="button" aria-label="${esc(t('bubble.expand'))}" title="${esc(t('bubble.expand'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg></button>`
    : '';
  openBubble('ask', `<button class="b-close" type="button" aria-label="${esc(t('bubble.close'))}">×</button><form class="b-own"><input type="text" maxlength="500" autocomplete="off" placeholder="${esc(t('bubble.typePlaceholder'))}" aria-label="${esc(t('bubble.typeLabel'))}">${expand}<button type="submit">${esc(t('bubble.send'))}</button></form>`);
  const form = bubble.querySelector('form'), input = form.querySelector('input');
  bubble.querySelector('.b-close').addEventListener('click', () => closeBubble());
  // the chat page takes longer text and images; the draft goes with it
  bubble.querySelector('.b-expand')?.addEventListener('click', () => {
    send({ t: 'expand', text: input.value });
    closeBubble();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    send({ t: 'text', text: v });
    sfx.select(); body?.cue('cheer');
    closeBubble();
  });
  host?.focus?.();
  setTimeout(() => input.focus(), 30);
}

/* ---------- listening ---------- */
/** `text` is settled, `interim` the sentence still being heard (Windows' recognizer reports it as it goes). */
const listen = { phase: null, text: '', interim: '', closeAt: 0 };
function onListen(m) {
  // the quick tap before a talk key is held: Coo perks up, and the hold that follows starts listening
  if (m.phase === 'ready') {
    if (listen.phase) return;
    sfx.tick();
    body?.cue('perk');
    return;
  }
  if (m.phase === 'start') {
    if (!listen.phase) sfx.listenStart();
    listen.phase = 'hearing'; listen.closeAt = 0;
    setBody({ listening: true });
    showHeard(listen.text, true, undefined, listen.interim);
  } else if (m.phase === 'transcribing') {
    listen.phase = listen.phase || 'hearing';
    showHeard(listen.text, true, undefined, listen.interim);
  } else if (m.phase === 'partial') {
    listen.text = m.text || '';
    listen.interim = m.interim || '';
    showHeard(listen.text, true, undefined, listen.interim);
  } else if (m.phase === 'heard') {
    listen.text = m.text || ''; listen.interim = '';
    listen.phase = 'done';
    showHeard(listen.text, false, t('heard.done'));
    sfx.listenEnd();
    setBody({ listening: false });
    body?.cue('heard');
    listen.closeAt = T + 2.2;
  } else if (m.phase === 'none') {
    if (listen.phase === 'done') return;
    listen.phase = null; listen.text = ''; listen.interim = '';
    heardEl.hidden = true; trail.hidden = true;
    setBody({ listening: false });
  }
}
/** `text` is settled; `interim` is the sentence still being heard, greyed, and may still change. */
function showHeard(text, live, hint, interim = '') {
  heardEl.hidden = false; trail.hidden = false;
  heardEl.innerHTML = `<p class="b-text"><span class="fin"></span><span class="interim"></span>${live ? '<span class="caret" aria-hidden="true"></span>' : ''}</p><span class="b-hint"></span>`;
  heardEl.querySelector('.fin').textContent = text;
  // a space only before Latin text that follows Latin text or ASCII punctuation; Chinese sentences run on
  heardEl.querySelector('.interim').textContent = text && interim && /[A-Za-z0-9.,!?;:]$/.test(text) && /^[A-Za-z0-9]/.test(interim) ? ' ' + interim : interim;
  heardEl.querySelector('.b-hint').textContent = hint || t(text || interim ? 'heard.more' : 'heard.listening');
}
function stepListen() {
  if (listen.phase === 'done' && T > listen.closeAt) {
    listen.phase = null; listen.text = ''; listen.interim = '';
    heardEl.hidden = true; trail.hidden = true;
  }
}

/* ---------- activity: the same bubble, with conversation always taking priority ---------- */
const status = { wanted: null, since: 0, shown: null, shownAt: 0, fadeAt: null };
function setStatus(next) {
  setBody({ thinking: next?.kind === 'think' });
  const prev = status.wanted;
  if (prev?.kind === next?.kind && prev?.text === next?.text && prev?.detail === next?.detail && prev?.count === next?.count) return;
  if (prev?.kind !== next?.kind) status.since = T;
  status.wanted = next;
}
function drawStatus(next, pop) {
  const icon = next.kind;
  if (!bubble.classList.contains('status') || bubble.dataset.icon !== icon) {
    bubble.className = 'bubble status';
    bubble.dataset.icon = icon;
    bubble.innerHTML = `<span class="status-icon">${ICONS[`status_${icon}`] || ICONS.status_work}</span><span class="status-text"></span>`;
  }
  bubble.dataset.kind = next.kind;
  const label = next.text + (next.detail ? ` · ${next.detail}` : '') + (next.count > 1 ? t('status.more', { others: next.count - 1 }) : '');
  bubble.querySelector('.status-text').textContent = label;
  bubble.setAttribute('aria-label', next.kind === 'think' ? t('status.thinking') : label);
  bubble.classList.remove('fading');
  bubble.hidden = false;
  if (pop) { bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
}
function stepStatus() {
  // Never replace dialogue with activity, including while a queued line waits for the body.
  if (!prefs.statusBubble || !heardEl.hidden || item || queue.length) {
    if (bubble.classList.contains('status')) bubble.hidden = true;
    status.shown = null; status.fadeAt = null;
    return;
  }
  if (status.fadeAt !== null && T - status.fadeAt >= .2) {
    bubble.hidden = true;
    status.shown = null; status.fadeAt = null;
  }
  const next = status.wanted, shown = status.shown;
  if (next?.kind === 'think' && T - status.since < .6) return;
  if (shown && next && shown.kind === next.kind && shown.text === next.text) {
    if (shown !== next || status.fadeAt !== null) drawStatus(next, false);
    status.shown = next; status.fadeAt = null;
  } else if (!shown || T - status.shownAt >= 1.2) {
    if (next) {
      drawStatus(next, shown?.kind !== next.kind);
      status.shown = next; status.shownAt = T; status.fadeAt = null;
    } else if (shown && status.fadeAt === null) {
      status.fadeAt = T;
      bubble.classList.add('fading');
    }
  }
}

/* ---------- microphone ---------- */
let mic = null;
async function startMic() {
  if (mic) return;
  mic = { starting: true };
  // 拿到一半就失败时也要停麦关声卡,否则录音指示灯常亮到页面刷新
  let stream = null, ctx = null;
  try {
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (prefs.micDevice) audio.deviceId = { exact: prefs.micDevice };
    stream = await navigator.mediaDevices.getUserMedia({ audio });
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule('/web/mic-worklet.js');
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pet-mic');
    node.port.onmessage = (e) => { if (ws && ws.readyState === 1) ws.send(e.data); };
    src.connect(node);
    if (!prefs.mic || !mic) { stream.getTracks().forEach((t) => t.stop()); ctx.close(); mic = null; return; }
    mic = { stream, ctx, node };
    send({ t: 'mic', state: 'on', detail: stream.getAudioTracks()[0]?.label || null });
    void reportDevices();
  } catch (err) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close();
    mic = null;
    send({ t: 'mic', state: err && err.name === 'NotAllowedError' ? 'denied' : 'error', detail: String(err && err.message || err) });
  }
}
/** Device labels are readable only after microphone access was granted. */
async function reportDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  send({ t: 'devices', list: all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => ({ id: d.deviceId, label: d.label })) });
}
navigator.mediaDevices?.addEventListener('devicechange', () => { if (mic && !mic.starting) void reportDevices(); });
function stopMic() {
  const m = mic;
  mic = null;
  if (!m || m.starting) return;
  m.stream.getTracks().forEach((t) => t.stop());
  m.ctx.close();
  send({ t: 'mic', state: 'off' });
}

/* ---------- actions: the menu's lower zone and the hover buttons draw from one list ---------- */
const ROAM_ORDER = ['off', 'calm', 'free'];
const roamName = (id) => (ROAM_ORDER.includes(id) ? t(`roam.${id}`) : '');
const roamLevel = (id) => (ROAM_ORDER.includes(id) ? t(`roam.level.${id}`) : '');
/** The voice button's badge: `auto` when listening all the time, else the talk key (`Alt×2`). */
const micBadge = () => (prefs.voice.mode === 'always' ? 'auto' : prefs.voice.key || 'key');
/** Most hover buttons shown beside the pet. */
const MAX_HOVER = 6;

/**
 * Every button the menu and the hover buttons can show, in the menu's order. `icon`, `state` and
 * `on` read the current prefs: `state` is the line that says what the button does and where it
 * stands, `on` lights a switch that is on (undefined for plain actions). `keep` leaves the menu
 * open after a click, so a switch shows its new state there.
 */
const ACTIONS = {
  chat: {
    icon: () => ICONS.chat,
    state: () => t(prefs.doubleClickChat ? 'action.chatDoubleClick' : 'action.chat'),
    run: () => openInput(),
  },
  voice: {
    keep: true,
    icon: () => (prefs.voice.enabled ? ICONS.mic : ICONS.micOff),
    badge: () => (prefs.voice.enabled ? micBadge() : ''),
    on: () => prefs.voice.enabled,
    state: () => (!prefs.voice.enabled ? t('action.voiceOff')
      : !prefs.voice.ready ? t('action.voiceNotReady', { detail: prefs.voice.detail || t('action.voiceNoService') })
      : t('action.voiceOn', { mode: t(prefs.voice.mode === 'always' ? 'action.voiceAlways' : 'action.voiceKey'), hint: prefs.voice.hint || '' })),
    run: () => toggleVoice(),
  },
  roam: {
    keep: true,
    icon: () => ICONS[`roam_${prefs.roam}`] ?? ICONS.roam_calm,
    state: () => {
      const next = ROAM_ORDER[(ROAM_ORDER.indexOf(prefs.roam) + 1) % ROAM_ORDER.length];
      return t('action.roam', { level: roamLevel(prefs.roam), name: roamName(prefs.roam), next: roamName(next) });
    },
    run: () => cycleRoam(),
  },
  theme: {
    keep: true,
    icon: () => (prefs.theme === 'dark' ? ICONS.moon : ICONS.sun),
    on: () => prefs.theme === 'dark',
    state: () => t(prefs.theme === 'dark' ? 'action.themeDark' : 'action.themeLight'),
    run: () => toggleTheme(),
  },
  sound: {
    keep: true,
    icon: () => (prefs.sound ? ICONS.sound : ICONS.soundOff),
    on: () => prefs.sound,
    state: () => t(prefs.sound ? 'action.soundOn' : 'action.soundOff'),
    run: () => send({ t: 'prefs', sound: !prefs.sound }),
  },
  dress: {
    icon: () => ICONS.shirt, cls: 'dress',
    state: () => t('action.dress'),
    // an embedding app that lends dressing shows its own dress page; otherwise the pet's dress window
    run: () => {
      if (prefs.bot?.buttons?.dress) send({ t: 'control', action: 'dress' });
      else if (host?.openDress) host.openDress();
      else window.open('/dress', '_blank');
    },
  },
  hide: {
    icon: () => ICONS.eyeOff, available: () => !!host?.hide,
    state: () => t('action.hide'),
    run: () => host.hide(),
  },
};
const available = (id) => ACTIONS[id] && (ACTIONS[id].available?.() ?? true);

/** One action as a button: its icon, the badge, and whether a switch is on. */
function drawAction(b, id) {
  const a = ACTIONS[id], on = a.on?.();
  const badge = a.badge?.() ?? '';
  b.querySelector('.ic').innerHTML = a.icon() + (badge ? `<b class="badge">${badge}</b>` : '');
  b.classList.toggle('on', on === true);
  b.classList.toggle('off', on === false);
  b.title = a.state();
  b.setAttribute('aria-label', b.title);
  if (on !== undefined) b.setAttribute('aria-pressed', String(on));
}

function cycleRoam() {
  const roam = ROAM_ORDER[(ROAM_ORDER.indexOf(prefs.roam) + 1) % ROAM_ORDER.length];
  applyPrefs({ roam });
  send({ t: 'prefs', roam });
}

function toggleTheme() {
  const theme = prefs.theme === 'dark' ? 'light' : 'dark';
  applyPrefs({ theme });
  send({ t: 'prefs', theme });
}

function toggleVoice() {
  const on = !prefs.voice.enabled;
  // shown at once; the World's next prefs confirm it
  prefs.voice = { ...prefs.voice, enabled: on };
  refreshButtons();
  send({ t: 'prefs', mic: on });
}

/* ---------- menu: the bot and its run controls on top, the actions below; every entry is a round icon button ---------- */
function openMenu(x, y) {
  menu.innerHTML = '';
  menu.appendChild(Object.assign(document.createElement('div'), { className: 'm-head' }));
  renderMenuHead();
  const grid = Object.assign(document.createElement('div'), { className: 'm-grid' });
  for (const id of Object.keys(ACTIONS)) {
    if (!available(id)) continue;
    const a = ACTIONS[id];
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.className = `m-tile${a.cls ? ' ' + a.cls : ''}`;
    b.dataset.action = id;
    b.innerHTML = '<span class="ic"></span>';
    drawAction(b, id);
    b.addEventListener('click', () => {
      sfx.tick();
      if (!a.keep) closeMenu();
      a.run();
      if (a.keep) drawAction(b, id);
    });
    grid.appendChild(b);
  }
  menu.append(grid);
  menu.style.width = '';
  menu.hidden = false;
  // focused, so a click anywhere else blurs the window and folds the menu
  host?.focus?.();
  // held at its opening width: the quit confirmation in the header must not widen the menu
  menu.style.width = getComputedStyle(menu).width;
  // layout size: the opening animation scales the box, so its bounding rect is still shrunk here
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = f(clamp(x, 8, innerWidth - w - 8)) + 'px';
  menu.style.top = f(clamp(y - h, 8, innerHeight - h - 8)) + 'px';
}

/**
 * Avatar and name, then the run controls the embedding app lends, as in the console's rail foot:
 * pause/resume, settings and the power button (which asks first). Without a bot the name is Coo's.
 */
function renderMenuHead(confirmQuit = false) {
  const head = menu.querySelector('.m-head'), bot = prefs.bot || {};
  if (!head) return;
  head.classList.toggle('confirm', confirmQuit);
  head.innerHTML = '<span class="m-avatar"></span><span class="m-name"></span><span class="m-acts"></span>';
  head.querySelector('.m-avatar').innerHTML = bot.avatar
    ? `<img alt="" src="/api/avatar?v=${encodeURIComponent(bot.avatar)}">`
    : `<svg viewBox="18 18 220 220" aria-hidden="true">${mini('neutral', skin)}</svg>`;
  const name = head.querySelector('.m-name');
  name.textContent = name.title = confirmQuit ? bot.quitPrompt : (bot.name || 'Coo');
  const acts = head.querySelector('.m-acts');
  const act = (iconHtml, label, fn, cls = 'm-act') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.title = label; b.setAttribute('aria-label', label);
    b.innerHTML = iconHtml;
    b.addEventListener('click', (e) => { e.stopPropagation(); sfx.tick(); fn(); });
    acts.appendChild(b);
  };
  if (!bot.controls) return;
  if (confirmQuit) {
    act(ICONS.power, bot.quitLabel, () => { closeMenu(); send({ t: 'control', action: 'quit' }); }, 'm-act danger');
    act(`<span>${esc(t('menu.cancel'))}</span>`, t('menu.cancel'), () => renderMenuHead(), 'm-act text');
    return;
  }
  // only the controls the embedding app lent; a server without `buttons` lends all three
  const has = bot.buttons ?? { pause: true, settings: true, quit: true };
  if (has.pause) act(bot.paused ? ICONS.play : ICONS.pause, t(bot.paused ? 'menu.resume' : 'menu.pause'), () => send({ t: 'control', action: bot.paused ? 'resume' : 'pause' }), `m-act run${bot.paused ? ' paused' : ''}`);
  if (has.settings) act(ICONS.settings, t('menu.settings'), () => { closeMenu(); send({ t: 'control', action: 'settings' }); });
  if (has.quit) act(ICONS.power, bot.quitLabel, () => renderMenuHead(true), 'm-act power');
}
function closeMenu() { menu.hidden = true; }

/** Redraws whatever shows an action: the open menu's tiles and the hover buttons. */
function refreshButtons() {
  for (const b of menu.querySelectorAll('.m-tile')) drawAction(b, b.dataset.action);
  renderTools();
}

/* ---------- hover buttons: the actions chosen in settings (chat and voice by default), beside the pet ---------- */
/** Seconds the buttons stay after the pointer leaves both the pet and them. */
const TOOLS_LINGER = .8;
/** Milliseconds the voice button is held before what was heard goes out. */
const HOLD_TO_SEND = 500;
let toolsUntil = 0;
let toolIds = '';

function renderTools() {
  const ids = prefs.hoverButtons.filter(available).slice(0, MAX_HOVER);
  if (ids.join(',') !== toolIds) {
    toolIds = ids.join(',');
    endHold();
    tools.innerHTML = '';
    // up to three in a column, then a second column
    tools.style.gridTemplateRows = `repeat(${Math.min(3, Math.max(1, ids.length))}, auto)`;
    for (const id of ids) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tool'; b.dataset.action = id;
      b.innerHTML = '<span class="ic"></span>';
      if (id === 'voice') wireVoiceTool(b);
      else b.addEventListener('click', () => { sfx.tick(); if (!ACTIONS[id].keep) toolsUntil = 0; ACTIONS[id].run(); refreshButtons(); });
      tools.appendChild(b);
    }
  }
  for (const b of tools.children) drawAction(b, b.dataset.action);
  const mic = tools.querySelector('[data-action="voice"]');
  if (mic) mic.classList.toggle('waiting', prefs.voice.enabled && !prefs.voice.ready);
}

/** A press shorter than HOLD_TO_SEND switches voice input; a longer one sends what was heard so far. */
const hold = { timer: 0, sent: false, el: null };
function endHold() {
  clearTimeout(hold.timer);
  hold.timer = 0;
  hold.el?.classList.remove('holding');
}
function wireVoiceTool(b) {
  b.style.setProperty('--hold', HOLD_TO_SEND + 'ms');
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    hold.sent = false; hold.el = b;
    if (!prefs.voice.enabled || !prefs.voice.ready) return;
    b.classList.add('holding');
    hold.timer = setTimeout(() => {
      endHold();
      hold.sent = true;
      send({ t: 'commit' });
      sfx.select();
      b.classList.remove('sent'); void b.offsetWidth; b.classList.add('sent');
    }, HOLD_TO_SEND);
  });
  b.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    const sent = hold.sent;
    endHold();
    hold.sent = false;
    if (!sent) { toggleVoice(); sfx.tick(); }
  });
  b.addEventListener('pointerleave', () => { endHold(); hold.sent = true; });
  b.addEventListener('pointercancel', () => { endHold(); hold.sent = true; });
  // the pointer handlers act on mouse and touch; a click with no pointer is the keyboard
  b.addEventListener('click', (e) => { if (e.detail === 0) { toggleVoice(); sfx.tick(); } });
}

/** Where the cursor is, in page pixels, or null when it is off the page. */
const cursor = { at: null };
function overTools(p) {
  if (tools.hidden) return false;
  const r = tools.getBoundingClientRect();
  // the gaps between the buttons and a little margin count too
  return p.x >= r.left - 6 && p.x <= r.right + 6 && p.y >= r.top - 6 && p.y <= r.bottom + 6;
}
function stepTools() {
  // shown while the cursor is on the pet or on the buttons, and a moment after it leaves; decided
  // from where the cursor is now, not from the last move event, which may be stale
  const p = cursor.at;
  const l = at();
  if (p && (body?.hit(p) || overTools(p))) toolsUntil = T + TOOLS_LINGER;
  tools.hidden = !(T < toolsUntil && l && !l.pressing && !l.busy && menu.hidden && toolIds !== '');
  if (tools.hidden) endHold();
  tools.querySelector('[data-action="voice"]')?.classList.toggle('live', listen.phase === 'hearing');
}

/* ---------- pointer ---------- */
let pointerSeen = false;
const lastPointer = { x: 0, y: 0 };
let interactive = null;
/** `by`: which check decided, 'move' (the page's pointermove) or 'poll' (the window's cursor report). */
function setInteractive(on, by) {
  if (!host || interactive === on) return;
  interactive = on;
  host.setInteractive(on);
  logPointer('flip', by);
}

/**
 * Pointer diagnostics, one console line `[pointer] {json}` that reaches the run log: each time the
 * window switches between taking the mouse and passing it through, with what both checks last saw
 * (position, hit on the body or the UI, how long ago, and the pointerType of the move), and each
 * time the pointerType of the moves changes.
 */
const diag = { move: null, poll: null, type: '', types: new Set(), skipped: 0, lastAt: -Infinity, timer: 0, held: null };
/**
 * Fewest milliseconds between two lines; the lines in between are counted into the next one, and
 * the last of them is written once the gap has passed. A flickering pointer flips the window at
 * the cursor report rate (10 a second) or faster; one line a second still names the check that
 * flipped it, and an hour of flicker stays under 3600 lines.
 */
const POINTER_LOG_EVERY_MS = 1000;
function logPointer(event, by) {
  const now = performance.now(), wait = POINTER_LOG_EVERY_MS - (now - diag.lastAt);
  diag.held = { event, by };
  if (wait <= 0) { writePointer(now); return; }
  diag.skipped++;
  diag.timer ||= setTimeout(() => { diag.skipped--; writePointer(performance.now()); }, wait);
}
/** What a check last saw, with how many milliseconds ago in place of when. */
function seen(s, now) {
  if (!s) return null;
  const { at, ...rest } = s;
  return { ...rest, ageMs: Math.round(now - at) };
}
function writePointer(now) {
  clearTimeout(diag.timer);
  diag.timer = 0;
  const c = at()?.side ?? { x: 0, y: 0 };
  console.log('[pointer] ' + JSON.stringify({
    ...diag.held, interactive, pressing: !!at()?.pressing,
    move: seen(diag.move, now), poll: seen(diag.poll, now),
    pet: { x: Math.round(c.x), y: Math.round(c.y) },
    types: [...diag.types], skipped: diag.skipped,
  }));
  diag.lastAt = now;
  diag.skipped = 0;
  diag.types.clear();
}

const UI_SELECTOR = '.bubble:not(.status):not([hidden]), .menu:not([hidden]), .tools:not([hidden])';
const overUi = (e) => e.target.closest && e.target.closest(UI_SELECTOR);
document.addEventListener('pointermove', (e) => {
  pointerSeen = true;
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  const p = { x: e.clientX, y: e.clientY };
  cursor.at = p;
  // while the window moves to another display, moves may come in either display's coordinates; the drag shifts over once it has moved
  if (!shifting) body?.pointer('move', { ...p, t: e.timeStamp });
  const hit = !!body?.hit(p), ui = !!overUi(e);
  diag.move = { at: performance.now(), type: e.pointerType, x: Math.round(p.x), y: Math.round(p.y), hit, ui };
  diag.types.add(e.pointerType);
  if (e.pointerType !== diag.type) {
    const first = !diag.type;
    diag.type = e.pointerType;
    if (!first) logPointer('type', 'move');
  }
  setInteractive(pressing || hit || ui, 'move');
  followDrag(p);
});
/**
 * The pet window also reports where the cursor is on its own, a few times a second: a click-through
 * window may miss the move that takes the cursor off the pet (onto the taskbar, another screen),
 * and the hover buttons would then stay.
 */
host?.onCursor?.((p) => {
  cursor.at = p;
  if (!p) {
    diag.poll = { at: performance.now(), off: true };
    if (!pressing) setInteractive(false, 'poll');
    return;
  }
  const el = document.elementFromPoint(p.x, p.y);
  const hit = !!body?.hit(p), ui = !!el?.closest?.(UI_SELECTOR);
  diag.poll = { at: performance.now(), x: p.x, y: p.y, hit, ui };
  setInteractive(pressing || hit || ui, 'poll');
});
/** A press that began on the body and has not been let go of: the window keeps the mouse meanwhile. */
let pressing = false;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  closeMenu();
  const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  body?.pointer('down', p);
  if (body?.hit(p)) { pressing = true; stage.setPointerCapture(e.pointerId); e.preventDefault(); }
});
const up = (e) => { pressing = false; body?.pointer('up', { x: e?.clientX ?? lastPointer.x, y: e?.clientY ?? lastPointer.y, t: e?.timeStamp ?? performance.now() }); stage.style.cursor = ''; };
/**
 * Most milliseconds a drop on another display waits for the page to take the window's new size
 * (within a pixel: fractional scales round it). The size normally arrives a frame or two after
 * the move; the cap ends the wait when the window settled at some other size, and the pet then
 * drops inside whatever size the page has.
 */
const RESIZE_WAIT_MS = 1000;
/** Waits until the page has the window size `to` gives, or RESIZE_WAIT_MS has passed, then lays the stage out again. */
async function settleSize(to) {
  const t0 = performance.now();
  while ((Math.abs(innerWidth - to.w) > 1 || Math.abs(innerHeight - to.h) > 1) && performance.now() - t0 < RESIZE_WAIT_MS) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  body?.set({ bounds: bounds() });
}
const outside = (p) => p.x < 0 || p.y < 0 || p.x >= innerWidth || p.y >= innerHeight;
/** A move of the window onto the display under the cursor, while one is under way. */
let following = null;
/** True from asking for that move until the drag has shifted into the new coordinates. */
let shifting = false;
/**
 * A drag carried past the window's edge: over another display the window moves there at once, so
 * the held pet stays in sight instead of being cut off at the edge until it is let go of.
 */
function followDrag(p) {
  if (following || at()?.mode !== 'drag' || !host?.followCursor || !outside(p)) return;
  shifting = true;
  following = (async () => {
    const to = await host.followCursor().catch(() => null);
    shifting = false;
    if (!to) return;
    body?.shift(to.dx, to.dy);
    await settleSize(to);
  })().finally(() => { following = null; shifting = false; });
}
stage.addEventListener('pointerup', async (e) => {
  // the window was moving under the cursor: the release point is in the coordinates it left behind
  if (following) { await following; up(); return; }
  if (!outside({ x: e.clientX, y: e.clientY }) || at()?.mode !== 'drag' || !host?.followCursor) { up(e); return; }
  // let go of past the window's edge in one move: over another display the window follows and the pet drops there
  const to = await host.followCursor().catch(() => null);
  if (!to) { up(e); return; }
  pressing = false;
  stage.style.cursor = '';
  // until the drop the body and bubbles still stand in the old display's coordinates
  document.body.style.visibility = 'hidden';
  try {
    await settleSize(to);
    body?.drop({ x: to.x, y: to.y });
  } finally {
    document.body.style.visibility = '';
  }
});
stage.addEventListener('pointercancel', up);
document.addEventListener('pointerleave', () => { cursor.at = null; body?.pointer('leave', {}); });
stage.addEventListener('dblclick', (e) => { if (prefs.doubleClickChat && body?.hit({ x: e.clientX, y: e.clientY })) openInput(); });
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (body?.hit({ x: e.clientX, y: e.clientY })) openMenu(e.clientX, e.clientY);
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu')) closeMenu(); }, { capture: true });
// clicks off the figure pass through the window to what is underneath; the window losing focus is how they show here
window.addEventListener('blur', closeMenu);
document.addEventListener('focusin', (e) => {
  if (e.target.matches?.('input, textarea')) host?.focus?.();
});
document.addEventListener('keydown', (e) => {
  // Escape and number keys belong to the input method while choosing a candidate.
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Escape') {
    closeMenu();
    if (item && item.kind === 'ask') dismissAsk();
    else if (item && item.kind === 'input') closeBubble();
    return;
  }
  const typing = e.target.closest && e.target.closest('input');
  // the digit row or the number pad, whether or not Num Lock is on
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code) || /^([1-9])$/.exec(e.key);
  if (item && item.kind === 'ask' && item.optsShown && !item.answered && !typing && digit && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const b = bubble.querySelectorAll('.b-opt')[+digit[1] - 1];
    if (b) b.click();
  }
});

/* ---------- layout ---------- */
function place(el, a, extraUp, side) {
  const bw = el.offsetWidth, bh = el.offsetHeight;
  const cx = a.x + side * (bw / 2 + 10);
  const left = clamp(cx - bw / 2 + (side ? 0 : (at()?.facing ?? 1) * 26), 10, Math.max(10, innerWidth - bw - 10));
  const top = Math.max(8, a.y - bh - extraUp);
  el.style.left = f(left) + 'px';
  el.style.top = f(top) + 'px';
  el.style.setProperty('--tail', f(clamp(a.x - left, 22, bw - 22)) + 'px');
  return { left, top, bw, bh };
}
function placeTalk(it, a) {
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  const left = clamp(it.pinX - bw / 2, 10, Math.max(10, innerWidth - bw - 10));
  const top = Math.max(8, it.pinY - bh - 18);
  bubble.style.left = f(left) + 'px';
  bubble.style.top = f(top) + 'px';
  bubble.style.setProperty('--tail', f(clamp(a.x - left, 22, bw - 22)) + 'px');
  return { left, top, bw, bh };
}

/** Beside the body, on the right unless that runs off the screen. */
function placeTools(l) {
  const c = l.side, reach = l.side.reach + 10;
  const w = tools.offsetWidth, h = tools.offsetHeight;
  const left = c.x + reach + w <= innerWidth - 8 ? c.x + reach : c.x - reach - w;
  tools.style.left = f(clamp(left, 8, innerWidth - w - 8)) + 'px';
  tools.style.top = f(clamp(c.y - h / 2, 8, innerHeight - h - 8)) + 'px';
}
function layout() {
  const l = at();
  if (!l) return;
  stage.style.cursor = l.cursor;
  if (!tools.hidden) placeTools(l);
  const a = l.bubble;
  let sayBox = null;
  // choice cards keep their bubble where it was; its tail follows Coo along the bottom edge
  if (!bubble.hidden && item?.kind === 'dialog' && item.pinX !== undefined) sayBox = placeTalk(item, a);
  else if (!bubble.hidden) sayBox = place(bubble, a, 18, 0);
  if (!heardEl.hidden) {
    const side = sayBox ? -l.facing : 0;
    const r = place(heardEl, a, 46, side);
    const bx = r.left + r.bw / 2, by = r.top + r.bh;
    [...trail.children].forEach((d, i) => {
      const k = [.22, .5, .78][i], sz = [7, 10, 13][i];
      d.style.width = d.style.height = sz + 'px';
      d.style.left = f(a.x + (bx - a.x) * k - sz / 2) + 'px';
      d.style.top = f(a.y - 4 + (by + 4 - a.y + 4) * k - sz / 2) + 'px';
    });
  }
}

/* ---------- backdrop: a light gray halo when the body melts into what is behind it ---------- */
/** Seconds between looks at the screen around the body. */
const BACKDROP_EVERY = .8;
/** OKLab distance under which a backdrop pixel counts as the body's color. */
const SAME_COLOR = .15;
/** Share of such pixels around the body that turns the halo on (most of them), and the share it turns off below. */
const HALO_ON = .6, HALO_OFF = .45;
/** The halo's opacity when fully on. */
const HALO_STRENGTH = .5;
// a window host too old to sample the screen keeps the halo on; a browser tab draws its own wall
const backdrop = { on: !!host && !host.sampleBackdrop, fixed: !!host && !host.sampleBackdrop, k: 0, busy: false, next: 0 };

const lin = (c) => (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
function oklab(r, g, b) {
  r = lin(r / 255); g = lin(g / 255); b = lin(b / 255);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
/** The body's color as [r, g, b], from `--skin-ink` (#rgb or #rrggbb). */
function inkRgb() {
  let h = getComputedStyle(document.documentElement).getPropertyValue('--skin-ink').trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return /^[0-9a-f]{6}$/i.test(h) ? [n >> 16, (n >> 8) & 255, n & 255] : null;
}
const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d });
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };

/** Samples a ring around the body (past the halo's reach, minus the page's own bubbles) and flips the halo. */
async function probeBackdrop() {
  const ink = inkRgb(), b = at()?.box;
  if (!ink || !b) return;
  const S = bounds().S;
  const near = inflate({ x: b.x, y: b.y, width: b.w, height: b.h }, 4 + 34 * S), far = inflate(near, 8 + 40 * S);
  const x = Math.max(0, far.x), y = Math.max(0, far.y);
  const rect = { x, y, width: Math.min(innerWidth, far.x + far.width) - x, height: Math.min(innerHeight, far.y + far.height) - y };
  const skip = [near, ...[bubble, heardEl, menu, tools].filter((el) => !el.hidden).map(rectOf)];
  const px = await host.sampleBackdrop(rect, skip);
  // this platform cannot read the screen cheaply: the halo just stays
  if (px === null) { backdrop.on = true; backdrop.fixed = true; return; }
  const n = px.length / 3;
  if (n < 24) return;
  const [L, A, B] = oklab(...ink);
  let same = 0;
  for (let i = 0; i < px.length; i += 3) {
    const [l, a, b] = oklab(px[i], px[i + 1], px[i + 2]);
    if (Math.hypot(l - L, a - A, b - B) < SAME_COLOR) same++;
  }
  const share = same / n;
  backdrop.on = backdrop.on ? share >= HALO_OFF : share > HALO_ON;
}
function stepBackdrop(dt) {
  const now = performance.now() / 1000;
  if (host?.sampleBackdrop && !backdrop.fixed && !backdrop.busy && now >= backdrop.next && document.visibilityState === 'visible') {
    backdrop.busy = true;
    probeBackdrop().catch(() => {}).finally(() => { backdrop.busy = false; backdrop.next = performance.now() / 1000 + BACKDROP_EVERY; });
  }
  const k = backdrop.k + ((backdrop.on ? 1 : 0) - backdrop.k) * Math.min(1, dt * 6);
  backdrop.k = k < .005 ? 0 : k;
  // the body is in its own frame: it takes the halo as a CSS filter
  body?.setHalo(backdrop.k * HALO_STRENGTH);
}

/* ---------- loop ---------- */
/**
 * Frames per second: `prefs.frameRate` while the body moves (its layout's `moving`) and always while `lockFrameRate` is on,
 * RESTING_FPS otherwise; a frame rate of 0, or one above the display's, draws on every display refresh. Each frame
 * redraws the whole figure, so the window's CPU and GPU time grows with this rate.
 */
const RESTING_FPS = 30;
/** When the next frame is due (a rAF timestamp), and the gap between frames at the current rate. */
let last = performance.now(), dueAt = 0, gap = 0;
/** The last error the frame loop logged, so one that keeps recurring is reported once, not per frame. */
let frameErr = null;
/**
 * Frames whose timestamp was not past the one before (a zero or negative dt), and when that was last logged (ms):
 * one such frame used to leave the whale without hair, tail and skirt until restart (#87), and where these
 * timestamps come from is not known yet. Logged at most once a minute, with the count so far. The first frame is
 * left out: `last` starts at the page's clock, which may be ahead of the first frame's timestamp.
 */
let stalls = 0, stallLoggedAt = -Infinity, framed = false;
function frame(now) {
  // a display refresh up to a quarter gap early counts as on time, so the rate averages out over refresh rates it does not divide
  if (now < dueAt - gap / 4) { requestAnimationFrame(frame); return; }
  if (framed && now <= last) {
    stalls++;
    if (performance.now() - stallLoggedAt > 60_000) {
      stallLoggedAt = performance.now();
      console.warn(`[pet] 帧时间戳没有前进(累计 ${stalls} 次):now=${now} 上一帧=${last} 页面=${document.visibilityState} 焦点=${document.hasFocus()} 模式=${at()?.mode ?? '-'}`);
    }
  }
  framed = true;
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  try {
    T += dt;
    stepActs();
    stepDialog(dt);
    stepTalkRead();
    stepTalkMotion();
    stepListen();
    stepStatus();
    setBody({ dialogOpen: !!item || !!listen.phase });
    body?.tick(dt);
    stepBackdrop(dt);
    stepTools();
    layout();
  } catch (err) {
    // a throwing step must not take the loop with it: the next frame is only asked for below, and
    // without it the pet freezes for good (a broken figure throws again on every frame it draws)
    const msg = err?.message ?? String(err);
    if (msg !== frameErr) { frameErr = msg; console.error(err); }
  }
  const full = prefs.lockFrameRate || !!at()?.moving;
  // a moving rate of 0 draws on every display refresh
  gap = full ? (prefs.frameRate > 0 ? 1000 / prefs.frameRate : 0) : 1000 / RESTING_FPS;
  // a frame more than a gap late starts the count again instead of drawing the missed ones back to back
  dueAt = now - dueAt > gap ? now + gap : dueAt + gap;
  // moving frames wait on display refreshes: a timer can wake late, which a body at rest hides and a moving one shows as stutter
  if (full) requestAnimationFrame(frame);
  else setTimeout(() => requestAnimationFrame(frame), Math.max(0, dueAt - gap / 4 - performance.now()));
}
addEventListener('pagehide', reportPosition);
requestAnimationFrame(frame);
