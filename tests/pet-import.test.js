import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { strToU8, zipSync } from 'fflate';
import { LANGUAGES } from 'cortico/core/language.ts';
import { PetServer } from '../packages/cortico-world-desktop-pet/src/server.ts';
import { PackImporter } from '../packages/cortico-world-desktop-pet/src/pack-import.ts';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { applyText, nameIn, t } from '../packages/cortico-world-desktop-pet/web/i18n.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const FIXTURE = fileURLToPath(new URL('tests/fixtures/api2-pack/', PKG));
const dress = readFileSync(new URL('web/dress.js', PKG), 'utf8');
const importing = dress.slice(dress.indexOf('const MB ='), dress.indexOf('// a zip or folders dragged onto the page'));
const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function page(installed = true) {
  const root = mkdtempSync(join(tmpdir(), 'pet-import-'));
  const old = join(root, 'old-name');
  if (installed) {
    cpSync(FIXTURE, old, { recursive: true });
    writeFileSync(join(old, 'kept.txt'), 'original');
  }
  const importer = new PackImporter({ packDir: () => root, packs: () => figurePacks([root]).packs });
  const server = new PetServer({
    port: () => 0, webDir: fileURLToPath(new URL('web/', PKG)), snapshot: () => ({}), importer,
    packs: () => figurePacks([root]).packs,
    onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {},
  });
  cleanup.push(async () => { await server.stop(); await importer.cancel(); rmSync(root, { recursive: true, force: true }); });
  await server.start();
  const dom = new JSDOM(await (await fetch(`${server.origin}/dress`)).text(), { url: `${server.origin}/dress`, runScripts: 'outside-only' });
  const win = dom.window;
  cleanup.push(() => win.close());
  const responses = [];
  win.fetch = async (path, options = {}) => {
    const res = await fetch(new URL(path, server.origin), { ...options, headers: { ...options.headers, origin: server.origin } });
    responses.push({ path, status: res.status });
    return res;
  };
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  win.deps = { applyText, nameOf: nameIn, t, packStatus: await (await fetch(`${server.origin}/api/figures/status`)).json() };
  win.eval(`
    const { applyText, nameOf, t, packStatus } = window.deps;
    const $ = (s) => document.querySelector(s);
    const el = (tag, cls, html) => { const node = document.createElement(tag); if (cls) node.className = cls; if (html) node.innerHTML = html; return node; };
    const skin = { figure: 'coo' }, sfx = { sparkle() {} };
    let body = null;
    const loadPacks = () => fetch('/api/figures');
    ${importing}
  `);
  const manifest = JSON.parse(readFileSync(join(FIXTURE, 'figure.json'), 'utf8'));
  const files = Object.fromEntries(readdirSync(FIXTURE).map((name) => [name, new Uint8Array(readFileSync(join(FIXTURE, name)))]));
  files['figure.json'] = strToU8(JSON.stringify({ ...manifest, version: '2.0.0' }));
  const zip = new Blob([zipSync(files)], { type: 'application/zip' });
  const input = win.document.querySelector('#importZip');
  Object.defineProperty(input, 'files', { value: [zip] });
  input.dispatchEvent(new win.Event('change'));
  await expect.poll(() => !!win.document.querySelector('[data-go]')).toBe(true);
  return { root, old, server, responses, doc: win.document, dialog: win.document.querySelector('#importDialog') };
}

describe('figure import confirmation', () => {
  it('keeps the existing files when the person cancels the replacement', async () => {
    const p = await page();
    p.doc.querySelector('[data-go]').click();
    await expect.poll(() => !!p.doc.querySelector('[data-replace]')).toBe(true);
    expect(p.responses).toContainEqual({ path: '/api/figures/import/install', status: 409 });
    expect(p.dialog.querySelector('h2').textContent).toBe(t('import.replaceTitle'));
    expect(p.dialog.querySelector('li').textContent).toContain('fixture-api2');
    expect(readFileSync(join(p.old, 'kept.txt'), 'utf8')).toBe('original');
    expect(readdirSync(p.root)).toEqual(['old-name']);
    p.doc.querySelector('[data-close]').click();
    await expect.poll(() => p.responses).toContainEqual({ path: '/api/figures/import/cancel', status: 200 });
    expect(p.dialog.open).toBe(false);
    expect(readFileSync(join(p.old, 'kept.txt'), 'utf8')).toBe('original');
  });

  it('replaces the pack only after the person confirms the listed conflict', async () => {
    const p = await page();
    p.doc.querySelector('[data-go]').click();
    await expect.poll(() => !!p.doc.querySelector('[data-replace]')).toBe(true);
    expect(readFileSync(join(p.old, 'kept.txt'), 'utf8')).toBe('original');
    p.doc.querySelector('[data-replace]').click();
    await expect.poll(() => p.dialog.open).toBe(false);
    expect(p.responses.filter((r) => r.path.endsWith('/install')).map((r) => r.status)).toEqual([409, 200]);
    expect(existsSync(p.old)).toBe(false);
    expect(JSON.parse(readFileSync(join(p.root, 'fixture-api2', 'figure.json'), 'utf8')).version).toBe('2.0.0');
  });

  it('installs a new pack with the initial selection and blocks foreign-origin imports', async () => {
    const p = await page(false);
    const res = await fetch(`${p.server.origin}/api/figures/import`, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/zip' }, body: new Uint8Array() });
    expect(res.status).toBe(421);
    p.doc.querySelector('[data-go]').click();
    await expect.poll(() => p.dialog.open).toBe(false);
    expect(p.responses.filter((r) => r.path.endsWith('/install')).map((r) => r.status)).toEqual([200]);
    expect(figurePacks([p.root]).packs.some((pack) => pack.id === 'fixture-api2')).toBe(true);
  });

  it('provides the replacement prompt in every app language', async () => {
    for (const language of LANGUAGES) {
      const { default: text } = await import(`../packages/cortico-world-desktop-pet/web/i18n/${language}.js`);
      for (const key of ['import.replaceTitle', 'import.replaceText', 'import.replace']) expect(text[key], `${language}: ${key}`).toEqual(expect.any(String));
    }
  });
});
