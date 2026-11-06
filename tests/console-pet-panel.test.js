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
afterEach(() => { life?.abort(); document.body.replaceChildren(); vi.restoreAllMocks(); });

it('keeps window action errors at the control and read errors with the preserved runtime status', async () => {
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
  const msg = root.querySelector('.read-feedback');
  await vi.waitFor(() => expect(root.textContent).toContain(t.connected));

  const close = [...root.querySelectorAll('button')].find((el) => el.textContent === t.closeWindow);
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 800 });
  vi.spyOn(close, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 200, right: 400, bottom: 230, width: 100, height: 30 });
  close.click();
  await vi.waitFor(() => expect(document.querySelector('.extension-problem:not(.hidden)')?.textContent).toContain('window host refused'));
  expect(document.querySelector('.toast')).toBeNull();
  expect(msg.textContent).toBe('');
  expect(root.textContent).toContain(t.connected);
  expect(root.textContent).toContain(t.installed);

  // A failed read does not erase the last known runtime state.
  reading = false;
  tick();
  await vi.waitFor(() => expect(msg.textContent).toBe('state unavailable'));
  expect(root.textContent).toContain(t.connected);
  reading = true;
  tick();
  await vi.waitFor(() => expect(msg.textContent).toBe(''));
});
