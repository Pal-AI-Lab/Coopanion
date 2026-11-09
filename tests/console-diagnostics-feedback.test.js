// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';
import { createEventsView } from '../console/advanced/features/core/events.ts';
import { createRunlogView } from '../console/advanced/features/core/runlog.ts';

let life;
afterEach(() => { life?.dispose(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function setup() {
  life = new Lifecycle(() => {});
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, value) => value, set() {} } });
  const deps = { ui, signal: life.signal, lifecycle: life, onError() {} };
  const events = createEventsView(deps), log = createRunlogView(deps);
  document.body.append(events.el, log.el);
  return { events, log };
}

it('keeps an event read error through a successful log read, and clears only the recovered source', async () => {
  let unavailable = true;
  vi.stubGlobal('fetch', async path => path.startsWith('/api/events')
    ? unavailable ? json({ error: 'Event store unavailable' }, 503) : json({ events: [{ cursor: 1, ts: '2026-01-01T00:00:00Z', source: 'example', type: 'notice', text: 'Recovered event' }], latest: 1 })
    : path === '/api/runs' ? json({ current: 'r1', runs: [{ run: 'r1' }] }) : json([]));
  const { events, log } = setup();
  await events.init(); await log.refresh();
  expect(events.el.querySelector('.extension-list-problem')?.textContent).toContain('Event store unavailable');
  expect(events.el.querySelector('table').closest('[hidden]')).not.toBeNull();
  expect(log.el.querySelector('.extension-list-problem')).toBeNull();
  unavailable = false;
  events.el.querySelector('.extension-list-problem button').click();
  await vi.waitFor(() => expect(events.el.textContent).toContain('Recovered event'));
  expect(events.el.querySelector('.extension-list-problem')).toBeNull();
  expect(events.el.querySelector('table').closest('[hidden]')).toBeNull();
});

it('ignores an older log failure after a newer query succeeds', async () => {
  let fail;
  let count = 0;
  vi.stubGlobal('fetch', async path => {
    if (path === '/api/runs') return json({ current: 'r1', runs: [{ run: 'r1' }] });
    if (++count === 1) return new Promise(resolve => { fail = () => resolve(json({ error: 'Old request failed' }, 503)); });
    return json([{ ts: '2026-01-01T00:00:00Z', level: 'info', area: 'example', msg: 'Current result' }]);
  });
  const { log } = setup();
  const old = log.refresh();
  await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
  await log.refresh(); fail(); await old;
  expect(log.el.textContent).toContain('Current result');
  expect(log.el.querySelector('.extension-list-problem')).toBeNull();
});

it('shows an identical log summary and error once, with the original exception available on expansion', async () => {
  vi.stubGlobal('fetch', async path => path === '/api/runs'
    ? json({ current: 'r1', runs: [{ run: 'r1' }] })
    : json([{ ts: '2026-01-01T00:00:00Z', level: 'error', area: 'example', msg: 'Connection refused', err: { name: 'Error', message: 'Connection refused', stack: 'Example stack' } }]));
  const { log } = setup(); await log.refresh();
  const row = log.el.querySelector('details');
  expect(row.open).toBe(false);
  expect(row.querySelector('summary').textContent).toBe('Connection refused');
  row.open = true;
  expect(row.querySelector('pre').textContent).toContain('Example stack');
});
