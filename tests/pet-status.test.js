import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { clamp, f, ICONS } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const source = readFileSync(new URL('pet-app.js', WEB), 'utf8').replace(/^import .*;$/gm, '');
const html = readFileSync(new URL('pet.html', WEB), 'utf8');
const pages = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); });

/** Run the actual page with a quiet socket and body; the test advances the page's frame clock. */
function page(enable = true) {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1/pet', runScripts: 'outside-only' });
  const win = dom.window;
  pages.push(win);
  const bodyChanges = [];
  const body = {
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 500, y: 400 } },
    set: (change) => bodyChanges.push(change), cue() {}, talk() {},
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class { readyState = 1; send() {} };
  win.deps = {
    applyTheme: (theme) => { win.document.documentElement.dataset.theme = theme; }, clamp, f, ICONS,
    COO_CSS, mini, normalizeSkin, skinCss,
    createSfx: () => ({ pop() {}, babble() {}, blub() {}, configure() {}, set() {}, listenStart() {}, listenEnd() {}, select() {}, tick() {} }),
    loadBody: async () => body, body,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, COO_CSS, mini, normalizeSkin, skinCss, createSfx, loadBody } = window.deps;\n${source}\nbody = window.deps.body; window.page = { onOrder, openInput, closeBubble, step: (dt) => { T += dt; stepDialog(dt); stepListen(); stepStatus(); layout(); }, interactive: () => bubble.matches(UI_SELECTOR) };`);
  if (enable) win.page.onOrder({ t: 'init', statusBubble: true });
  return { ...win.page, bubble: win.document.querySelector('#bubble'), bodyChanges, doc: win.document };
}
const read = { kind: 'read', text: '在看', detail: '日记.md' };
const think = { kind: 'think', text: '' };
const show = (p, status) => p.onOrder({ t: 'status', status });

describe('activity in the shared speech bubble', () => {
  it('starts with activity hidden and applies the switch without changing the thinking face', () => {
    const p = page(false);
    show(p, think); p.step(1);
    expect(p.bubble.hidden).toBe(true);
    expect(p.bodyChanges).toContainEqual({ thinking: true });
    p.onOrder({ t: 'prefs', statusBubble: true }); p.step(.01);
    expect(p.bubble.getAttribute('aria-label')).toBe('在想');
    expect(p.bubble.hidden).toBe(false);
    p.onOrder({ t: 'prefs', statusBubble: false }); p.step(.01);
    expect(p.bubble.hidden).toBe(true);
    expect(p.bodyChanges.filter(c => 'thinking' in c)).toEqual([{ thinking: true }]);
  });

  it('applies init and prefs to the body immediately, but waits .6 seconds before showing thought', () => {
    const p = page();
    p.onOrder({ t: 'init', status: think, statusBubble: true });
    expect(p.bodyChanges).toContainEqual({ thinking: true });
    p.step(.59);
    expect(p.bubble.hidden).toBe(true);
    p.step(.02);
    expect(p.bubble.getAttribute('aria-label')).toBe('在想');
    expect(p.bubble.classList.contains('status')).toBe(true);
    p.onOrder({ t: 'prefs', status: think, statusBubble: false });
    p.step(.01);
    expect(p.bubble.hidden).toBe(true);
    expect(p.bodyChanges.filter(c => 'thinking' in c)).toEqual([{ thinking: true }]);
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
    expect(p.bubble.textContent).toBe('在看 · <记忆>.md 等 3 个');
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
