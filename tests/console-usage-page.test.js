// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountUsage } from '../console/features/cost/index.ts';
import { S } from '../console/features/cost/strings.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';
import { bucketFits, MAX_BUCKETS } from '../console/features/cost/range.ts';

/** A range with no calls in it. */
const aggregate = { from: '2026-11-01', to: '2026-11-02', timezone: 'UTC', bucket: 'day', currency: 'USD', currencies: [], totals: { calls: 0 }, series: [], byRole: [], byModel: [], byInstance: [] };
const OFFLINE = 'usage store offline';
let life, available, requested, usage, worlds;

beforeEach(() => {
  available = true;
  usage = aggregate;
  worlds = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  requested = [];
  vi.stubGlobal('fetch', async (path) => {
    if (String(path) === '/api/worlds') return new Response(JSON.stringify({ worlds }), { status: 200 });
    if (!String(path).startsWith('/api/usage?')) throw new Error(`Unexpected request: ${path}`);
    requested.push(new URLSearchParams(String(path).slice('/api/usage?'.length)));
    return available
      ? new Response(JSON.stringify(usage), { status: 200 })
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

it('keeps refresh failures and their range beside stale results until retry succeeds, without duplicate notifications', async () => {
  const { root, ui } = mount();
  await vi.waitFor(() => expect(root.textContent).toContain(S.noCalls));
  const stale = S.stale(OFFLINE, ui.fmt.clock(new Date().toISOString()));
  const refresh = [...root.querySelectorAll('button')].find((el) => el.textContent === S.refresh);
  const notice = root.querySelector('.read-feedback');
  const results = root.querySelector('.uresults');

  available = false;
  refresh.click();
  await vi.waitFor(() => expect(notice.textContent).toContain(stale));
  expect(notice.textContent).toContain(aggregate.from);
  expect(notice.textContent).toContain(aggregate.to);
  expect(results.contains(notice)).toBe(false);
  expect(results.classList.contains('u-stale')).toBe(true);
  expect(document.querySelector('.toast')).toBeNull();

  // Repeated failures update the same region without adding notifications.
  refresh.click();
  await vi.waitFor(() => expect(notice.textContent).toContain(stale));
  expect(document.querySelector('.toast')).toBeNull();

  available = true;
  notice.querySelector('button').click();
  await vi.waitFor(() => expect(results.classList.contains('u-stale')).toBe(false));
  expect(notice.textContent).toBe('');
});

it('offers no granularity that splits the range into more than MAX_BUCKETS bars, and moves a pick that stops fitting to the finest that does', async () => {
  const { root } = mount();
  await vi.waitFor(() => expect(requested.length).toBe(1));
  const [ranges, , buckets] = root.querySelectorAll('.segwrap');
  const button = (wrap, label) => [...wrap.children].find((el) => el.textContent === label);
  const minute = button(buckets, S.bucketMinute), hour = button(buckets, S.bucketHour);
  // seven days by the minute is more bars than the chart draws; by the hour it is not
  expect(7 * 24 * 60).toBeGreaterThan(MAX_BUCKETS);
  expect(minute.disabled).toBe(true);
  expect(minute.title).toBe(S.bucketTooFine(MAX_BUCKETS));
  expect(hour.disabled).toBe(false);

  button(ranges, S.presetToday).click();
  await vi.waitFor(() => expect(requested.length).toBe(2));
  expect(minute.disabled).toBe(false);
  minute.click();
  await vi.waitFor(() => expect(requested.at(-1).get('bucket')).toBe('minute'));

  button(ranges, S.preset90).click();
  await vi.waitFor(() => expect(requested.at(-1).get('days')).toBe('90'));
  expect(requested.at(-1).get('bucket')).toBe('hour');
  expect(hour.classList.contains('active')).toBe(true);
});

it('lists usage by World under the names /api/worlds gives, ids for Worlds it no longer lists, and the unattributed part last', async () => {
  const group = (key, calls, cost) => ({ key, calls, cost, promptTokens: 0, completionTokens: 0, cacheHitRate: null });
  usage = { ...aggregate, byWorld: [group('qq', 3, 2), group('removed-world', 1, 1)], unattributed: group('unattributed', 2, 0.5) };
  worlds = [{ id: 'qq', label: 'QQ chats' }];
  const { root } = mount();
  [...root.querySelectorAll('button')].find((el) => el.textContent === S.byWorld).click();
  const firstCells = () => [...root.querySelectorAll('tbody tr')].map((row) => row.children[0].textContent);
  await vi.waitFor(() => expect(firstCells()).toEqual(['QQ chats qq', 'removed-world', S.unattributed]));
});

it('offers only a day or coarser over a custom range with an open end, which may reach back to the first record', () => {
  expect(['minute', 'hour', 'day', 'week', 'month', 'auto'].filter((unit) => bucketFits(unit, NaN))).toEqual(['day', 'week', 'month', 'auto']);
});
