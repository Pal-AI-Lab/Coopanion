// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { ConsolePageHost } from '../console/advanced/console-pages/host.ts';
import { CONSOLE_PROTOCOL_VERSION } from '../console/base/protocol.ts';

afterEach(() => { document.body.replaceChildren(); });

it('keeps a page\'s availability note when its panel replaces everything in its root', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const reason = 'Fixture World is not signed in.';
  const host = new ConsolePageHost({
    doc: document, root, overlayHost: document.body,
    loader: { resolvePanel: async () => ({ mount: (ctx) => { ctx.root.replaceChildren(ctx.ui.h('div', 'fixture-panel', 'Fixture panel')); } }) },
    builtins: {},
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
