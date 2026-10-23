import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { DESKTOP_PET_DEFAULTS } from '../packages/cortico-world-desktop-pet/src/config.ts';
import { DesktopPetWorld } from '../packages/cortico-world-desktop-pet/src/world.ts';
import { petText } from '../packages/cortico-world-desktop-pet/src/i18n/index.ts';
import bundle from '../packages/cortico-world-desktop-pet/src/webui/client.ts';
import { FakeHost } from '../packages/cortico-world-desktop-pet/tests/helpers/fake-host.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';

// Node environment with a window of its own: under the jsdom environment Vite rewrites the World's
// `new URL(path, import.meta.url)` file paths into http URLs.
let world, panel;

afterEach(async () => {
  panel?.unmount();
  vi.unstubAllGlobals();
  await world?.stop();
});

/** Writes a config patch into the live section, as Core does with a World's persist. */
const merge = (to, patch) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) merge(to[k], v);
    else to[k] = v;
  }
};

/** The 「语音输入」 panel over a started World with voice input off and no model on disk. */
async function mount() {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  cfg.asr.engine = 'funasr';
  cfg.asr.mic.mode = 'always';
  const dir = mkdtempSync(join(tmpdir(), 'console-voice-'));
  world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: (patch) => merge(cfg, patch), runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
  });
  await world.start(new FakeHost());
  const { window } = new JSDOM('<!doctype html><body></body>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  // the panel's signal and its DOM come from the same window
  const controller = new window.AbortController();
  const timers = [];
  panel = { unmount: () => { controller.abort(); timers.forEach(clearInterval); } };
  const root = window.document.createElement('div');
  window.document.body.append(root);
  bundle.panels.voice.mount({
    pageId: 'world:desktop-pet', panelId: 'voice', language: 'zh', root, signal: controller.signal,
    ui: createConsoleUi({ doc: window.document, overlayHost: window.document.body, signal: controller.signal, memo: { get: (_, fallback) => fallback, set() {} } }),
    invoke: async (method, args = []) => JSON.parse(JSON.stringify(await world.webUi().invoke('voice', method, args))),
    interval: (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return { dispose: () => clearInterval(id) }; },
    own: (d) => { controller.signal.addEventListener('abort', () => d.dispose()); return d; },
    stream: () => ({ dispose() {}, send() {}, open: false }),
  });
  const t = petText('zh').panel;
  const start = [...root.querySelectorAll('button')].find((b) => b.textContent === t.start);
  const enabled = root.querySelector('input[role="switch"]');
  return { start, enabled, Event: window.Event };
}

it('greys out 启动 while voice input is off and enables it once voice input is on', async () => {
  const { start, enabled, Event } = await mount();
  await vi.waitFor(() => expect(start.disabled).toBe(true));
  expect(enabled.checked).toBe(false);
  enabled.checked = true;
  enabled.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(start.disabled).toBe(false));
});
