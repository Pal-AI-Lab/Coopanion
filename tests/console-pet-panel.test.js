// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import bundle from '../packages/cortico-world-desktop-pet/src/webui/client.ts';
import { petText } from '../packages/cortico-world-desktop-pet/src/i18n/index.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';

const t = petText('zh').panel;
/** The window open and connected, the managed runtime installed. */
const STATE = {
  inWindow: true, url: null, dressUrl: null, screen: null,
  window: { phase: 'running', pid: 1, source: null, detail: null },
  electron: { phase: 'ready', path: '/runtimes/electron', done: 0, total: null, detail: null, supported: true },
};
let life;
afterEach(() => { life?.abort(); document.body.replaceChildren(); });

it('reports a failed window action in an error notification and keeps the runtime status and the message line', async () => {
  life = new AbortController();
  const root = document.createElement('div');
  document.body.append(root);
  let reading = true;
  let tick = () => {};
  bundle.panels.pet.mount({
    pageId: 'world:desktop-pet', panelId: 'pet', language: 'zh', root, signal: life.signal,
    ui: createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } }),
    invoke: async (method) => {
      if (method !== 'state') throw new Error('window host refused');
      if (!reading) throw new Error('state unavailable');
      return STATE;
    },
    interval: (fn) => { tick = fn; return { dispose() {} }; },
    own: (d) => d,
    stream: () => ({ dispose() {}, send() {}, open: false }),
  });
  const msg = root.querySelector('.msgline');
  await vi.waitFor(() => expect(root.textContent).toContain(t.connected));

  [...root.querySelectorAll('button')].find((el) => el.textContent === t.closeWindow).click();
  await vi.waitFor(() => expect(document.querySelector('.toast.bad')?.textContent).toContain('window host refused'));
  expect(msg.textContent).toBe('');
  expect(root.textContent).toContain(t.connected);
  expect(root.textContent).toContain(t.installed);

  // a failed state read stays in the message line until a read succeeds
  reading = false;
  tick();
  await vi.waitFor(() => expect(msg.textContent).toBe('state unavailable'));
  reading = true;
  tick();
  await vi.waitFor(() => expect(msg.textContent).toBe(''));
});
