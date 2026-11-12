import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { PetServer } from '../packages/cortico-world-desktop-pet/src/server.ts';
import { fetchLooks, lookAvailable, lookPicture, sameLook, writeLooks } from '../packages/cortico-world-desktop-pet/web/looks.js';
import { normalizeSkin } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { t } from '../packages/cortico-world-desktop-pet/web/i18n.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const dress = readFileSync(new URL('web/dress.js', PKG), 'utf8');
const section = dress.slice(dress.indexOf('/* ---------- saved looks ---------- */'), dress.indexOf('/* ---------- importing packs ---------- */'));
const look = (id, palette) => ({ id, name: id, skin: { figure: 'coo', palette } });
const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

/** The dressing page's saved-looks code against a real pet server; `failReads` makes that many reads of the list fail. */
async function page(stored) {
  let kept = stored;
  const server = new PetServer({
    port: () => 0, webDir: fileURLToPath(new URL('web/', PKG)), snapshot: () => ({}),
    onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {},
    looks: () => kept, onLooks: (next) => { kept = next; },
  });
  cleanup.push(() => server.stop());
  await server.start();
  const dom = new JSDOM('<div id="saved"></div><div id="optLooks"></div><button id="saveLook"></button><button id="updateLook"></button>', { url: `${server.origin}/dress`, runScripts: 'outside-only' });
  const win = dom.window;
  cleanup.push(() => win.close());
  const state = { failReads: 0 };
  const real = globalThis.fetch;
  const pageFetch = (path, options = {}) => {
    if (!options.method && path === '/api/looks' && state.failReads > 0) { state.failReads--; return Promise.resolve(new Response('', { status: 500 })); }
    return real(new URL(path, server.origin), { ...options, headers: { ...options.headers, origin: server.origin } });
  };
  globalThis.fetch = pageFetch;
  cleanup.push(() => { globalThis.fetch = real; });
  win.ResizeObserver = class { observe() {} };
  win.requestAnimationFrame = () => 0;
  win.deps = { fetchLooks, lookAvailable, lookPicture, sameLook, writeLooks, normalizeSkin, t, ICONS: { addLook: '', saveLook: '', pencil: '', trash: '' }, dragRow() {} };
  win.eval(`
    const { fetchLooks, lookAvailable, lookPicture, sameLook, writeLooks, normalizeSkin, t, ICONS, dragRow } = window.deps;
    const $ = (s) => document.querySelector(s);
    const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n; };
    let skin = normalizeSkin({ figure: 'coo', palette: 'purple' });
    const packs = [], theme = 'dark', body = null, sfx = { tick() {}, sparkle() {} }, importDialog = {};
    const cooName = (kind, id) => id, nameOf = (n) => n, apply = () => {};
    ${section}
    window.page = { loadLooks };
  `);
  const doc = win.document;
  return {
    state, stored: () => kept, doc,
    load: () => win.page.loadLooks(),
    /** Clicks save and resolves once the page shows the outcome: the button's saved mark, or a notice. */
    save: async () => {
      const button = doc.querySelector('#saveLook'), notice = doc.querySelector('#saved');
      button.classList.remove('done');
      notice.textContent = '';
      button.click();
      await expect.poll(() => button.classList.contains('done') || notice.textContent !== '').toBe(true);
    },
    tiles: () => doc.querySelectorAll('.look-tile').length,
    row: () => doc.querySelector('#optLooks').textContent,
    retry: () => doc.querySelector('.looks-retry'),
    notice: () => doc.querySelector('#saved').textContent,
  };
}

describe('saved looks on the dressing page', () => {
  it('keeps the stored list when a save comes after a failed read', async () => {
    const stored = [look('a', 'mint'), look('b', 'fox')];
    const p = await page(stored);
    p.state.failReads = 2;
    await p.load();
    expect(p.row()).toContain(t('looks.readFailed'));
    expect(p.row()).not.toContain(t('looks.empty'));
    await p.save();
    expect(p.stored()).toBe(stored);
    expect(p.notice()).toBe(t('dress.notSaved'));
  });

  it('adds to the stored list when the save finds the list readable again', async () => {
    const p = await page([look('a', 'mint'), look('b', 'fox')]);
    p.state.failReads = 1;
    await p.load();
    await p.save();
    expect(p.stored().map((l) => l.id).slice(0, 2)).toEqual(['a', 'b']);
    expect(p.stored()).toHaveLength(3);
    expect(p.tiles()).toBe(3);
  });

  it('shows the stored list after the retry button reads it', async () => {
    const p = await page([look('a', 'mint')]);
    p.state.failReads = 1;
    await p.load();
    p.retry().click();
    await expect.poll(() => p.tiles()).toBe(1);
    expect(p.retry()).toBeNull();
  });

  it('keeps the list it has when a later read fails', async () => {
    const p = await page([look('a', 'mint'), look('b', 'fox')]);
    await p.load();
    p.state.failReads = 1;
    await p.load();
    expect(p.tiles()).toBe(2);
    await p.save();
    expect(p.stored()).toHaveLength(3);
  });

  it('says there are none when the list reads as empty', async () => {
    const p = await page([]);
    await p.load();
    expect(p.row()).toContain(t('looks.empty'));
    expect(p.retry()).toBeNull();
  });
});
