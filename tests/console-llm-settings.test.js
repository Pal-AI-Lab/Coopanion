// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { llmSettingsPanel } from '../console/advanced/console-pages/builtins/llm-settings/panel.ts';
import { panel } from '../console/advanced/console-pages/builtins/llm-settings/strings.ts';
import { pick } from '../console/base/language.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';

const S = pick(panel);
let life;
afterEach(() => { life?.abort(); document.body.replaceChildren(); vi.restoreAllMocks(); });

/** One saved endpoint `main`, as the llm-settings data source reports it. */
function state() {
  const path = (key) => `providers.main.${key}`;
  return {
    active: 'main',
    reasoningTiers: [{ id: 'off', label: 'Off', thinking: false }],
    serviceTiers: [],
    instances: [{
      name: 'main',
      entry: { kind: 'fixture', baseUrl: 'https://one.test', secret: 'KEY', spec: { model: 'alpha', thinking: false } },
      quotes: [],
      secretConfigured: 'file',
      config: [{
        group: { id: 'providers.main', owner: 'core', schema: { properties: {
          [path('baseUrl')]: { type: 'string', title: 'Base URL' },
          [path('secret')]: { type: 'string', title: 'Secret' },
          [path('multimodal')]: { type: 'boolean', title: 'Multimodal' },
        } } },
        values: { [path('baseUrl')]: 'https://one.test', [path('secret')]: 'KEY', [path('multimodal')]: false },
      }],
    }],
  };
}

/** The panel over `invoke`; configuration writes succeed. */
async function mount(invoke) {
  life = new AbortController();
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 800 });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  await llmSettingsPanel.mount({
    root, ui, language: 'zh', signal: life.signal, scope: {},
    invoke: async (method, args = []) => (method === 'state' ? state() : invoke(method, args)),
    setConfig: async () => {},
    refresh: async () => {},
    mountSlot: async () => ({ dispose() {} }),
  });
  return root;
}
const button = (root, label) => [...root.querySelectorAll('button')].find((el) => el.textContent === label);
const bounds = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

it('returns the model to free text with the reason under it when the catalog of a changed endpoint cannot be fetched', async () => {
  let models = async () => ({ models: [{ id: 'alpha' }, { id: 'beta' }] });
  const root = await mount(async (method) => (method === 'models' ? models() : {}));
  const model = () => root.querySelector(`[aria-label="${S.modelAria}"]`);
  button(root, S.fetchModels).click();
  await vi.waitFor(() => expect(model().tagName).toBe('SELECT'));
  expect(root.textContent).toContain(S.modelsFetched(2));

  const failure = new Error('endpoint unreachable');
  models = async () => { throw failure; };
  const baseUrl = root.querySelector(`[aria-label="${S.baseUrl}"]`);
  baseUrl.value = 'https://two.test';
  baseUrl.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(model().tagName).toBe('INPUT'));
  expect(model().value).toBe('alpha');
  expect(root.textContent).toContain(S.modelListFailed(String(failure)));
  expect(root.textContent).not.toContain(S.modelsFetched(2));
});

it('opens a failed deletion beside the Delete button once the confirmation has closed', async () => {
  const root = await mount(async (method) => { if (method === 'delete') throw new Error('instance in use'); return {}; });
  const remove = button(root, S.delete);
  vi.spyOn(remove, 'getBoundingClientRect').mockReturnValue(bounds(300, 400, 80, 30));
  remove.click();
  await vi.waitFor(() => expect(document.querySelector('.confirm-card')).not.toBeNull());
  [...document.querySelectorAll('.confirm-card button')].at(-1).click();
  await vi.waitFor(() => expect(document.querySelector('.extension-problem:not(.hidden)')?.textContent).toContain('instance in use'));
  expect(document.querySelector('.confirm-card')).toBeNull();
  expect(document.querySelector('.toast')).toBeNull();
});
