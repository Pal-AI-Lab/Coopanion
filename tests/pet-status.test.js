import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { clamp, f, ICONS, linked } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { t } from '../packages/cortico-world-desktop-pet/web/i18n.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const source = readFileSync(new URL('pet-app.js', WEB), 'utf8').replace(/^import .*;$/gm, '');
const html = readFileSync(new URL('pet.html', WEB), 'utf8');
const pages = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); });

/** Run the actual page with a quiet socket and body; the test advances the page's frame clock. */
function page({ host = false, hash = '' } = {}) {
  const dom = new JSDOM(html, { url: `http://127.0.0.1/pet${hash}`, runScripts: 'outside-only' });
  const win = dom.window;
  pages.push(win);
  if (host) win.petHost = {};
  const sockets = [];
  const bodyChanges = [];
  const body = {
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 500, y: 400 } },
    set: (change) => bodyChanges.push(change), cue() {}, talk() {},
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class {
    readyState = 1;
    constructor(url) { this.url = new URL(url); sockets.push(this); }
    send() {}
  };
  win.deps = {
    applyTheme: (theme) => { win.document.documentElement.dataset.theme = theme; }, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document),
    COO_CSS, mini, normalizeSkin, skinCss,
    createSfx: () => ({ unlock() {}, pop() {}, babble() {}, blub() {}, configure() {}, set() {}, setPan() {}, listenStart() {}, listenEnd() {}, select() {}, tick() {} }),
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false }),
    textSteps: () => 1,
    loadBody: async () => body, body,
    t, language: () => 'zh', useLanguage: async () => {},
    // the tab's stage (stage.js) is decoration the activity bubble does not depend on
    lightWall() {}, dressFloor() {}, modeButton: () => ({ show() {} }), glowColor: () => null, setGlow() {}, bindAppearance() {}, announcePainted() {},
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, createSfx, createSpeech, textSteps, loadBody, t, language, useLanguage, lightWall, dressFloor, modeButton, glowColor, setGlow, bindAppearance, announcePainted } = window.deps;\n${source}\nbody = window.deps.body; window.page = { onOrder, openInput, closeBubble, step: (dt) => { T += dt; stepDialog(dt); stepLines(); stepStatus(); layout(dt); }, interactive: () => bubble.matches(UI_SELECTOR), lines: () => lines, overUi: (el) => el.matches(UI_SELECTOR), REPLIED_FADE, UNANSWERED_FADE, MAX_LINES };`);
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
