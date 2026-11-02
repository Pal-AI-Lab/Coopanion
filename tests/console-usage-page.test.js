// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountUsage } from '../console/features/cost/index.ts';
import { S } from '../console/features/cost/strings.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';

/** A range with no calls in it. */
const aggregate = { from: '2026-11-01', to: '2026-11-02', timezone: 'UTC', bucket: 'day', currency: 'USD', currencies: [], totals: { calls: 0 }, series: [], byRole: [], byModel: [], byInstance: [] };
const OFFLINE = 'usage store offline';
let life, available;

beforeEach(() => {
  available = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', async (path) => {
    if (!String(path).startsWith('/api/usage?')) throw new Error(`Unexpected request: ${path}`);
    return available
      ? new Response(JSON.stringify(aggregate), { status: 200 })
      : new Response(JSON.stringify({ error: OFFLINE }), { status: 503 });
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T08:00:00Z'));
});

afterEach(() => {
  life?.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function mount() {
  life = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  mountUsage({ root, ui, signal: life.signal, lifecycle: life, capabilities: {}, router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) }, onError(err) { throw err; } });
  return { root, ui };
}

it('keeps a refresh failure beside the stale results and reports every refresh the person asks for', async () => {
  const { root, ui } = mount();
  await vi.waitFor(() => expect(root.textContent).toContain(S.noCalls));
  const stale = S.stale(OFFLINE, ui.fmt.clock(new Date().toISOString()));
  const refresh = [...root.querySelectorAll('button')].find((el) => el.textContent === S.refresh);
  const notice = root.querySelector('.unotice');
  const results = root.querySelector('.uresults');

  available = false;
  refresh.click();
  await vi.waitFor(() => expect(notice.textContent).toBe(stale));
  expect(notice.hidden).toBe(false);
  expect(results.contains(notice)).toBe(false);
  expect(results.classList.contains('u-stale')).toBe(true);
  expect(document.querySelector('.toast.bad').textContent).toBe(stale);

  // a second refresh while the results are already stale is reported too
  document.querySelector('.toast.bad button').click();
  refresh.click();
  await vi.waitFor(() => expect(document.querySelector('.toast.bad')?.textContent).toBe(stale));
  expect(notice.textContent).toBe(stale);

  available = true;
  refresh.click();
  await vi.waitFor(() => expect(results.classList.contains('u-stale')).toBe(false));
  expect(notice.hidden).toBe(true);
});
