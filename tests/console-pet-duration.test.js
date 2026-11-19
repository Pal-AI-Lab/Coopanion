// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { petPage } from '../console/features/pet/index.ts';
import { S } from '../console/features/pet/strings.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { BUBBLE_HOLD_AUTO_SEC, BUBBLE_HOLD_MIN_SEC, BUBBLE_HOLD_MAX_SEC } from '../packages/cortico-world-desktop-pet/web/bubble-timing.js';

const key = {
  enabled: 'worlds.desktop-pet.saidBubbles',
  input: 'worlds.desktop-pet.saidBubbleHoldSec',
  speech: 'worlds.desktop-pet.window.sayBubbleHoldSec',
};
let life;

afterEach(() => {
  life?.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount(values, save = (patch) => Object.assign(values, patch)) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', async (path, request) => {
    if (path !== '/api/config') return Response.json({});
    const group = { id: 'world:desktop-pet' };
    if (request.method === 'GET') return Response.json({ groups: [{ group, values }] });
    const update = JSON.parse(request.body);
    expect(update.group).toBe(group.id);
    return save(update.values) === false
      ? Response.json({ error: 'Test write failed' }, { status: 400 })
      : Response.json({ result: 'Saved' });
  });
  life = new Lifecycle();
  const root = document.createElement('main');
  document.body.append(root);
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  await petPage.mount({ root, lifecycle: life, signal: life.signal, ui });
  const row = (label) => [...root.querySelectorAll('.companion-row')]
    .find((r) => r.querySelector('.companion-label').textContent === label);
  return {
    toggle: row(S.saidBubbleLabel).querySelector('input[type="checkbox"]'),
    duration: (label) => {
      const r = row(label);
      return { mode: r.querySelector('select'), seconds: r.querySelector('input[type="number"]') };
    },
  };
}

function change(field, value) {
  field.value = String(value);
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

it('keeps the configured input duration when the input bubbles are turned off and on', async () => {
  const values = { [key.enabled]: false, [key.input]: BUBBLE_HOLD_MAX_SEC };
  const { toggle, duration } = await mount(values);
  const { mode, seconds } = duration(S.saidBubbleHold);
  expect(toggle.checked).toBe(false);
  expect(mode.disabled).toBe(true);
  expect(mode.value).toBe('fixed');
  expect(seconds.valueAsNumber).toBe(BUBBLE_HOLD_MAX_SEC);
  toggle.click();
  await vi.waitFor(() => expect(toggle.disabled).toBe(false));
  expect(values[key.enabled]).toBe(true);
  expect(mode.disabled).toBe(false);
  change(seconds, BUBBLE_HOLD_MIN_SEC);
  await vi.waitFor(() => expect(values[key.input]).toBe(BUBBLE_HOLD_MIN_SEC));
  toggle.click();
  await vi.waitFor(() => expect(toggle.disabled).toBe(false));
  expect(values).toMatchObject({ [key.enabled]: false, [key.input]: BUBBLE_HOLD_MIN_SEC });
  toggle.click();
  await vi.waitFor(() => expect(toggle.disabled).toBe(false));
  expect(values[key.enabled]).toBe(true);
  expect(seconds.valueAsNumber).toBe(BUBBLE_HOLD_MIN_SEC);
});

it('saves automatic and fixed speech duration and restores the last saved value after a failed write', async () => {
  const values = { [key.speech]: BUBBLE_HOLD_AUTO_SEC };
  let accept = true;
  const { duration } = await mount(values, (patch) => accept && Object.assign(values, patch));
  const { mode, seconds } = duration(S.sayBubbleHold);
  expect(mode.value).toBe('auto');
  expect(seconds.closest('[hidden]')).not.toBeNull();
  change(mode, 'fixed');
  await vi.waitFor(() => expect(mode.disabled).toBe(false));
  const initial = seconds.valueAsNumber;
  expect(values[key.speech]).toBe(initial);
  expect(initial).toBeGreaterThanOrEqual(BUBBLE_HOLD_MIN_SEC);
  expect(seconds.closest('[hidden]')).toBeNull();
  change(seconds, BUBBLE_HOLD_MAX_SEC + 1);
  expect(seconds.valueAsNumber).toBe(initial);
  expect(values[key.speech]).toBe(initial);
  accept = false;
  change(seconds, BUBBLE_HOLD_MAX_SEC);
  await vi.waitFor(() => expect(seconds.valueAsNumber).toBe(initial));
  expect(values[key.speech]).toBe(initial);
  accept = true;
  change(mode, 'auto');
  await vi.waitFor(() => expect(values[key.speech]).toBe(BUBBLE_HOLD_AUTO_SEC));
  expect(seconds.closest('[hidden]')).not.toBeNull();
});
