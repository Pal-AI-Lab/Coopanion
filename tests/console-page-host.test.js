// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { ConsolePageHost } from '../console/advanced/console-pages/host.ts';
import { ConsolePageLoader, PanelBundleError } from '../console/advanced/console-pages/loader.ts';
import { fetchManifest } from '../console/base/api.ts';
import { CONSOLE_PROTOCOL_VERSION } from '../console/base/protocol.ts';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const styleHost = { appendChild() {} };
const createLink = () => ({ rel: '', href: '', dataset: {} });

it('keeps a page\'s availability note when its panel replaces everything in its root', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const reason = 'Fixture World is not signed in.';
  const host = new ConsolePageHost({
    doc: document, root, overlayHost: document.body,
    loader: { resolvePanel: async () => ({ mount: (ctx) => { ctx.root.replaceChildren(ctx.ui.h('div', 'fixture-panel', 'Fixture panel')); } }) },
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) },
    fetchManifest: async () => ({
      protocolVersion: CONSOLE_PROTOCOL_VERSION,
      framework: { capabilities: {} },
      providers: [{
        id: 'world:fixture', kind: 'world', label: 'Fixture World', availability: 'inactive', reason,
        panels: [{ id: 'main', title: 'Main' }], client: { js: 'fixture.js' },
      }],
    }),
    memo: { get: (_, fallback) => fallback, set() {} },
    createSocket: () => { throw new Error('no stream in this test'); },
    wsUrl: (path) => path,
    onError: (err) => { throw err; },
  });
  await host.load();
  await host.show('world:fixture');
  expect(root.querySelector('.fixture-panel')).not.toBeNull();
  expect(root.textContent).toContain(reason);
  expect(root.querySelector('.panelslot').textContent).not.toContain(reason);
  host.unmount();
});

it('fetches the WebUI manifest with cache: no-store', async () => {
  let seenInit = null;
  vi.stubGlobal('fetch', async (url, init) => {
    expect(url).toBe('/api/webui/manifest');
    seenInit = init;
    return new Response(JSON.stringify({ protocolVersion: CONSOLE_PROTOCOL_VERSION, framework: {}, providers: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  await fetchManifest();
  expect(seenInit?.cache).toBe('no-store');
});

it('logs the manifest entry when a panel bundle import fails and loads newer JS and CSS URLs after refresh', async () => {
  const logged = [];
  const urls = [];
  const links = [];
  const loader = new ConsolePageLoader({
    importModule: async (url) => {
      urls.push(url);
      if (url.includes('/1.0.0/')) throw new TypeError(`Failed to fetch dynamically imported module: ${url}`);
      return {
        default: {
          panels: {
            main: {
              mount: (ctx) => { ctx.root.replaceChildren(ctx.ui.h('div', 'fresh-panel', url)); },
            },
          },
        },
      };
    },
    styleHost: { appendChild: (node) => { links.push(node); } },
    createLink,
    log: (message, detail) => { logged.push({ message, detail }); },
  });

  const staleAsset = { js: '/assets/extensions/fixture/1.0.0/client.js', css: '/assets/extensions/fixture/1.0.0/client.css' };
  const freshAsset = { js: '/assets/extensions/fixture/1.0.1/client.js', css: '/assets/extensions/fixture/1.0.1/client.css' };
  await expect(loader.resolvePanel('world:fixture', 'main', staleAsset)).rejects.toBeInstanceOf(PanelBundleError);
  expect(logged).toHaveLength(1);
  expect(logged[0].detail).toEqual({
    pageId: 'world:fixture',
    js: staleAsset.js,
    css: staleAsset.css,
  });
  expect(links).toHaveLength(0);

  await loader.resolvePanel('world:fixture', 'main', freshAsset);
  const nextAsset = { js: '/assets/extensions/fixture/1.0.2/client.js', css: '/assets/extensions/fixture/1.0.2/client.css' };
  await loader.resolvePanel('world:fixture', 'main', nextAsset);
  expect(urls).toEqual([staleAsset.js, freshAsset.js, nextAsset.js]);
  expect(links.map((l) => l.href)).toEqual([freshAsset.css, nextAsset.css]);
});

it('keeps the newer bundle cached when a slower older load resolves later for the same page', async () => {
  let resolveOld;
  const oldAsset = { js: '/assets/extensions/fixture/1.0.0/client.js' };
  const newAsset = { js: '/assets/extensions/fixture/1.0.1/client.js' };
  const imported = [];
  const bundleFor = (tag) => ({ default: { panels: { main: { tag, mount() {} } } } });
  const loader = new ConsolePageLoader({
    importModule: (url) => {
      imported.push(url);
      if (url === oldAsset.js) return new Promise((resolve) => { resolveOld = () => resolve(bundleFor('old')); });
      return Promise.resolve(bundleFor('new'));
    },
    styleHost,
    createLink,
  });

  const slowOld = loader.load('world:fixture', oldAsset);
  const fastNew = await loader.load('world:fixture', newAsset);
  resolveOld();
  await slowOld;
  const again = await loader.load('world:fixture', newAsset);
  expect(again).toBe(fastNew);
  expect(imported).toEqual([oldAsset.js, newAsset.js]);
});

it('does not refresh the manifest or retry when unmounted while a bundle import fails', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  let rejectImport;
  let manifestCalls = 0;
  let importCalls = 0;
  const loader = new ConsolePageLoader({
    importModule: () => {
      importCalls++;
      return new Promise((_resolve, reject) => { rejectImport = reject; });
    },
    styleHost,
    createLink,
  });
  const host = new ConsolePageHost({
    doc: document, root, overlayHost: document.body,
    loader,
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) },
    fetchManifest: async () => {
      manifestCalls++;
      return {
        protocolVersion: CONSOLE_PROTOCOL_VERSION,
        framework: { capabilities: {} },
        providers: [{
          id: 'world:fixture', kind: 'world', label: 'Fixture World', availability: 'active',
          panels: [{ id: 'main', title: 'Main' }],
          client: { js: '/assets/extensions/fixture/1.0.0/client.js' },
        }],
      };
    },
    memo: { get: (_, fallback) => fallback, set() {} },
    createSocket: () => { throw new Error('no stream in this test'); },
    wsUrl: (path) => path,
    onError: (err) => { throw err; },
  });
  await host.load();
  const showing = host.show('world:fixture');
  host.unmount();
  rejectImport(new TypeError('404 stale'));
  await showing;
  expect(manifestCalls).toBe(1);
  expect(importCalls).toBe(1);
});

it('refreshes the manifest once and recovers when a panel fails to load from a stale asset URL', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const staleUrl = '/assets/extensions/fixture/1.0.0/client.js';
  const freshUrl = '/assets/extensions/fixture/1.0.1/client.js';
  let manifestCalls = 0;
  const loader = new ConsolePageLoader({
    importModule: async (url) => {
      if (url === staleUrl) throw new TypeError(`404 ${url}`);
      return {
        default: {
          panels: {
            main: {
              mount: (ctx) => { ctx.root.replaceChildren(ctx.ui.h('div', 'recovered-panel', 'Loaded fresh')); },
            },
          },
        },
      };
    },
    styleHost,
    createLink,
  });
  const host = new ConsolePageHost({
    doc: document, root, overlayHost: document.body,
    loader,
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) },
    fetchManifest: async () => {
      manifestCalls++;
      return {
        protocolVersion: CONSOLE_PROTOCOL_VERSION,
        framework: { capabilities: {} },
        providers: [{
          id: 'world:fixture', kind: 'world', label: 'Fixture World', availability: 'active',
          panels: [{ id: 'main', title: 'Main' }],
          client: { js: manifestCalls === 1 ? staleUrl : freshUrl },
        }],
      };
    },
    memo: { get: (_, fallback) => fallback, set() {} },
    createSocket: () => { throw new Error('no stream in this test'); },
    wsUrl: (path) => path,
    onError: (err) => { throw err; },
  });
  await host.load();
  await host.show('world:fixture');
  expect(manifestCalls).toBe(2);
  expect(root.querySelector('.recovered-panel')?.textContent).toBe('Loaded fresh');
  host.unmount();
});

it('stops after one manifest refresh when the failing bundle URL is unchanged', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const badUrl = '/assets/extensions/fixture/1.0.0/client.js';
  let manifestCalls = 0;
  let importCalls = 0;
  const errors = [];
  const loader = new ConsolePageLoader({
    importModule: async (url) => {
      importCalls++;
      throw new TypeError(`404 ${url}`);
    },
    styleHost,
    createLink,
  });
  const host = new ConsolePageHost({
    doc: document, root, overlayHost: document.body,
    loader,
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) },
    fetchManifest: async () => {
      manifestCalls++;
      return {
        protocolVersion: CONSOLE_PROTOCOL_VERSION,
        framework: { capabilities: {} },
        providers: [{
          id: 'world:fixture', kind: 'world', label: 'Fixture World', availability: 'active',
          panels: [{ id: 'main', title: 'Main' }],
          client: { js: badUrl },
        }],
      };
    },
    memo: { get: (_, fallback) => fallback, set() {} },
    createSocket: () => { throw new Error('no stream in this test'); },
    wsUrl: (path) => path,
    onError: (err) => { errors.push(err); },
  });
  await host.load();
  await host.show('world:fixture');
  expect(manifestCalls).toBe(2);
  expect(importCalls).toBe(1);
  expect(errors).toHaveLength(1);
  expect(root.querySelector('.panelslot')?.textContent).toContain('404');
  host.unmount();
});
