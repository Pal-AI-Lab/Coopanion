// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createConfigView } from '../console/advanced/features/config/view.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';

const json = (body) => new Response(JSON.stringify(body), { status: 200 });
const group = {
  id: 'worlds.voice', owner: 'world:voice',
  schema: {
    title: 'Voice',
    properties: {
      'worlds.voice.preset': { type: 'string', title: 'Preset', 'x-options': 'voice.preset' },
      'worlds.voice.audio': { type: 'string', title: 'Reference audio' },
      'worlds.voice.text': { type: 'string', title: 'Reference text' },
    },
  },
};

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('after a save, shows the values the Core changed alongside it and leaves fields edited since untouched', async () => {
  let server = { 'worlds.voice.preset': 'a', 'worlds.voice.audio': 'a.wav', 'worlds.voice.text': 'A' };
  const posted = [];
  let releasePost = () => {};
  vi.stubGlobal('fetch', async (path, options) => {
    if (path.startsWith('/api/config/options/')) return json({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    if (path === '/api/config' && options.method === 'POST') {
      const { values } = JSON.parse(options.body);
      posted.push(values);
      // picking a preset makes the World write that preset's reference audio and text into the same group
      await new Promise((resolve) => { releasePost = resolve; });
      const preset = values['worlds.voice.preset'];
      server = { ...values, 'worlds.voice.audio': `${preset}.wav`, 'worlds.voice.text': preset.toUpperCase() };
      return json({ ok: true, result: 'Saved' });
    }
    if (path === '/api/config') return json({ groups: [{ group, values: server }] });
    throw new Error(`Unexpected request: ${path}`);
  });
  const life = new Lifecycle((error) => { throw error; });
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  const view = createConfigView({ ui, lifecycle: life, signal: life.signal });
  document.body.append(view.el);
  await view.load();
  const field = (label) => [...view.el.querySelectorAll('.configrow')]
    .find((row) => row.querySelector('.companion-label').textContent === label)
    .querySelector('select, input');
  const [preset, audio, text] = [field('Preset'), field('Reference audio'), field('Reference text')];
  await vi.waitFor(() => expect(preset.options).toHaveLength(2));

  preset.value = 'b';
  preset.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  // edited while the save is on its way, not saved yet
  text.focus();
  text.value = 'My own text';
  text.dispatchEvent(new Event('input'));
  releasePost();

  await vi.waitFor(() => expect(audio.value).toBe('b.wav'));
  expect(text.value).toBe('My own text');
  expect(document.activeElement).toBe(text);
  expect(field('Reference audio')).toBe(audio);

  // the next save of the group carries the audio the Core wrote
  text.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]).toEqual({ 'worlds.voice.preset': 'b', 'worlds.voice.audio': 'b.wav', 'worlds.voice.text': 'My own text' });
  releasePost();
  life.dispose();
});
