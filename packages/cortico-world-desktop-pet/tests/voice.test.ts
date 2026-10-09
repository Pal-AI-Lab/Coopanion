/**
 * Voice input end to end inside the World: PCM frames over the pet socket → segmenter →
 * FunASR or Whisper (a stand-in for sherpa-onnx's recognizer that answers with a set line) →
 * `desktop-pet.speech` event, with the listen phases the page shows along the way.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import type { MicMode } from '../src/config.ts';
import type { Language } from 'cortico/core/language.ts';
import type { SherpaModule } from '../src/asr/sherpa.ts';
import type { ModelSpec } from '../src/runtime/store.ts';
import { parseHotkey, type Hotkey } from '../src/asr/hotkey.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { fakeSapi } from './helpers/fake-sapi.ts';

/** A recognizer that answers `reply(samples)`; `decodes` lists how many samples each decode got. */
interface FakeFunAsr { sherpa: SherpaModule; decodes: number[]; configs: Array<Record<string, unknown>>; reply: (samples: number) => string }

function fakeFunAsr(text: string | ((samples: number) => string)): FakeFunAsr {
  const fake = { decodes: [] as number[], configs: [] as Array<Record<string, unknown>>, reply: typeof text === 'string' ? () => text : text } as FakeFunAsr;
  fake.sherpa = {
    OfflineRecognizer: {
      createAsync: async (config) => {
        fake.configs.push(config);
        return {
          createStream: () => {
            const stream = { samples: 0, acceptWaveform: (w: { samples: Float32Array }) => { stream.samples += w.samples.length; } };
            return stream;
          },
          decodeAsync: async (stream) => {
            const n = (stream as { samples: number }).samples;
            fake.decodes.push(n);
            return { text: fake.reply(n) };
          },
        };
      },
    },
  };
  return fake;
}

const MODEL = Buffer.from('model');
const TOKENS = Buffer.from('tokens');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** A small stand-in for the FunASR model, fetched from `url` when not placed beforehand. */
const modelSpec = (url = 'http://127.0.0.1:9'): ModelSpec => ({
  id: 'test-model',
  files: [{ role: 'model', name: 'model.int8.onnx', bytes: MODEL.length, sha256: sha(MODEL) }, { role: 'tokens', name: 'tokens.txt', bytes: TOKENS.length, sha256: sha(TOKENS) }],
  sources: [(f) => `${url}/${f}`],
});
function placeModel(modelsDir: string): void {
  mkdirSync(join(modelsDir, 'test-model'), { recursive: true });
  writeFileSync(join(modelsDir, 'test-model', 'model.int8.onnx'), MODEL);
  writeFileSync(join(modelsDir, 'test-model', 'tokens.txt'), TOKENS);
}
/** A small stand-in for the Whisper model, placed in `modelsDir`. */
function placeWhisper(modelsDir: string): ModelSpec {
  const files = ['encoder', 'decoder', 'tokens'].map((role) => ({ role, name: `${role}.bin`, body: Buffer.from(role) }));
  mkdirSync(join(modelsDir, 'test-whisper'), { recursive: true });
  for (const file of files) writeFileSync(join(modelsDir, 'test-whisper', file.name), file.body);
  return { id: 'test-whisper', files: files.map(({ role, name, body }) => ({ role, name, bytes: body.length, sha256: sha(body) })), sources: [] };
}

const tone = (ms: number, amp: number) => {
  const frames: Int16Array[] = [];
  for (let f = 0; f < ms / 20; f++) {
    const fr = new Int16Array(320);
    for (let i = 0; i < 320; i++) fr[i] = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 440 * (f * 320 + i) / 16000));
    frames.push(fr);
  }
  return frames;
};

const platform = process.platform;
let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  Object.defineProperty(process, 'platform', { value: platform });
  cleanup = [];
});

/** A talk key the test presses; `problem` makes it unreadable. */
function scriptedKey(problem?: string) {
  const key = { press: (_down: boolean) => {}, tap: () => {}, hotkey: null as Hotkey | null };
  const watch = async (hotkey: Hotkey, onChange: (down: boolean) => void, _pollMs: number, onTap?: (count: number) => void) => {
    if (problem) return problem;
    key.hotkey = hotkey;
    key.press = onChange;
    key.tap = () => onTap?.(1);
    return { stop: () => {} };
  };
  return { key, watch };
}

async function setup(text: string | ((samples: number) => string), mode: MicMode = 'always', watch?: ReturnType<typeof scriptedKey>['watch'], language: Language = 'zh') {
  const asr = fakeFunAsr(text);
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.mic.mode = mode;
  const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
  placeModel(join(dir, 'm'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
    watchHotkey: watch, loadSherpa: () => asr.sherpa, funasrModel: modelSpec(), whisperModel: placeWhisper(join(dir, 'm')), language: () => language,
  });
  const host = new FakeHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  return { asr, world, host, page };
}

describe('voice input', () => {
  it('turns a spoken utterance into one speech event that wakes', async () => {
    const { asr, host, page } = await setup('今天天气怎么样');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.speech', senderKey: 'desktop-pet.voice', text: '[语音] 伙伴:今天天气怎么样' });
    expect(host.pushOpts[0]).toEqual({ trigger: 'flush' });
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('今天天气怎么样');
    // the last decode is the whole utterance: at least the 900 ms spoken
    expect(asr.decodes.at(-1)).toBeGreaterThanOrEqual(900 * 16);
    expect(asr.configs[0]).toMatchObject({ modelConfig: { senseVoice: { language: 'zh' }, numThreads: 2 } });
  });

  it('drops a known hallucination and tells the page nothing was heard', async () => {
    const { host, page } = await setup('谢谢观看');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(host.events).toHaveLength(0);
  });

  it('hold: only audio while the talk key is down counts, and releasing the key ends the utterance', async () => {
    const { key, watch } = scriptedKey();
    const { host, page, world } = await setup('帮我看看这个', 'hold', watch);
    expect(key.hotkey).toEqual(parseHotkey(DESKTOP_PET_DEFAULTS.asr.mic.hotkey));
    for (const fr of tone(600, .3)) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
    // the quick tap before the held press: the pet perks up before it listens
    key.tap();
    await page.next((m) => m.t === 'listen' && m.phase === 'ready');
    key.press(true);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    // quiet speech still counts while the key is held, pauses included
    for (const fr of [...tone(500, .01), ...tone(800, 0), ...tone(300, .01)]) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    expect(host.events).toHaveLength(0);
    key.press(false);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:帮我看看这个');
  });

  it('a talk key that cannot be read falls back to listening all the time', async () => {
    const { watch } = scriptedKey('no keyboard here');
    const { host, page, world } = await setup('还是听得见', 'hold', watch);
    expect(world.voiceState().input).toMatchObject({ mode: 'hold', effectiveMode: 'always', hotkeyProblem: 'no keyboard here', open: true });
    expect((world.voiceState().input as { hint: string }).hint).toContain('no keyboard here');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
  });

  it('the microphone button held down sends the sentence without waiting for its closing pause', async () => {
    const { host, page } = await setup('帮我开灯');
    // speech with no pause after it: the segmenter is still inside the sentence
    for (const fr of tone(600, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await new Promise((r) => setTimeout(r, 300));
    expect(host.events).toHaveLength(0);
    page.send({ t: 'commit' });
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:帮我开灯');
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('帮我开灯');
  });

  it('toggle: sending the sentence switches the talk key off', async () => {
    const { key, watch } = scriptedKey();
    const { host, page, world } = await setup('好了', 'toggle', watch);
    key.press(true); key.press(false);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    for (const fr of tone(600, .3)) page.audio(fr);
    page.send({ t: 'commit' });
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect((world.voiceState().input as { open: boolean }).open).toBe(false);
  });

  it('the button held down with nothing heard closes the listening bubble and sends nothing', async () => {
    const { key, watch } = scriptedKey();
    const { asr, host, page } = await setup('x', 'toggle', watch);
    key.press(true); key.press(false);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    page.send({ t: 'commit' });
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(asr.decodes).toHaveLength(0);
    expect(host.events).toHaveLength(0);
  });

  it('system engine: the bubble shows the sentence while it is spoken, then the event carries the final text', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    Object.assign(cfg, { enabled: true, port: 0 });
    cfg.window.enabled = false;
    cfg.asr.engine = 'system';
    cfg.asr.mic.mode = 'always';
    // one character per 100 ms of audio heard so far; the final text settles on the whole sentence
    const { spawnImpl, spawned } = fakeSapi({ partial: (n) => '听'.repeat(Math.floor(n / 3200)) || null, final: () => '听清楚了' });
    const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
    const world = new DesktopPetWorld({ cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'), spawnSystemRecognizer: spawnImpl });
    const host = new FakeHost();
    await world.start(host);
    cleanup.push(() => world.stop());
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page.close());

    for (const fr of tone(600, .3)) page.audio(fr);
    const live = await page.next((m) => m.t === 'listen' && m.phase === 'partial' && typeof m.interim === 'string' && m.interim.length >= 3);
    expect(live.text).toBe('');
    expect(host.events).toHaveLength(0);
    for (const fr of tone(900, 0)) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:听清楚了');
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('听清楚了');
    // one streamed sentence, not a second pass over the finished audio
    expect(spawned[0].lines.filter((l) => l.startsWith('B '))).toHaveLength(1);
  });

  it('funasr: the bubble shows what is heard while the sentence is spoken', async () => {
    // one character per 100 ms of audio decoded so far
    const { host, page } = await setup((n) => '听'.repeat(Math.floor(n / 1600)));
    for (const fr of tone(1400, .3)) page.audio(fr);
    const live = await page.next((m) => m.t === 'listen' && m.phase === 'partial' && typeof m.interim === 'string' && m.interim.length >= 3);
    expect(live.text).toBe('');
    expect(host.events).toHaveLength(0);
    for (const fr of tone(900, 0)) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text.length).toBeGreaterThan('[语音] 伙伴:'.length + 13);
  });

  it('whisper: an app language SenseVoice does not hear goes to Whisper in that language, decoded once when the sentence ends', async () => {
    const { asr, host, page } = await setup('Quelle heure est-il ?', 'always', undefined, 'fr');
    for (const fr of tone(1400, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await new Promise((r) => setTimeout(r, 300));
    expect(asr.decodes).toHaveLength(0);
    for (const fr of tone(900, 0)) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toContain('Quelle heure est-il ?');
    expect(asr.decodes).toHaveLength(1);
    expect(asr.configs[0]).toMatchObject({ modelConfig: { whisper: { language: 'fr', task: 'transcribe' } } });
  });

  it('whisper: a talk key held over silence is not decoded and sends nothing', async () => {
    const { key, watch } = scriptedKey();
    const { asr, host, page } = await setup('Повтори', 'hold', watch, 'ru');
    key.press(true);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    for (const fr of tone(800, 0)) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    key.press(false);
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(asr.decodes).toHaveLength(0);
    expect(host.events).toHaveLength(0);
  });

  it('funasr without its model says so, and the download starts it', async () => {
    const MODEL_FILES: Record<string, Buffer> = { 'model.int8.onnx': Buffer.from('model'), 'tokens.txt': Buffer.from('tokens') };
    const server = createServer((req, res) => {
      const body = MODEL_FILES[(req.url ?? '').slice(1)];
      if (!body) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-length': String(body.length) }).end(body);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    cleanup.push(() => new Promise((r) => server.close(() => r())));
    const asr = fakeFunAsr('你好');
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    Object.assign(cfg, { enabled: true, port: 0 });
    cfg.window.enabled = false;
    const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
    const world = new DesktopPetWorld({
      cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
      loadSherpa: () => asr.sherpa, funasrModel: modelSpec(`http://127.0.0.1:${(server.address() as { port: number }).port}`),
    });
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    await expect.poll(() => (world.voiceState().server as { detail: string | null }).detail).toContain('识别模型还没下载');
    expect((world.voiceState().server as { phase: string }).phase).toBe('stopped');
    expect((world.voiceState().model as { phase: string }).phase).toBe('absent');
    await world.installVoice();
    expect((world.voiceState().model as { phase: string }).phase).toBe('ready');
    expect((world.voiceState().server as { phase: string }).phase).toBe('running');
    expect(asr.configs).toHaveLength(1);
  });

  it('ignores quiet input', async () => {
    const { asr, page, world } = await setup('x');
    for (const fr of tone(1500, .002)) page.audio(fr);
    await new Promise((r) => setTimeout(r, 400));
    expect(asr.decodes).toHaveLength(0);
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
  });
});
