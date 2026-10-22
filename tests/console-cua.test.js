// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { transferableAbortController } from 'node:util';
import { petPage } from '../console/features/pet/index.ts';
import { CUA_GROUP } from '../console/features/cua/index.ts';
import { S } from '../console/features/cua/strings.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';

const key = (name) => `worlds.desktop-pet.cua.${name}`;
const nativeFetch = globalThis.fetch;
let server, life, values, available, rejectWrites;

beforeEach(async () => {
  values = { [key('enabled')]: true, [key('control')]: true, [key('permission')]: 'ask-once', [key('grantMinutes')]: 30 };
  available = true;
  rejectWrites = false;
  localStorage.clear();
  document.body.replaceChildren();
  history.replaceState(null, '', '/#/pet');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (!available) { res.writeHead(503); res.end(JSON.stringify({ error: 'offline' })); return; }
    if (req.url === '/api/config' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (rejectWrites) { res.writeHead(500); res.end(JSON.stringify({ error: 'write failed' })); return; }
      Object.assign(values, JSON.parse(body).values);
      res.end(JSON.stringify({ result: 'saved' }));
    } else if (req.url === '/api/config') {
      res.end(JSON.stringify({ groups: [{ group: { id: CUA_GROUP }, values }] }));
    } else if (req.url.startsWith('/api/config/options/')) res.end(JSON.stringify({ options: [] }));
    else if (req.url.endsWith('/panels/pet/state')) res.end('{}');
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
  const label = [...root.querySelectorAll('label')].find((el) => el.textContent === S.enabled);
  const enabled = label.querySelector('input');
  const control = [...root.querySelectorAll('label')].find((el) => el.textContent === S.control).querySelector('input');
  const section = label.closest('.sheet');
  const grant = section.querySelector('input[type="number"]');
  const level = (name) => [...section.querySelectorAll('button.seg')].find((el) => el.textContent === S.levels[name]);
  await vi.waitFor(() => expect(grant.value).toBe(String(values[key('grantMinutes')])));
  return { section, enabled, control, grant, level };
}

it('restores the last saved switches and permission after a rejected write', async () => {
  const { section, enabled, control, level } = await mount();
  rejectWrites = true;
  enabled.click();
  await vi.waitFor(() => expect(enabled.checked).toBe(true));
  control.click();
  await vi.waitFor(() => expect(control.checked).toBe(true));
  level('never-ask').click();
  await vi.waitFor(() => expect(level('ask-once').classList.contains('active')).toBe(true));
  expect(section.textContent).toContain(S.saveFailed('write failed'));
  expect(values[key('enabled')]).toBe(true);
});

it('resynchronizes all four controls after Core becomes reachable again', async () => {
  const { enabled, control, level, grant } = await mount();
  available = false;
  enabled.click();
  await vi.waitFor(() => expect(enabled.checked).toBe(true));
  values = { [key('enabled')]: false, [key('control')]: false, [key('permission')]: 'ask-before-acting', [key('grantMinutes')]: 17 };
  available = true;
  await vi.advanceTimersByTimeAsync(3000);
  await vi.waitFor(() => expect(grant.value).toBe('17'));
  expect(enabled.checked).toBe(false);
  expect(control.checked).toBe(false);
  expect(level('ask-before-acting').classList.contains('active')).toBe(true);
});

it('keeps a pending confirmation and a focused grant edit intact during polling', async () => {
  values[key('enabled')] = false;
  const { section, enabled, grant } = await mount();
  enabled.click();
  expect(document.querySelector('.confirm-card')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(3000);
  expect(enabled.checked).toBe(true);
  document.querySelector('.confirm-card button').click();
  await vi.waitFor(() => expect(enabled.checked).toBe(false));
  grant.focus();
  grant.value = '75';
  rejectWrites = true;
  grant.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(section.textContent).toContain(S.saveFailed('write failed')));
  await vi.advanceTimersByTimeAsync(3000);
  expect(grant.value).toBe('75');
  grant.blur();
  await vi.advanceTimersByTimeAsync(3000);
  await vi.waitFor(() => expect(grant.value).toBe('30'));
});
