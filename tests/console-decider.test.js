// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { transferableAbortController } from 'node:util';
import { petPage } from '../console/features/pet/index.ts';
import { DECIDER_GROUP } from '../console/features/decider/index.ts';
import { S } from '../console/features/decider/strings.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';

const ENABLED = 'worlds.desktop-pet.decider.enabled';
const nativeFetch = globalThis.fetch;
let server, life, values, decider, keys, writes;

beforeEach(async () => {
  values = { [ENABLED]: false };
  decider = { mode: 'classic', enabled: false, failing: null };
  keys = [];
  writes = [];
  document.body.replaceChildren();
  history.replaceState(null, '', '/#/pet');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    let body = '';
    for await (const chunk of req) body += chunk;
    if (req.url === '/api/config' && req.method === 'POST') {
      const { group, values: v } = JSON.parse(body);
      writes.push({ group, values: v });
      Object.assign(values, v);
      res.end(JSON.stringify({ result: 'saved' }));
    } else if (req.url === '/api/config') {
      res.end(JSON.stringify({ groups: [{ group: { id: DECIDER_GROUP }, values }] }));
    } else if (req.url.startsWith('/api/config/options/')) res.end(JSON.stringify({ options: [] }));
    else if (req.url.endsWith('/panels/pet/setDeciderKey')) {
      keys.push(JSON.parse(body).args[0]);
      decider = { ...decider, mode: decider.enabled ? 'decider' : 'classic' };
      res.end(JSON.stringify({ decider }));
    } else if (req.url.endsWith('/panels/pet/state')) res.end(JSON.stringify({ decider }));
    else { res.writeHead(404); res.end(JSON.stringify({ error: req.url })); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  vi.stubGlobal('fetch', (path, opts) => {
    const controller = transferableAbortController();
    const abort = () => controller.abort(opts.signal.reason);
    if (opts.signal?.aborted) abort();
    opts.signal?.addEventListener('abort', abort, { once: true });
    return nativeFetch(new URL(path, base), { ...opts, signal: controller.signal })
      .finally(() => opts.signal?.removeEventListener('abort', abort));
  });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(async () => {
  life?.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  document.body.replaceChildren();
});

async function mount() {
  life = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  await petPage.mount({ root, ui, signal: life.signal, lifecycle: life, capabilities: {}, router: { navigate() {} }, onError(err) { throw err; } });
  const section = [...root.querySelectorAll('.sheet')].find((el) => el.textContent.includes(S.enabled));
  const enabled = [...section.querySelectorAll('label')].find((el) => el.textContent === S.enabled).querySelector('input');
  const apiKey = section.querySelector('input[type="password"]');
  return { section, enabled, apiKey, text: () => section.textContent };
}

it('shows the saved switch, and that the mode is off, waits for a key, or is on with why decisions fail', async () => {
  const { enabled, text } = await mount();
  await vi.waitFor(() => expect(text()).toContain(S.off));
  expect(enabled.checked).toBe(false);
  expect(text()).toContain(S.privacy);
  values[ENABLED] = true;
  decider = { mode: 'classic', enabled: true, failing: null };
  vi.advanceTimersByTime(3000);
  await vi.waitFor(() => expect(text()).toContain(S.needKey));
  expect(enabled.checked).toBe(true);
  decider = { mode: 'decider', enabled: true, failing: '返回错误：401 bad key' };
  vi.advanceTimersByTime(3000);
  await vi.waitFor(() => expect(text()).toContain(`${S.on}${S.lastFailed('返回错误：401 bad key')}`));
});

it('writes the switch alone to the decider group', async () => {
  const { enabled } = await mount();
  enabled.click();
  await vi.waitFor(() => expect(values[ENABLED]).toBe(true));
  expect(writes).toEqual([{ group: DECIDER_GROUP, values: { [ENABLED]: true } }]);
});

it('saves the API Key through the pet panel, clears the box and says it is saved', async () => {
  values[ENABLED] = true;
  decider = { mode: 'classic', enabled: true, failing: null };
  const { apiKey, section, text } = await mount();
  await vi.waitFor(() => expect(text()).toContain(S.needKey));
  apiKey.value = ' sk-or-typed-key ';
  [...section.querySelectorAll('button')].find((b) => b.textContent === S.keySave).click();
  await vi.waitFor(() => expect(keys).toEqual(['sk-or-typed-key']));
  await vi.waitFor(() => expect(text()).toContain(S.keySaved));
  expect(text()).toContain(S.on);
  expect(apiKey.value).toBe('');
  expect(writes).toEqual([]);
});
