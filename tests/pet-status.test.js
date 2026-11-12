import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { clamp, f, ICONS, linked } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { t } from '../packages/cortico-world-desktop-pet/web/i18n.js';
import { SIZE, scaleSlider, sizeEcho } from '../packages/cortico-world-desktop-pet/web/scale-slider.js';
import { sameLook as realSameLook } from '../packages/cortico-world-desktop-pet/web/looks.js';
import { restyle, springSize, swapIn, swapOut } from '../packages/cortico-world-desktop-pet/web/swap-motion.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const source = readFileSync(new URL('pet-app.js', WEB), 'utf8').replace(/^import .*;$/gm, '');
const html = readFileSync(new URL('pet.html', WEB), 'utf8');
const pages = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); });

/** Run the actual page with a quiet socket and body; the test advances the page's frame clock. */
function page({ host = false, hash = '', speech = {}, sfx = {}, fetchLooks = async () => [], sameLook = (a, b) => a === b } = {}) {
  const dom = new JSDOM(html, { url: `http://127.0.0.1/pet${hash}`, runScripts: 'outside-only' });
  const win = dom.window;
  pages.push(win);
  if (host) win.petHost = {};
  const sockets = [];
  const bodyChanges = [];
  const body = {
    layout: { busy: false, facing: 1, cursor: '', x: 450, side: { x: 450, y: 350, reach: 40 }, bubble: { x: 500, y: 400 }, box: { x: 400, y: 300, w: 100, h: 100 } },
    set: (change) => bodyChanges.push(change), cue() {}, talk() {},
  };
  win.requestAnimationFrame = () => 0;
  // scale-slider.js is imported here, in the test's own globals: its frames come from there
  globalThis.requestAnimationFrame ??= () => 0;
  win.fetch = async () => ({ json: async () => [] });
  win.WebSocket = class {
    readyState = 1;
    constructor(url) { this.url = new URL(url); sockets.push(this); }
    send() {}
  };
  win.deps = {
    applyTheme: (theme) => { win.document.documentElement.dataset.theme = theme; }, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document),
    COO_CSS, mini, normalizeSkin, skinCss,
    createSfx: () => ({ unlock() {}, pop() {}, babble() {}, blub() {}, configure() {}, set() {}, setPan() {}, listenStart() {}, listenEnd() {}, select() {}, tick() {}, ...sfx }),
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false, ...speech }),
    textSteps: () => 1,
    loadBody: async () => body, body,
    t, language: () => 'zh', useLanguage: async () => {},
    // the tab's stage (stage.js) is decoration the activity bubble does not depend on
    lightWall() {}, dressFloor() {}, modeButton: () => ({ show() {} }), glowColor: () => null, setGlow() {}, bindAppearance() {}, announcePainted() {},
    createMic: () => ({ start() {}, stop() {} }),
    // the test advances the page's clock itself (`step`)
    runFrames() {},
    fetchLooks, lookAvailable: () => true, lookPicture: () => '', sameLook,
    SIZE, scaleSlider, sizeEcho, restyle, springSize, swapIn, swapOut,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, createSfx, createSpeech, textSteps, loadBody, t, language, useLanguage, lightWall, dressFloor, modeButton, glowColor, setGlow, bindAppearance, announcePainted, createMic, runFrames, fetchLooks, lookAvailable, lookPicture, sameLook, SIZE, scaleSlider, sizeEcho, restyle, springSize, swapIn, swapOut } = window.deps;\n${source}\nbody = window.deps.body; window.page = { onOrder, openInput, openMenu, closeBubble, stepWheel, stepSizer, cursor, step: (dt) => { T += dt; stepDialog(dt); stepLines(); stepStatus(); layout(dt); }, interactive: () => bubble.matches(UI_SELECTOR), lines: () => lines, overUi: (el) => el.matches(UI_SELECTOR), REPLIED_FADE, UNANSWERED_FADE, MAX_LINES };`);
  return { ...win.page, bubble: win.document.querySelector('#bubble'), bodyChanges, doc: win.document, sockets, win };
}

describe('pet page connection', () => {
  it('uses the launch credential and reconnects a replaced desktop window', async () => {
    const p = page({ host: true, hash: '#key=launch-credential' });
    await expect.poll(() => p.sockets.length).toBe(1);
    expect(p.sockets[0].url.searchParams.get('key')).toBe('launch-credential');
    expect(p.sockets[0].url.searchParams.get('host')).toBe('window');
    p.sockets[0].onopen();
    p.sockets[0].onclose({ code: 4000 });
    await expect.poll(() => p.sockets.length).toBe(2);
    expect(p.sockets[1].url.href).toBe(p.sockets[0].url.href);
  });

  it('keeps a replaced browser tab disconnected and omits a fragment credential', async () => {
    const p = page({ hash: '#key=unused' });
    await expect.poll(() => p.sockets.length).toBe(1);
    expect(p.sockets[0].url.searchParams.get('key')).toBeNull();
    expect(p.sockets[0].url.searchParams.get('host')).toBe('tab');
    const timers = [];
    p.win.setTimeout = (fn) => { timers.push(fn); return 0; };
    p.sockets[0].onclose({ code: 4000 });
    for (const timer of timers) timer();
    expect(p.sockets).toHaveLength(1);
  });
});
describe('the talk key and the voice reading a bubble', () => {
  const LINE = '一二三四五六七八九十一二三四五六七八九十';
  const reading = () => {
    const heard = { begun: [], revealed: 0, stopped: 0, babbled: 0 };
    return {
      heard,
      sfx: { babble: () => { heard.babbled++; } },
      speech: { active: true, begin: (text) => heard.begun.push(text), reveal: () => { heard.revealed++; return true; }, stop: () => { heard.stopped++; } },
    };
  };
  const say = (p, id, text) => p.onOrder({ t: 'say', id, beats: [{ text }] });
  const typed = (p) => p.bubble.querySelector('.b-text').textContent.length;

  it('stops the voice at the press and types the rest of the line without sound', () => {
    const { heard, ...voice } = reading();
    const p = page(voice);
    say(p, 'a', LINE); p.step(.01); p.step(.2);
    const revealed = heard.revealed, shown = typed(p);
    expect(revealed).toBeGreaterThan(0);
    p.onOrder({ t: 'talk-key', down: true });
    expect(heard.stopped).toBe(1);
    p.step(.2);
    expect(heard.revealed).toBe(revealed);
    expect(heard.babbled).toBe(0);
    expect(typed(p)).toBeGreaterThan(shown);
  });

  it('keeps a line silent that starts while the key is down, and reads the next one after it lets go', () => {
    const { heard, ...voice } = reading();
    const p = page(voice);
    p.onOrder({ t: 'talk-key', down: true });
    say(p, 'a', '一二三');
    for (let i = 0; i < 12; i++) p.step(1);
    expect(heard.begun).toEqual([]);
    expect(heard.babbled).toBe(0);
    p.onOrder({ t: 'talk-key', down: false });
    say(p, 'b', '四五六'); p.step(.01); p.step(.2);
    expect(heard.begun).toEqual(['四五六']);
  });

  it('keeps a line waiting at the press silent after the key lets go', () => {
    const { heard, ...voice } = reading();
    const p = page(voice);
    say(p, 'a', LINE); p.step(.01); p.step(.2);
    say(p, 'b', '四五六');
    p.onOrder({ t: 'talk-key', down: true });
    p.onOrder({ t: 'talk-key', down: false });
    for (let i = 0; i < 12; i++) p.step(1);
    expect(heard.begun).toEqual([LINE]);
    expect(heard.babbled).toBe(0);
  });

  it('forgets a held key when the socket closes, since its release can no longer arrive', async () => {
    const { heard, ...voice } = reading();
    const p = page(voice);
    await expect.poll(() => p.sockets.length).toBe(1);
    p.onOrder({ t: 'talk-key', down: true });
    p.sockets[0].onclose({ code: 1006 });
    say(p, 'a', LINE); p.step(.01); p.step(.2);
    expect(heard.begun).toEqual([LINE]);
  });
});

const read = { kind: 'read', text: '在看', detail: '日记.md' };
const think = { kind: 'think', text: '' };
const show = (p, status) => p.onOrder({ t: 'status', status });

describe('activity in the shared speech bubble', () => {
  it('shows activity by default and applies the switch without changing the thinking face', () => {
    const p = page();
    show(p, think); p.step(1);
    expect(p.bubble.getAttribute('aria-label')).toBe(t('status.thinking'));
    expect(p.bubble.hidden).toBe(false);
    expect(p.bodyChanges).toContainEqual({ thinking: true, status: 'think' });
    p.onOrder({ t: 'prefs', statusBubble: false }); p.step(.01);
    expect(p.bubble.hidden).toBe(true);
    p.onOrder({ t: 'prefs', statusBubble: true }); p.step(.01);
    expect(p.bubble.getAttribute('aria-label')).toBe(t('status.thinking'));
    expect(p.bubble.hidden).toBe(false);
    expect(p.bodyChanges.filter(c => 'thinking' in c)).toEqual([{ thinking: true, status: 'think' }]);
  });

  it('applies init and prefs to the body immediately, but waits .6 seconds before showing thought', () => {
    const p = page();
    p.onOrder({ t: 'init', status: think, statusBubble: true });
    expect(p.bodyChanges).toContainEqual({ thinking: true, status: 'think' });
    p.step(.59);
    expect(p.bubble.hidden).toBe(true);
    p.step(.02);
    expect(p.bubble.getAttribute('aria-label')).toBe(t('status.thinking'));
    expect(p.bubble.classList.contains('status')).toBe(true);
    p.onOrder({ t: 'prefs', status: think, statusBubble: false });
    p.step(.01);
    expect(p.bubble.hidden).toBe(true);
    expect(p.bodyChanges.filter(c => 'thinking' in c)).toEqual([{ thinking: true, status: 'think' }]);
  });

  it('never flashes thought for a quick reply', () => {
    const p = page();
    show(p, think); p.step(.18);
    show(p, null); p.step(1);
    expect(p.bubble.hidden).toBe(true);
  });

  it('holds each activity for 1.2 seconds, then replaces it or fades for .2 seconds', () => {
    const p = page();
    show(p, read); p.step(.01);
    show(p, { kind: 'write', text: '在写' }); p.step(1.19);
    expect(p.bubble.dataset.kind).toBe('read');
    p.step(.02);
    expect(p.bubble.dataset.kind).toBe('write');
    show(p, null); p.step(1.19);
    expect(p.bubble.classList.contains('fading')).toBe(false);
    p.step(.02);
    expect(p.bubble.classList.contains('fading')).toBe(true);
    p.step(.21);
    expect(p.bubble.hidden).toBe(true);
  });

  it('updates detail and count in place without restarting the icon', () => {
    const p = page();
    show(p, read); p.step(.01);
    const icon = p.bubble.querySelector('svg');
    show(p, { ...read, detail: '<记忆>.md', count: 3 }); p.step(.01);
    expect(p.bubble.querySelector('svg')).toBe(icon);
    expect(p.bubble.textContent).toBe('在看 · <记忆>.md 和另外 2 个');
    expect(p.bubble.querySelector('记忆')).toBeNull();
  });

  it('speech takes the same element immediately, stays above incoming status and returns to the latest activity', () => {
    const p = page();
    show(p, read); p.step(.01);
    expect(p.interactive()).toBe(false);
    p.onOrder({ t: 'say', id: 's', beats: [{ text: '你好', actions: [], anchors: [] }] });
    p.step(.01);
    expect(p.bubble.classList.contains('say')).toBe(true);
    expect(p.bubble.classList.contains('status')).toBe(false);
    expect(p.bubble.hasAttribute('aria-label')).toBe(false);
    expect(p.interactive()).toBe(true);
    show(p, { kind: 'search', text: '在搜' }); p.step(.01);
    expect(p.bubble.classList.contains('say')).toBe(true);
    expect(p.doc.querySelectorAll('.status')).toHaveLength(0);
    p.closeBubble(); p.step(.01);
    expect(p.bubble.dataset.kind).toBe('search');
    expect(p.interactive()).toBe(false);
  });

  it('turns an address in speech into a link once it has typed out', () => {
    const p = page();
    p.onOrder({ t: 'say', id: 's', beats: [{ text: '来 https://github.com/Pal-AI-Lab/Coopanion 点星', actions: [], anchors: [] }] });
    p.step(.01); p.step(.5);
    expect(p.bubble.querySelector('a')).toBeNull();
    p.step(3);
    expect(p.bubble.querySelector('a')?.getAttribute('href')).toBe('https://github.com/Pal-AI-Lab/Coopanion');
  });

  it.each(['ask', 'confirm', 'dialog', 'input', 'listen'])('%s takes priority over activity', (kind) => {
    const p = page();
    show(p, read); p.step(.01);
    if (kind === 'input') p.openInput();
    else if (kind === 'listen') p.onOrder({ t: 'listen', phase: 'start' });
    else if (kind === 'dialog') p.onOrder({ t: 'dialog', id: 'd', text: '你好', input: { kind: 'text', submit: '好' } });
    else p.onOrder({ t: kind, id: 'q', question: '继续吗', options: ['继续'] });
    p.step(.01);
    show(p, think); p.step(.7);
    expect(p.bubble.hidden || !p.bubble.classList.contains('status')).toBe(true);
    p.onOrder({ t: 'prefs', status: think, statusBubble: false }); p.step(.01);
    if (kind !== 'listen') expect(p.bubble.hidden).toBe(false);
  });
});

describe("the person's lines above Coo", () => {
  const up = (p) => p.lines().filter((l) => l.fadeAt === null);
  const said = (p, text, cursor) => p.onOrder({ t: 'said', via: 'chat', text, images: 0, cursor });

  it("a line stays while Coo works on it and while its reply is up, and fades REPLIED_FADE seconds after the reply closes", () => {
    const p = page();
    p.onOrder({ t: 'listen', phase: 'start' });
    p.onOrder({ t: 'listen', phase: 'heard', text: '今天天气怎么样' });
    show(p, think);
    // thinking for longer than an unanswered line lasts
    p.step(p.UNANSWERED_FADE + 1);
    expect(up(p)).toHaveLength(1);
    p.onOrder({ t: 'say', id: 's', beats: [{ text: '晴天', actions: [], anchors: [] }] });
    show(p, null);
    p.step(.01);
    expect(p.bubble.classList.contains('say')).toBe(true);
    for (let i = 0; i < 200 && !p.bubble.hidden; i++) { p.step(.05); expect(up(p)).toHaveLength(1); }
    expect(p.bubble.hidden).toBe(true);
    p.step(p.REPLIED_FADE - .1);
    expect(up(p)).toHaveLength(1);
    p.step(.2);
    expect(up(p)).toHaveLength(0);
  });

  it('holds MAX_LINES lines at most: past it the oldest fades even while Coo works on it, and the newest stays', () => {
    const p = page();
    show(p, think);
    for (let i = 1; i <= p.MAX_LINES + 1; i++) { said(p, `第 ${i} 句`, i); p.step(.01); }
    expect(up(p).map((l) => l.cursor)).toEqual(Array.from({ length: p.MAX_LINES }, (_, i) => i + 2));
  });

  it('a click closes a settled line, which then lets the pointer through; a line being heard closes only by its cancel button', () => {
    const p = page();
    said(p, '在吗', 1);
    p.onOrder({ t: 'listen', phase: 'start' });
    p.step(.01);
    const [sent, heard] = p.lines();
    heard.el.click();
    expect(heard.fadeAt).toBeNull();
    expect(p.overUi(sent.el)).toBe(true);
    sent.el.click();
    expect(sent.fadeAt).not.toBeNull();
    expect(p.overUi(sent.el)).toBe(false);
  });

  it('stacks the lines above Coo, the newest lowest, with no side picked from where Coo faces', () => {
    const p = page();
    show(p, think);
    for (let i = 1; i <= 3; i++) { said(p, `第 ${i} 句`, i); p.step(.01); }
    const tops = p.lines().map((l) => parseFloat(l.el.style.top));
    expect(tops.every((top) => top < 400)).toBe(true);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    // centred over Coo's head (the body's layout.bubble.x; jsdom lays everything out zero wide)
    expect(p.lines().map((l) => l.el.style.left)).toEqual(['500px', '500px', '500px']);
    expect(p.doc.querySelector('#trail')).toBeNull();
  });

  it('with the switch off nothing typed or sent stays, and a heard line fades once it is settled', () => {
    const p = page();
    said(p, '留着', 1); p.step(.01);
    p.onOrder({ t: 'prefs', saidBubbles: false });
    expect(up(p)).toHaveLength(0);
    said(p, '在吗', 2);
    expect(p.lines().filter((l) => l.cursor === 2)).toHaveLength(0);
    p.onOrder({ t: 'listen', phase: 'start' });
    expect(up(p)).toHaveLength(1);
    p.onOrder({ t: 'listen', phase: 'heard', text: '今天天气怎么样' });
    expect(up(p)).toHaveLength(0);
  });
});

describe('look wheel over the dress button', () => {
  /** A dress button on the page at (0, 0), which jsdom lays out with no size. */
  function dressButton(p) {
    const b = p.doc.querySelector('.menu').appendChild(p.doc.createElement('button'));
    b.dataset.action = 'dress';
    Object.defineProperty(b, 'offsetParent', { value: p.doc.body });
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve));
  async function frames(p, n = 5) { for (let i = 0; i < n; i++) { p.stepWheel(); await flush(); } }
  const over = (p) => { p.cursor.at = { x: 0, y: 0 }; };
  const off = (p) => { p.cursor.at = { x: 900, y: 900 }; };
  const wheel = (p) => p.doc.querySelector('#wheel');

  it.each([
    ['an empty list', async () => []],
    ['a failed read', async () => { throw new Error('read failed'); }],
  ])('reads the favourites once per hover after %s (the number of reads is the behavior)', async (_, answer) => {
    let reads = 0;
    const p = page({ fetchLooks: () => { reads++; return answer(); } });
    dressButton(p);
    over(p);
    await frames(p);
    expect(reads).toBe(1);
    expect(wheel(p).hidden).toBe(true);
    off(p);
    await frames(p, 1);
    over(p);
    await frames(p);
    expect(reads).toBe(2);
  });

  it('reads again when the pointer left while a bubble was showing', async () => {
    let reads = 0;
    const p = page({ fetchLooks: async () => { reads++; return []; } });
    dressButton(p);
    over(p);
    await frames(p);
    p.bubble.hidden = false;
    off(p);
    await frames(p, 1);
    over(p);
    p.bubble.hidden = true;
    await frames(p);
    expect(reads).toBe(2);
  });

  it('keeps the look it opened on at the head of the row after a favourite of another size is put on', async () => {
    const fox = { figure: 'coo', palette: 'fox' };
    const p = page({ fetchLooks: async () => [{ id: 'a', name: 'a', skin: fox, scale: 2 }], sameLook: realSameLook });
    dressButton(p);
    over(p);
    await frames(p);
    expect([...wheel(p).children].map((b) => b.classList.contains('worn'))).toEqual([true, false]);
    // the favourite goes on at its size and the row closes, as when the dress button moved from under the pointer
    p.onOrder({ t: 'prefs', skin: fox, scale: 2 });
    off(p);
    p.step(1);
    await frames(p, 1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(wheel(p).hidden).toBe(true);
    over(p);
    await frames(p);
    expect([...wheel(p).children].map((b) => [b.classList.contains('worn'), b.classList.contains('on')])).toEqual([[true, false], [false, true]]);
  });

  it('opens the row with one read when there are favourites', async () => {
    let reads = 0;
    const p = page({ fetchLooks: async () => { reads++; return [{ skin: {} }]; } });
    dressButton(p);
    over(p);
    await frames(p);
    expect(reads).toBe(1);
    expect(wheel(p).hidden).toBe(false);
  });
});

describe('the size the body is drawn at', () => {
  const drawnS = (p) => p.bodyChanges.filter((c) => c.bounds).at(-1)?.bounds.S;

  it('follows the size setting on the desktop and stays at size 1 in a tab, as a preview', () => {
    const desk = page({ host: true });
    desk.onOrder({ t: 'prefs', scale: 3 });
    expect(drawnS(desk)).toBeCloseTo(.42 * 3);
    const tab = page();
    tab.onOrder({ t: 'prefs', scale: 3 });
    tab.step(1);
    expect(drawnS(tab)).toBeCloseTo(.42);
  });
});

describe('the size slider pinned by a click on its button', () => {
  const sizerEl = (p) => p.doc.querySelector('#sizer');
  const shown = (p) => !sizerEl(p).hidden && !sizerEl(p).classList.contains('leaving');

  it('stays open with the pointer away until a press elsewhere, and a second click closes it', () => {
    const p = page({ host: true });
    p.onOrder({ t: 'prefs', hoverButtons: ['size'] });
    const button = p.doc.querySelector('#tools [data-action="size"]');
    button.click();
    expect(shown(p)).toBe(true);
    expect(button.classList.contains('on')).toBe(true);
    p.cursor.at = null;
    for (let i = 0; i < 6; i++) { p.step(.5); p.stepSizer(); }
    expect(shown(p)).toBe(true);
    p.doc.body.dispatchEvent(new p.win.MouseEvent('pointerdown', { bubbles: true }));
    expect(shown(p)).toBe(false);
    expect(button.classList.contains('on')).toBe(false);
    expect(button.classList.contains('off')).toBe(false);
    button.click();
    expect(shown(p)).toBe(true);
    button.click();
    expect(shown(p)).toBe(false);
  });
});

describe('the size slider opened by hovering its button', () => {
  it('stays while the pointer is among the pet\'s controls, on the body or another hover button, and goes once it is off them', () => {
    const p = page({ host: true });
    p.onOrder({ t: 'prefs', hoverButtons: ['size', 'chat'] });
    const tools = p.doc.querySelector('#tools'), button = tools.querySelector('[data-action="size"]');
    // jsdom lays nothing out: the size button is at the page's top left
    Object.defineProperty(button, 'offsetParent', { value: p.doc.body });
    const sizerEl = p.doc.querySelector('#sizer');
    const shown = () => !sizerEl.hidden && !sizerEl.classList.contains('leaving');
    /** The pointer at `at` for two seconds, longer than the slider waits once the pointer is off the controls. */
    const rest = (at) => { p.cursor.at = at; for (let i = 0; i < 4; i++) { p.step(.5); p.stepSizer(); } };
    p.cursor.at = { x: 0, y: 0 };
    p.stepSizer();
    expect(shown()).toBe(true);
    // on the body (its box is 400–500 × 300–400), on the way up to the slider
    rest({ x: 450, y: 350 });
    expect(shown()).toBe(true);
    // on the hover buttons, right of the body
    tools.hidden = false;
    tools.getBoundingClientRect = () => ({ left: 600, right: 650, top: 300, bottom: 400 });
    rest({ x: 625, y: 380 });
    expect(shown()).toBe(true);
    p.cursor.at = { x: 900, y: 900 };
    p.step(.5);
    p.stepSizer();
    expect(shown()).toBe(false);
  });
});

describe('the voice button', () => {
  it('is muted while voice input is on and the recognizer is not ready, as a hover button and in the menu alike', () => {
    const p = page({ host: true });
    p.onOrder({ t: 'prefs', hoverButtons: ['voice'], voice: { enabled: true, ready: false } });
    p.openMenu();
    const hover = p.doc.querySelector('#tools [data-action="voice"]'), tile = p.doc.querySelector('.menu [data-action="voice"]');
    expect([hover.classList.contains('waiting'), tile.classList.contains('waiting')]).toEqual([true, true]);
    p.onOrder({ t: 'prefs', voice: { enabled: true, ready: true } });
    expect([hover.classList.contains('waiting'), tile.classList.contains('waiting')]).toEqual([false, false]);
  });
});
