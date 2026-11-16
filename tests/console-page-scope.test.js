// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { ConsolePageHost, HEADER_SLOT } from '../console/advanced/console-pages/host.ts';
import { ConsolePageLoader } from '../console/advanced/console-pages/loader.ts';
import { EXTENSION_PAGE_ATTR, HOST_VIEW_ATTR, scopeExtensionCss } from '../console/advanced/console-pages/scope-css.ts';
import { CONSOLE_PROTOCOL_VERSION } from '../console/base/protocol.ts';

afterEach(() => { document.body.replaceChildren(); });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A loader over an in-memory extension: `files` maps asset URLs to their text, `bundle` is the module's default export. */
function fixtureLoader(bundle, files = {}) {
  const fetched = [];
  const attached = new Set();
  const loader = new ConsolePageLoader({
    importModule: async () => ({ default: bundle }),
    fetchText: async (url) => {
      fetched.push(url);
      if (!(url in files)) throw new Error(`404 ${url}`);
      return files[url];
    },
    createStyle: (css, baseUrl) => {
      const style = { css, baseUrl, attach: () => attached.add(style), detach: () => attached.delete(style) };
      return style;
    },
  });
  return { loader, fetched, attached };
}

function pageHost(loader, providers, root = document.createElement('div')) {
  document.body.append(root);
  const host = new ConsolePageHost({
    doc: document, root, overlayHost: document.body, loader,
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) },
    fetchManifest: async () => ({ protocolVersion: CONSOLE_PROTOCOL_VERSION, framework: { capabilities: {} }, providers }),
    memo: { get: (_, fallback) => fallback, set() {} },
    createSocket: () => { throw new Error('no stream in this test'); },
    wsUrl: (path) => path,
    onError: () => {},
  });
  return { host, root };
}

const page = (panels, client = { js: '/assets/fixture.js', css: '/assets/fixture.css' }) => ({
  id: 'world:fixture', kind: 'world', label: 'Fixture World', availability: 'active', panels, client,
});

it('wraps style rules in a scope that ends at the page header and host views, and keeps the rules @scope cannot hold outside it', () => {
  const source = '﻿@import url(x.css);\n'
    + '@keyframes spin { from { opacity: 0 } }\n'
    + '/* a } in a comment */ .card { content: "}"; }\n'
    + '@media (max-width: 400px) { .card { padding: 0 } }\n'
    + '@font-face { font-family: Fixture; src: url(f.woff2); }\n';
  const { css, droppedImports } = scopeExtensionCss(source, 'world:fixture');
  expect(droppedImports).toBe(1);
  expect(css).not.toContain('@import');
  const scopeAt = css.indexOf('@scope');
  expect(css.slice(scopeAt).startsWith(`@scope ([${EXTENSION_PAGE_ATTR}="world:fixture"]) to (.providerchrome, [${HOST_VIEW_ATTR}]) {`)).toBe(true);
  expect(css.indexOf('@keyframes spin')).toBeLessThan(scopeAt);
  expect(css.indexOf('@font-face')).toBeLessThan(scopeAt);
  const scoped = css.slice(scopeAt);
  expect(scoped).toContain('.card { content: "}"; }');
  expect(scoped).toContain('@media (max-width: 400px) { .card { padding: 0 } }');
  expect(css.endsWith('}')).toBe(true);
});

it('keeps a page\'s style attached while any of its uses lasts, downloads it once and retries a failed download', async () => {
  const files = { '/assets/a.css': '.a { color: red }' };
  const { loader, fetched, attached } = fixtureLoader({ panels: {} }, files);
  const asset = { js: '/assets/a.js', css: '/assets/a.css' };
  const first = loader.useStyle('world:a', asset);
  const second = loader.useStyle('world:a', asset);
  await flush();
  expect(fetched).toEqual(['/assets/a.css']);
  expect(attached.size).toBe(1);
  const [style] = attached;
  expect(style.baseUrl).toBe('/assets/a.css');
  expect(style.css).toContain(`[${EXTENSION_PAGE_ATTR}="world:a"]`);
  first.dispose();
  expect(attached.size).toBe(1);
  second.dispose();
  second.dispose();
  expect(attached.size).toBe(0);
  loader.useStyle('world:a', asset);
  expect(attached.has(style)).toBe(true);
  expect(fetched).toHaveLength(1);

  const missing = { js: '/assets/b.js', css: '/assets/b.css' };
  loader.useStyle('world:b', missing).dispose();
  await flush();
  files['/assets/b.css'] = '.b { color: blue }';
  loader.useStyle('world:b', missing);
  await flush();
  expect(fetched.filter((url) => url === '/assets/b.css')).toHaveLength(2);
  expect([...attached].some((s) => s.css.includes('.b'))).toBe(true);

  loader.useStyle('world:c', { js: '/assets/c.js', css: 'https://example.invalid/c.css' }).dispose();
  expect(fetched).not.toContain('https://example.invalid/c.css');
});

it('marks the page root and its overlays only while the page is shown, and marks what the host draws in the panel area', async () => {
  const { loader, attached } = fixtureLoader({
    panels: {
      main: { mount: (ctx) => { ctx.root.append(ctx.ui.h('div', 'fixture-panel')); ctx.ui.toast('saved'); } },
      broken: { mount: () => { throw new Error('fixture failure'); } },
    },
  }, { '/assets/fixture.css': '.fixture-panel { color: red }' });
  const { host, root } = pageHost(loader, [page([{ id: 'main', title: 'Main' }, { id: 'broken', title: 'Broken' }])]);
  await host.load();
  await host.show('world:fixture', 'main');
  await flush();
  expect(root.getAttribute(EXTENSION_PAGE_ATTR)).toBe('world:fixture');
  expect(attached.size).toBe(1);
  const toast = document.querySelector('.toast');
  expect(toast.closest(`[${HOST_VIEW_ATTR}]`)?.parentElement?.getAttribute(EXTENSION_PAGE_ATTR)).toBe('world:fixture');

  await host.show('world:fixture', 'broken');
  const problem = root.querySelector('.panelslot').firstElementChild;
  expect(problem.hasAttribute(HOST_VIEW_ATTR)).toBe(true);

  host.unmount();
  expect(root.hasAttribute(EXTENSION_PAGE_ATTR)).toBe(false);
  expect(attached.size).toBe(0);
  expect(document.querySelector(`[${EXTENSION_PAGE_ATTR}]`)).toBeNull();
});

it('mounts header-slot panels into the title row for as long as the header stays, across the page\'s tabs', async () => {
  const mounts = [];
  const { loader } = fixtureLoader({
    panels: {
      one: { mount: () => {} },
      two: { mount: () => {} },
      version: {
        mount(ctx) {
          const entry = { signal: ctx.signal, button: ctx.ui.button('v1') };
          mounts.push(entry);
          ctx.root.append(entry.button);
        },
      },
    },
  });
  const { host, root } = pageHost(loader, [page([
    { id: 'one', title: 'One' }, { id: 'two', title: 'Two' }, { id: 'version', title: 'Version', slot: HEADER_SLOT },
  ])]);
  await host.load();
  await host.show('world:fixture', 'one');
  await flush();
  const slot = root.querySelector('.pagetitle-row > .pagetitle-slot');
  expect(slot.getAttribute(EXTENSION_PAGE_ATTR)).toBe('world:fixture');
  expect(slot.textContent).toBe('v1');
  expect([...root.querySelectorAll('.providertabs .pagetab')].map((tab) => tab.textContent)).toEqual(['One', 'Two']);

  await host.show('world:fixture', 'two');
  await flush();
  expect(mounts).toHaveLength(1);
  expect(mounts[0].button.isConnected).toBe(true);
  expect(mounts[0].signal.aborted).toBe(false);

  host.unmount();
  expect(mounts[0].signal.aborted).toBe(true);
});
