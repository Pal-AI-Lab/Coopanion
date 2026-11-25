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
import { DESKTOP_PET_DEFAULTS, RECORDING_MINUTES_MIN } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import { petText } from '../src/i18n/index.ts';
import type { MicMode } from '../src/config.ts';
import type { Language } from 'cortico/core/language.ts';
import type { SherpaModule } from '../src/asr/sherpa.ts';
import type { ModelSpec } from '../src/runtime/store.ts';
import { parseHotkey, splitTaps, tapTracker, TAP_MAX_MS, type Hotkey, type watchHotkey } from '../src/asr/hotkey.ts';
import { rmsDb } from '../src/asr/segmenter.ts';
import { chatHistory } from '../src/chat.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { fakeSapi } from './helpers/fake-sapi.ts';

/** A recognizer that answers `reply(samples)`; `decodes` lists how many samples each decode got. */
interface FakeFunAsr { sherpa: SherpaModule; decodes: number[]; audio: Float32Array[]; configs: Array<Record<string, unknown>>; reply: (samples: number) => string; beforeLoad?: () => Promise<void>; beforeDecode?: () => Promise<void> }

function fakeFunAsr(text: string | ((samples: number) => string)): FakeFunAsr {
  const fake = { decodes: [] as number[], audio: [] as Float32Array[], configs: [] as Array<Record<string, unknown>>, reply: typeof text === 'string' ? () => text : text } as FakeFunAsr;
  fake.sherpa = {
    OfflineRecognizer: {
      createAsync: async (config) => {
        fake.configs.push(config);
        await fake.beforeLoad?.();
        return {
          createStream: () => {
            const stream = {
              samples: 0, audio: new Float32Array(),
              acceptWaveform: (w: { samples: Float32Array }) => {
                const audio = new Float32Array(stream.samples + w.samples.length);
                audio.set(stream.audio); audio.set(w.samples, stream.samples);
                stream.audio = audio;
                stream.samples += w.samples.length;
              },
            };
            return stream;
          },
          decodeAsync: async (stream) => {
            const { samples: n, audio } = stream as { samples: number; audio: Float32Array };
            fake.decodes.push(n);
            fake.audio.push(audio);
            await fake.beforeDecode?.();
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

const floatAudio = (frames: Int16Array[]) => Float32Array.from(frames.flatMap((frame) => [...frame]), (sample) => sample / 32768);

async function sendAudio(world: DesktopPetWorld, page: FakePage, frames: Int16Array[]): Promise<void> {
  for (const frame of frames) page.audio(frame);
  await expect.poll(() => world.voiceState().level).toBe(rmsDb(frames.at(-1)!));
}

/** Writes a config patch into the live section, as Core does with a World's persist. */
const merge = (to: Record<string, unknown>, patch: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) merge(to[k] as Record<string, unknown>, v as Record<string, unknown>);
    else to[k] = v;
  }
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

/** Hardware key samples go through the production gesture tracker for every active watcher. */
function sampledKeys() {
  const held = new Set<number>();
  const watchers = new Set<{ keys: number[]; step: ReturnType<typeof tapTracker> }>();
  let pollMs = 0;
  const watch: typeof watchHotkey = async (hotkey, onChange, intervalMs, onTap, _text, trigger, onRelease) => {
    pollMs = intervalMs;
    const watcher = { keys: hotkey.keys, step: tapTracker(hotkey.taps, onChange, onTap, trigger, onRelease) };
    watchers.add(watcher);
    return { stop: () => { watchers.delete(watcher); } };
  };
  const sample = (key: string, down: boolean, at: number) => {
    for (const vk of parseHotkey(key)!.keys) {
      if (down) held.add(vk); else held.delete(vk);
    }
    for (const watcher of watchers) {
      const down = watcher.keys.every((vk) => held.has(vk));
      watcher.step(down, at, down && [...held].some((vk) => !watcher.keys.includes(vk)));
    }
  };
  return { watch, sample, get pollMs() { return pollMs; } };
}

async function setup(text: string | ((samples: number) => string), mode: MicMode = 'always', watch?: ReturnType<typeof scriptedKey>['watch'], language: Language = 'zh', openOnPress = false, loadGate?: Promise<void>, serviceEnabled = true) {
  const asr = fakeFunAsr(text);
  if (loadGate) asr.beforeLoad = () => loadGate;
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.mic.mode = mode;
  cfg.asr.mic.openOnPress = openOnPress;
  cfg.asr.serviceEnabled = serviceEnabled;
  const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
  placeModel(join(dir, 'm'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: (patch) => merge(cfg as never, patch as never), runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
    watchHotkey: watch, loadSherpa: () => asr.sherpa, funasrModel: modelSpec(), whisperModel: placeWhisper(join(dir, 'm')), language: () => language,
  });
  const host = new FakeHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe(!serviceEnabled ? 'stopped' : loadGate ? 'starting' : 'running');
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  return { asr, world, host, page, cfg };
}

describe('voice input', () => {
  it.each(['zh', 'fr'] as Language[])('unloads the %s recognition model when disabled and reloads it when enabled', async (language) => {
    const { cfg, world, page, asr } = await setup('hello', 'always', undefined, language);
    cfg.asr.enabled = false;
    await page.next((m) => m.t === 'prefs' && m.mic === false);
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('stopped');
    cfg.asr.enabled = true;
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    expect(asr.configs).toHaveLength(2);
  });

  it('starting from the panel while another start is loading the model loads it once, and the start and stop are saved', async () => {
    const { cfg, world, asr } = await setup('hello', 'always', undefined, 'zh', false, undefined, false);
    let loaded!: () => void;
    const gate = new Promise<void>((resolve) => { loaded = resolve; });
    asr.beforeLoad = () => gate;
    try {
      const first = world.webUi().invoke!('voice', 'start', []);
      const joined = world.startVoiceBackend();
      await expect.poll(() => asr.configs.length).toBe(1);
      expect(cfg.asr.serviceEnabled).toBe(true);
      const second = world.webUi().invoke!('voice', 'start', []);
      loaded();
      await Promise.all([first, second, joined]);
      expect(world.voiceState().server).toMatchObject({ phase: 'running' });
      expect(asr.configs).toHaveLength(1);
      await Promise.all([world.webUi().invoke!('voice', 'stop', []), world.webUi().invoke!('voice', 'stop', [])]);
      expect(cfg.asr.serviceEnabled).toBe(false);
      expect(world.voiceState().server).toMatchObject({ phase: 'stopped' });
    } finally { loaded(); }
  });

  it('stops the active engine when the configured engine changes before the stop request', async () => {
    const { cfg, world } = await setup('hello');
    cfg.asr.engine = 'whisper';
    await world.webUi().invoke!('voice', 'stop', []);
    cfg.asr.engine = 'funasr';
    expect((world.voiceState().server as { phase: string }).phase).toBe('stopped');
  });

  it('finishes unloading a pending model before a rapid disable and enable starts it again', async () => {
    let loaded!: () => void;
    const loadGate = new Promise<void>((resolve) => { loaded = resolve; });
    const { cfg, world, page, asr } = await setup('hello', 'always', undefined, 'zh', false, loadGate);
    try {
      cfg.asr.enabled = false;
      await page.next((m) => m.t === 'prefs' && (m.voice as { enabled?: boolean })?.enabled === false);
      cfg.asr.enabled = true;
      const restarted = world.startVoiceBackend();
      loaded();
      await restarted;
      expect((world.voiceState().server as { phase: string }).phase).toBe('running');
      expect(asr.configs).toHaveLength(2);
    } finally { loaded(); }
  });

  it('closes the system helper when voice input is disabled', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    Object.assign(cfg, { enabled: true, port: 0 });
    cfg.window.enabled = false;
    cfg.asr.engine = 'system';
    cfg.asr.mic.mode = 'always';
    const { spawnImpl, spawned } = fakeSapi({ final: () => 'hello' });
    const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
    const world = new DesktopPetWorld({ cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'), spawnSystemRecognizer: spawnImpl });
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    cfg.asr.enabled = false;
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('stopped');
    expect(spawned[0].child.exitCode).toBe(0);
    expect(world.voiceState().server).toMatchObject({ pid: null });
  });

  it('turns a spoken utterance into one speech event that wakes without interrupting the round', async () => {
    const { asr, host, page } = await setup('今天天气怎么样');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.speech', senderKey: 'desktop-pet.voice', text: '[voice] 伙伴:今天天气怎么样' });
    // always listening also hears a TV or other people
    expect(host.pushOpts[0]).toEqual({ trigger: 'flush' });
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('今天天气怎么样');
    // the last decode is the whole utterance: at least the 900 ms spoken
    expect(asr.decodes.at(-1)).toBeGreaterThanOrEqual(900 * 16);
    expect(asr.configs[0]).toMatchObject({ modelConfig: { senseVoice: { language: 'zh' }, numThreads: 2 } });
  });

  it.each([[true, true], [true, false], [false, false]])('the speech event carries the recording as WAV exactly when the endpoint takes audio (%s), and leaves out the text only beside it (transcript %s)', async (takesAudio, transcript) => {
    const { cfg, host, page } = await setup('今天天气怎么样');
    cfg.asr.recording.transcript = transcript;
    host.modelFacts.accepts = (mime: string) => takesAudio && mime === 'audio/wav';
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    const e = host.events[0]!;
    expect(e.text.includes('今天天气怎么样')).toBe(transcript || !takesAudio);
    if (!takesAudio) return expect(e.blobs).toBeUndefined();
    const blob = e.blobs![0]!;
    expect(blob.mime).toBe('audio/wav');
    const bytes = host.blob(blob.handle)!.bytes;
    expect(Buffer.from(bytes.subarray(0, 4)).toString('ascii')).toBe('RIFF');
    // at least the 900 ms spoken, 16-bit at 16 kHz after the 44-byte header
    expect(bytes.length - 44).toBeGreaterThanOrEqual(900 * 32);
    expect(blob.fallbackText).toMatch(transcript ? /^\[伙伴说这段话的录音,[\d.]+ 秒;/ : /^\[伙伴说这段话的录音,[\d.]+ 秒\]$/);
  });

  it('keeps recognition stopped across a new World with the persisted setting, and still sends audio', async () => {
    const first = await setup('hello');
    await first.world.webUi().invoke!('voice', 'stop', []);
    expect(first.cfg.asr.serviceEnabled).toBe(false);
    const { cfg, world, asr, host, page } = await setup('hello', 'always', undefined, 'zh', false, undefined, first.cfg.asr.serviceEnabled);
    cfg.asr.recording.transcript = false;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
    expect(asr.configs).toHaveLength(0);
    expect(asr.decodes).toHaveLength(0);
    expect(world.voiceState()).toMatchObject({ serviceEnabled: false });
  });

  it.each(['delayed text', '', '谢谢观看'])('sends audio before ASR completes and does not send a second event (%s)', async (result) => {
    const { cfg, world, host, page, asr } = await setup(result);
    cfg.asr.recording.transcript = false;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    asr.beforeDecode = () => gate;
    try {
      for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
      await expect.poll(() => host.events.length).toBe(1);
      expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
      expect((world.voiceState().recent as unknown[])).toHaveLength(0);
      release();
      await expect.poll(() => (world.voiceState().recent as unknown[]).length).toBe(1);
      expect(host.events).toHaveLength(1);
      expect(host.events[0]?.meta).toMatchObject({ text: '录音已投递' });
      if (result === 'delayed text') {
        // FakePage.next consumes its matching message. Inspect the unconsumed log instead
        // so the count includes the original completion as well as the later update.
        await expect.poll(() => page.messages.some((m) => m.t === 'listen' && m.phase === 'recording-text')).toBe(true);
        const delivered = page.messages.filter((m) => m.t === 'listen' && m.phase === 'heard');
        const updates = page.messages.filter((m) => m.t === 'listen' && m.phase === 'recording-text');
        expect(delivered).toHaveLength(1);
        expect(typeof delivered[0]!.recordingId).toBe('string');
        expect(updates).toMatchObject([{ text: result, recordingId: delivered[0]!.recordingId }]);
        // the chat page shows the transcript in the recording's place
        await expect.poll(() => chatHistory(host.store.range({ source: world.id }))).toMatchObject([{ kind: 'user', via: 'voice', text: result }]);
      }
    } finally { release(); }
  });

  it('shows recognition only after the audio batch is delivered even when recognition finishes early', async () => {
    const { cfg, world, host, page, asr } = await setup('early result');
    cfg.asr.recording.transcript = false;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    for (const fr of [...tone(900, .3), ...tone(300, 0)]) page.audio(fr);
    await expect.poll(() => asr.decodes.length).toBe(1);
    expect(host.events).toHaveLength(0);
    expect(world.voiceState().recent).toEqual([]);
    for (const fr of tone(600, 0)) page.audio(fr);
    await expect.poll(() => host.events.length).toBe(1);
    await expect.poll(() => (world.voiceState().recent as unknown[]).length).toBe(1);
  });

  it('finishes an audio batch once when microphone frames stop during the closing pause', async () => {
    const { cfg, host, page, world, asr } = await setup('unused', 'always', undefined, 'zh', false, undefined, false);
    cfg.asr.recording.transcript = false;
    cfg.asr.segment.silenceMs = 900;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    for (const fr of [...tone(900, .3), ...tone(300, 0)]) page.audio(fr);
    await expect.poll(() => (world.voiceState().counts as { utterances: number }).utterances).toBe(1);
    expect(host.events).toHaveLength(0);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
    for (const fr of tone(900, 0)) page.audio(fr);
    expect(asr.decodes).toHaveLength(0);
    expect(host.events).toHaveLength(1);
  });

  it('shows transcribing while an over-limit recording awaits its text fallback', async () => {
    const { cfg, host, page, asr } = await setup('fallback text');
    cfg.asr.recording.transcript = false;
    cfg.asr.recording.maxMinutes = RECORDING_MINUTES_MIN;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    asr.beforeDecode = () => gate;
    try {
      for (const fr of [...tone(RECORDING_MINUTES_MIN * 60_000 + 1000, .3), ...tone(900, 0)]) page.audio(fr);
      await page.next((m) => m.t === 'listen' && m.phase === 'transcribing');
      expect(host.events).toHaveLength(0);
      release();
      await expect.poll(() => host.events.length).toBe(1);
      expect(host.events[0]?.text).toContain('fallback text');
      expect(host.events[0]?.blobs).toBeUndefined();
    } finally { release(); }
  });

  it('flushes packed legacy text before collecting audio-only speech after ASR stops', async () => {
    const { cfg, world, host, page } = await setup('earlier text');
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    // A forced segment has completed recognition, but the long, ongoing utterance keeps its packer open.
    for (const fr of tone(cfg.asr.segment.maxUtteranceMs, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'partial' && m.text === 'earlier text');
    expect(host.events).toHaveLength(0);

    cfg.asr.recording.transcript = false;
    await world.webUi().invoke!('voice', 'stop', []);
    for (const fr of [...tone(900, .2), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length).toBe(2);
    // The old packed speech is sent first, then the new audio-only capture; neither is discarded.
    expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
    expect(host.events[1]?.blobs?.[0]?.mime).toBe('audio/wav');
    const first = host.blob(host.events[0]!.blobs![0]!.handle)!.bytes;
    const second = host.blob(host.events[1]!.blobs![0]!.handle)!.bytes;
    expect(first.length).toBeGreaterThan(second.length);
    expect(second.length - 44).toBeGreaterThanOrEqual(900 * 32);
  });

  it('sends an over-limit text fallback before a later WAV, even while ASR is pending', async () => {
    const { cfg, host, page, asr, world } = await setup('first fallback');
    cfg.asr.recording.transcript = false;
    cfg.asr.recording.maxMinutes = RECORDING_MINUTES_MIN;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    asr.beforeDecode = () => gate;
    try {
      for (const fr of [...tone(RECORDING_MINUTES_MIN * 60_000 + 1000, .3), ...tone(900, 0)]) page.audio(fr);
      await page.next((m) => m.t === 'listen' && m.phase === 'transcribing');
      expect(host.events).toHaveLength(0);

      // Batch 2 has a valid WAV. It must not overtake batch 1's undelivered text fallback.
      for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
      await expect.poll(() => (world.voiceState().counts as { utterances: number }).utterances).toBeGreaterThan(1);
      expect(host.events).toHaveLength(0);
      release();
      await expect.poll(() => host.events.length).toBe(2);
      expect(host.events[0]?.text).toContain('first fallback');
      expect(host.events[0]?.blobs).toBeUndefined();
      expect(host.events[1]?.blobs?.[0]?.mime).toBe('audio/wav');
    } finally { release(); }
  });

  it('distinguishes a stopped service from a recording delivery error', async () => {
    const { page, cfg, host } = await setup('unused', 'always', undefined, 'zh', false, undefined, false);
    expect(page.init.voice).toMatchObject({ enabled: true, ready: false, detail: '识别服务已停止，当前无法语音输入' });
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    cfg.asr.recording.transcript = false;
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    cfg.asr.recording.enabled = false;
    const stopped = await page.next((m) => m.t === 'prefs' && m.mic === false);
    expect(stopped.voice).toMatchObject({ ready: false, detail: '识别服务已停止，当前无法语音输入' });
  });

  it('delivers two recordings while the first recognition is still pending, without stale bubble text', async () => {
    const { cfg, host, page, asr, world } = await setup('unused');
    cfg.asr.recording.transcript = false;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    asr.beforeDecode = () => gate;
    asr.reply = () => asr.decodes.length === 1 ? 'first result' : 'second result';
    try {
      for (let i = 1; i <= 2; i++) {
        for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
        await expect.poll(() => host.events.length).toBe(i);
      }
      expect(asr.decodes).toHaveLength(1);
      release();
      await expect.poll(() => (world.voiceState().recent as unknown[]).length).toBe(2);
      await expect.poll(() => page.messages.some((m) => m.t === 'listen' && m.phase === 'recording-text' && m.text === 'second result')).toBe(true);
      const delivered = page.messages.filter((m) => m.t === 'listen' && m.phase === 'heard');
      const updates = page.messages.filter((m) => m.t === 'listen' && m.phase === 'recording-text');
      expect(delivered).toHaveLength(2);
      expect(delivered[0]!.recordingId).not.toBe(delivered[1]!.recordingId);
      expect(updates).toMatchObject([
        { text: 'first result', recordingId: delivered[0]!.recordingId },
        { text: 'second result', recordingId: delivered[1]!.recordingId },
      ]);
      expect(host.events).toHaveLength(2);
    } finally { release(); }
  });

  it('sends audio even when the recognizer fails', async () => {
    const { cfg, host, page, asr, world } = await setup('unused');
    cfg.asr.recording.transcript = false;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    asr.beforeDecode = async () => { throw new Error('recognition failed'); };
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
    await expect.poll(() => (world.voiceState().recent as unknown[]).length).toBe(1);
    expect(world.voiceState().recent).toMatchObject([{ dropped: true }]);
    expect(host.events).toHaveLength(1);
  });

  it.each([true, false])('audio-only mode over the recording limit reports failure or falls back to text (ASR %s)', async (serviceEnabled) => {
    const { cfg, host, page, world } = await setup('fallback text', 'always', undefined, 'zh', false, undefined, serviceEnabled);
    cfg.asr.recording.transcript = false;
    cfg.asr.recording.maxMinutes = RECORDING_MINUTES_MIN;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    if (!serviceEnabled) await page.next((m) => m.t === 'prefs' && m.mic === true);
    for (const fr of [...tone(RECORDING_MINUTES_MIN * 60_000 + 1000, .3), ...tone(900, 0)]) page.audio(fr);
    if (serviceEnabled) {
      await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
      expect(host.events[0]?.text).toContain('fallback text');
      expect(host.events[0]?.blobs).toBeUndefined();
    } else {
      await expect.poll(() => (world.voiceState().recent as unknown[]).length).toBe(1);
      expect(host.events).toHaveLength(0);
      expect(world.voiceState().recent).toMatchObject([{ dropped: true }]);
    }
  });

  it('sends a batch whose recording runs past asr.recording.maxMinutes as text alone, and the next one with its recording', async () => {
    const { cfg, host, page } = await setup('今天天气怎么样');
    cfg.asr.recording.maxMinutes = RECORDING_MINUTES_MIN;
    host.modelFacts.accepts = (mime: string) => mime === 'audio/wav';
    // one second past the limit, cut into sentences at maxUtteranceMs and held as one batch until the pause
    for (const fr of [...tone(RECORDING_MINUTES_MIN * 60_000 + 1000, .3), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]?.text).toContain('今天天气怎么样');
    expect(host.events[0]?.blobs).toBeUndefined();

    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length).toBe(2);
    expect(host.events[1]?.blobs?.[0]?.mime).toBe('audio/wav');
  });

  it('keeps a pending text-only batch as text when the endpoint starts accepting audio', async () => {
    const transcript = '今天天气怎么样';
    const { cfg, host, page } = await setup(transcript);
    for (const frame of tone(cfg.asr.segment.maxUtteranceMs, .3)) page.audio(frame);
    await page.next((m) => m.t === 'listen' && m.phase === 'partial' && m.text === transcript);
    expect(host.events).toHaveLength(0);

    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    for (const frame of tone(900, 0)) page.audio(frame);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]?.text).toContain(transcript);
    expect(host.events[0]?.blobs).toBeUndefined();

    for (const frame of [...tone(900, .3), ...tone(900, 0)]) page.audio(frame);
    await expect.poll(() => host.events.length).toBe(2);
    expect(host.events[1]?.blobs?.[0]?.mime).toBe('audio/wav');
  });

  it.each(['always', 'toggle'] as const)('audio-only %s respects a low configured VAD threshold', async (mode) => {
    const { key, watch } = scriptedKey();
    const { cfg, world, host, page } = await setup('unused', mode, watch, 'zh', false, undefined, false);
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    cfg.asr.recording.transcript = false;
    await world.webUi().invoke!('voice', 'setThreshold', [-60]);
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    if (mode === 'toggle') {
      key.press(true); key.press(false);
      await page.next((m) => m.t === 'talk-key' && m.down === true);
    }
    const quiet = tone(900, .002);
    expect(rmsDb(quiet[0]!)).toBeGreaterThan(-60);
    for (const fr of [...quiet, ...tone(900, 0)]) page.audio(fr);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
  });

  it('hold, recording only: a held key with silence sends nothing, quiet speech goes as a recording', async () => {
    const { key, watch } = scriptedKey();
    const { cfg, host, page } = await setup('', 'hold', watch);
    cfg.asr.recording.transcript = false;
    host.modelFacts.accepts = (mime) => mime === 'audio/wav';
    const hold = async (frames: Int16Array[]) => {
      key.tap();
      await page.next((m) => m.t === 'listen' && m.phase === 'ready');
      key.press(true);
      await page.next((m) => m.t === 'listen' && m.phase === 'start');
      for (const fr of frames) page.audio(fr);
      await new Promise((r) => setTimeout(r, 100));
      key.press(false);
    };
    await hold(tone(600, .001));
    await new Promise((r) => setTimeout(r, 300));
    expect(host.events).toHaveLength(0);
    await hold(tone(600, .01));
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]?.blobs?.[0]?.mime).toBe('audio/wav');
  });

  it('a threshold set from the meter applies to the next frame: speech below it is not heard', async () => {
    const { world, host, page } = await setup('不该听见');
    const speech = tone(900, .3);
    const state = await world.webUi().invoke!('voice', 'setThreshold', [rmsDb(speech[0]) + 3]) as { thresholdDb: number };
    expect(state.thresholdDb).toBe(rmsDb(speech[0]) + 3);
    const last = tone(20, .05)[0];
    for (const fr of [...speech, ...tone(900, 0), last]) page.audio(fr);
    await expect.poll(() => world.voiceState().level).toBe(rmsDb(last));
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
    expect(host.events).toHaveLength(0);
  });

  it('drops a known hallucination and tells the page nothing was heard', async () => {
    const { host, page } = await setup('谢谢观看');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(host.events).toHaveLength(0);
  });

  it('hold: only audio while the talk key is down counts, and releasing the key ends the utterance', async () => {
    const { key, watch } = scriptedKey();
    const { host, page, world, asr } = await setup('帮我看看这个', 'hold', watch);
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
    const spoken = [...tone(500, .01), ...tone(800, 0), ...tone(300, .01)];
    for (const fr of spoken) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    expect(host.events).toHaveLength(0);
    key.press(false);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[voice] 伙伴:帮我看看这个');
    expect(host.pushOpts[0]).toEqual({ trigger: 'interrupt' });
    expect(asr.audio.at(-1)).toEqual(floatAudio(spoken));
  });

  it('hold: the microphone stays open across a press and release unless it is set to open on press', async () => {
    const { key, watch } = scriptedKey();
    const { page } = await setup('帮我看看这个', 'hold', watch);
    expect(page.init.mic).toBe(true);
    key.press(true);
    key.press(false);
    await new Promise((r) => setTimeout(r, 800));
    expect(page.messages.some((m) => m.t === 'prefs' && m.mic === false)).toBe(false);
  });

  it('hold, open on press: the page opens the microphone from the press until shortly after the release', async () => {
    const { key, watch } = scriptedKey();
    const { page } = await setup('帮我看看这个', 'hold', watch, 'zh', true);
    expect(page.init.mic).toBe(false);
    key.press(true);
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    // listening starts with the first frame from the microphone the press opened
    page.audio(tone(20, .01)[0]!);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    key.press(false);
    await page.next((m) => m.t === 'prefs' && m.mic === false);
  });

  it("the listening bubble's cancel drops what was heard, sends nothing and closes the bubble", async () => {
    const { key, watch } = scriptedKey();
    const { host, page } = await setup('说错了', 'hold', watch);
    key.press(true);
    for (const fr of tone(600, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    page.send({ t: 'cancel' });
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    // the key comes up after the cancel: nothing is left to send
    key.press(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(host.events).toHaveLength(0);
    expect(page.messages.some((m) => m.t === 'listen' && m.phase === 'heard')).toBe(false);
  });

  it('a talk key that cannot be read keeps the gate closed', async () => {
    const { watch } = scriptedKey('no keyboard here');
    const { page, world } = await setup('不该听见', 'toggle', watch);
    expect(world.voiceState().input).toMatchObject({ mode: 'toggle', hotkeyProblem: 'no keyboard here', open: false });
    expect((world.voiceState().input as { hint: string }).hint).toContain('no keyboard here');
    const last = tone(20, .05)[0];
    for (const fr of [...tone(900, .3), ...tone(900, 0), last]) page.audio(fr);
    // frames arrive in order: once the last one is metered, every sentence the others made is counted
    await expect.poll(() => world.voiceState().level).toBe(rmsDb(last));
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
  });

  it('a talk key that cannot be read is delivered to the bot once a run, never shown in the bubble', async () => {
    const { watch } = scriptedKey('no keyboard here');
    const { cfg, host, page } = await setup('不该听见', 'toggle', watch);
    const told = () => host.events.filter((e) => e.type === 'desktop-pet.talk-key');
    await expect.poll(() => told()).toHaveLength(1);
    expect(told()[0].text).toContain('no keyboard here');
    cfg.asr.enabled = false;
    await page.next((m) => m.t === 'prefs' && m.mic === false);
    cfg.asr.enabled = true;
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    await new Promise((r) => setTimeout(r, 100));
    expect(told()).toHaveLength(1);
    expect(page.messages.some((m) => m.t === 'dialog')).toBe(false);
  });

  it('hold: the page goes quiet from the press to the release', async () => {
    const { key, watch } = scriptedKey();
    const { page } = await setup('帮我看看这个', 'hold', watch);
    key.press(true);
    expect((await page.next((m) => m.t === 'talk-key')).down).toBe(true);
    key.press(false);
    expect((await page.next((m) => m.t === 'talk-key')).down).toBe(false);
  });

  it('toggle: cancelling the listening bubble lets the page speak again', async () => {
    const { key, watch } = scriptedKey();
    const { page } = await setup('帮我看看这个', 'toggle', watch);
    key.press(true);
    expect((await page.next((m) => m.t === 'talk-key')).down).toBe(true);
    page.send({ t: 'cancel' });
    expect((await page.next((m) => m.t === 'talk-key')).down).toBe(false);
  });

  it('a talk key pressed while voice input is off does not quiet the page', async () => {
    const { key, watch } = scriptedKey();
    const { cfg, page } = await setup('帮我看看这个', 'hold', watch);
    cfg.asr.enabled = false;
    await page.next((m) => m.t === 'prefs' && m.mic === false);
    key.press(true);
    expect((await page.next((m) => m.t === 'talk-key')).down).toBe(false);
  });

  it('always listening never quiets the page: what it hears may be a TV', async () => {
    const { page } = await setup('帮我看看这个', 'always');
    for (const fr of tone(600, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    expect(page.messages.some((m) => m.t === 'talk-key')).toBe(false);
  });

  it('the typing key is watched only once switched on, and its press opens the typing box', async () => {
    const { key, watch } = scriptedKey();
    // listening without a key: any key watched is the typing key
    const { page, cfg } = await setup('', 'always', watch);
    expect(key.hotkey).toBeNull();
    cfg.typeKey.enabled = true;
    await expect.poll(() => key.hotkey).not.toBeNull();
    key.press(true);
    await page.next((m) => m.t === 'type');
  });

  it.each([
    ['RightCtrl', false], ['RightCtrl', true], ['RightCtrl*2', false], ['RightCtrl*2', true],
  ] as const)('%s with openOnPress=%s: double-tap types without voice; holding speaks without typing', async (hotkey, openOnPress) => {
    const { watch, sample } = sampledKeys();
    const { world, page, asr, host } = await setup('听清楚了', 'hold', watch, 'zh', openOnPress);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);

    sample('RightCtrl', true, 0);
    expect(world.voiceState().input).toMatchObject({ open: false });
    sample('RightCtrl', false, 100);
    sample('RightCtrl', true, 200);
    sample('RightCtrl', true, 200 + TAP_MAX_MS);
    expect(world.voiceState().input).toMatchObject({ open: false });
    for (const fr of tone(600, .3)) page.audio(fr);
    const closedFrame = tone(20, .05)[0];
    page.audio(closedFrame);
    await expect.poll(() => world.voiceState().level).toBe(rmsDb(closedFrame));
    sample('RightCtrl', false, 200 + TAP_MAX_MS);
    await page.next((m) => m.t === 'type');
    expect(page.messages.some((m) => m.t === 'listen' && m.phase === 'start')).toBe(false);
    if (openOnPress) expect(page.messages.some((m) => m.t === 'prefs' && m.mic === true)).toBe(false);
    expect(asr.decodes).toHaveLength(0);
    expect(host.events).toHaveLength(0);

    sample('RightCtrl', true, 1000);
    sample('RightCtrl', false, 1100);
    sample('RightCtrl', true, 1200);
    sample('RightCtrl', true, 1200 + TAP_MAX_MS + 1);
    expect(world.voiceState().input).toMatchObject({ open: true });
    if (openOnPress) await page.next((m) => m.t === 'prefs' && m.mic === true);
    for (const fr of tone(600, .3)) page.audio(fr);
    const openFrame = tone(20, .1)[0];
    page.audio(openFrame);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await expect.poll(() => world.voiceState().level).toBe(rmsDb(openFrame));
    sample('RightCtrl', false, 2200);
    expect(world.voiceState().input).toMatchObject({ open: false });
    await page.next((m) => m.t === 'listen' && m.phase === 'heard');
    expect(host.events).toHaveLength(1);
    expect(host.events[0].text).toBe('[voice] 伙伴:听清楚了');
    expect(page.messages.some((m) => m.t === 'type')).toBe(false);
    if (openOnPress) expect(asr.audio.at(-1)).toEqual(floatAudio([...tone(600, .3), openFrame]));
  });

  it('a click-through pause key shared with the typing key: tap then hold lends clicks until release, a double tap only types', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page } = await setup('', 'always', watch);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    await world.webUi().invoke!('pet', 'setThroughPauseKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);

    sample('RightCtrl', true, 0);
    sample('RightCtrl', false, 50);
    sample('RightCtrl', true, 100);
    sample('RightCtrl', false, 150);
    await page.next((m) => m.t === 'type');
    expect(page.messages.some((m) => m.t === 'throughPause')).toBe(false);

    sample('RightCtrl', true, 1000);
    sample('RightCtrl', false, 1050);
    sample('RightCtrl', true, 1100);
    sample('RightCtrl', true, 1101 + TAP_MAX_MS);
    expect((await page.next((m) => m.t === 'throughPause')).on).toBe(true);
    sample('RightCtrl', false, 2000);
    expect((await page.next((m) => m.t === 'throughPause' && m.on === false)).on).toBe(false);
    expect(page.messages.some((m) => m.t === 'type')).toBe(false);
  });

  it("a click-through pause key on the talk key's key: tap then hold only listens, a plain hold only pauses click-through", async () => {
    const { watch, sample } = sampledKeys();
    const { world, page } = await setup('', 'hold', watch);
    const talk = splitTaps(DESKTOP_PET_DEFAULTS.asr.mic.hotkey);
    expect(talk.taps).toBe(2);
    const key = talk.combo;
    await world.webUi().invoke!('pet', 'setThroughPauseKey', [{ enabled: true, hotkey: key }]);

    sample(key, true, 0);
    sample(key, false, 50);
    sample(key, true, 100);
    sample(key, true, 101 + TAP_MAX_MS);
    expect(world.voiceState().input).toMatchObject({ open: true });
    sample(key, false, 1000);
    expect(world.voiceState().input).toMatchObject({ open: false });
    expect(page.messages.some((m) => m.t === 'throughPause')).toBe(false);

    sample(key, true, 3000);
    sample(key, true, 3001 + TAP_MAX_MS);
    expect((await page.next((m) => m.t === 'throughPause')).on).toBe(true);
    expect(world.voiceState().input).toMatchObject({ open: false });
    sample(key, false, 4000);
    expect((await page.next((m) => m.t === 'throughPause')).on).toBe(false);
  });

  it('a click-through pause key pressed as the talk key says so in its row', async () => {
    const { watch } = sampledKeys();
    const { world } = await setup('', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'F8' }]);
    type Row = { throughPauseKey: { problem: string | null } };
    const set = async (hotkey: string) => (await world.webUi().invoke!('pet', 'setThroughPauseKey', [{ enabled: true, hotkey }]) as Row).throughPauseKey.problem;
    expect(await set('F8')).toBe(petText('zh').throughPauseKey.sharesTalk);
    expect(await set('F8*2')).toBeNull();
  });

  it('stopping a key watcher during a pending hold prevents it from opening voice later', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page } = await setup('', 'hold', watch, 'zh', true);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    sample('RightCtrl', true, 0);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'F8' }]);
    sample('RightCtrl', true, TAP_MAX_MS + 1);
    expect(world.voiceState().input).toMatchObject({ open: false });
    expect(page.messages.some((m) => m.t === 'listen' && m.phase === 'start')).toBe(false);
  });

  it('hold: a talk key apart from the typing key listens from the press', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page } = await setup('', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'F8*2' }]);
    sample('RightCtrl', true, 0);
    expect(world.voiceState().input).toMatchObject({ open: true });
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    sample('RightCtrl', false, 100);
    expect(world.voiceState().input).toMatchObject({ open: false });
  });

  it('hold: a talk key shared with the typing key listens only once held past a tap', async () => {
    const { watch, sample } = sampledKeys();
    const { world } = await setup('', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    sample('RightCtrl', true, 0);
    sample('RightCtrl', true, TAP_MAX_MS);
    expect(world.voiceState().input).toMatchObject({ open: false });
    sample('RightCtrl', true, TAP_MAX_MS + 1);
    expect(world.voiceState().input).toMatchObject({ open: true });
  });

  it.each(['RightCtrl', 'RightCtrl*2'])('shared %s preserves the speech captured during the hold delay', async (hotkey) => {
    const { watch, sample } = sampledKeys();
    const { world, page, asr } = await setup('听清楚了', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    if (parseHotkey(hotkey)!.taps === 2) {
      sample('RightCtrl', true, 0);
      sample('RightCtrl', false, 100);
    }
    sample('RightCtrl', true, 200);
    const before = [...tone(TAP_MAX_MS, .3), ...tone(20, .05)];
    await sendAudio(world, page, before);
    expect(world.voiceState().input).toMatchObject({ open: false });
    expect(asr.decodes).toHaveLength(0);
    sample('RightCtrl', true, 200 + TAP_MAX_MS + 1);
    const after = [...tone(700, .2), ...tone(20, .1)];
    await sendAudio(world, page, after);
    sample('RightCtrl', false, 1400);
    await page.next((m) => m.t === 'listen' && m.phase === 'heard');
    const expected = floatAudio([...before, ...after]);
    expect(asr.decodes.at(-1)).toBe(expected.length);
    expect(asr.audio.at(-1)).toEqual(expected);
  });

  it('shared hold key retains only the latest audio frames covering the hold delay and both key polls', async () => {
    const keys = sampledKeys();
    const { world, page, asr } = await setup('听清楚了', 'hold', keys.watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    const windowMs = Math.ceil((TAP_MAX_MS + 2 * keys.pollMs) / 20) * 20;
    const recent = [...tone(windowMs - 20, .2), ...tone(20, .05)];
    keys.sample('RightCtrl', true, 0);
    await sendAudio(world, page, [...tone(1000, .4), ...recent]);
    expect(asr.decodes).toHaveLength(0);
    keys.sample('RightCtrl', true, TAP_MAX_MS + 1);
    const tail = tone(40, .1);
    await sendAudio(world, page, tail);
    keys.sample('RightCtrl', false, TAP_MAX_MS + 100);
    await page.next((m) => m.t === 'listen' && m.phase === 'heard');
    expect(asr.decodes.at(-1)).toBe(floatAudio([...recent, ...tail]).length);
    expect(asr.audio.at(-1)).toEqual(floatAudio([...recent, ...tail]));
  });

  it('releasing a shared key before activation discards its audio before the next hold', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page, asr } = await setup('听清楚了', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    sample('RightCtrl', true, 0);
    await sendAudio(world, page, [...tone(TAP_MAX_MS, .3), ...tone(20, .05)]);
    sample('RightCtrl', false, TAP_MAX_MS);
    expect(asr.decodes).toHaveLength(0);
    sample('RightCtrl', true, 1000);
    sample('RightCtrl', true, 1000 + TAP_MAX_MS + 1);
    const spoken = [...tone(700, .2), ...tone(20, .1)];
    await sendAudio(world, page, spoken);
    sample('RightCtrl', false, 2200);
    await page.next((m) => m.t === 'listen' && m.phase === 'heard');
    expect(asr.decodes.at(-1)).toBe(floatAudio(spoken).length);
    expect(asr.audio.at(-1)).toEqual(floatAudio(spoken));
  });

  it.each(['rebind', 'disable', 'mic-off', 'expire'] as const)('%s discards pending hold audio before another recording', async (action) => {
    const keys = sampledKeys();
    const { world, page, asr } = await setup('听清楚了', 'hold', keys.watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    await sendAudio(world, page, [...tone(TAP_MAX_MS, .3), ...tone(20, .05)]);
    if (action === 'rebind') {
      await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'F8' }]);
      await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    } else if (action === 'disable') {
      await world.webUi().invoke!('voice', 'setEnabled', [false]);
      await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('stopped');
      await world.webUi().invoke!('voice', 'setEnabled', [true]);
      await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    } else if (action === 'mic-off') {
      page.send({ t: 'mic', state: 'off' });
      await expect.poll(() => world.voiceState().level).toBe(-100);
      page.send({ t: 'mic', state: 'on' });
    } else await new Promise((r) => setTimeout(r, TAP_MAX_MS + 2 * keys.pollMs + 40));
    keys.sample('RightCtrl', true, 1000);
    keys.sample('RightCtrl', true, 1000 + TAP_MAX_MS + 1);
    const spoken = [...tone(700, .2), ...tone(20, .1)];
    await sendAudio(world, page, spoken);
    keys.sample('RightCtrl', false, 2200);
    await page.next((m) => m.t === 'listen' && m.phase === 'heard');
    expect(asr.decodes.at(-1)).toBe(floatAudio(spoken).length);
    expect(asr.audio.at(-1)).toEqual(floatAudio(spoken));
  });

  it('cancelling a shared hold and releasing it discards audio received after cancellation', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page, asr, host } = await setup('听清楚了', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    sample('RightCtrl', true, 0);
    await sendAudio(world, page, [...tone(TAP_MAX_MS, .3), ...tone(20, .05)]);
    sample('RightCtrl', true, TAP_MAX_MS + 1);
    page.send({ t: 'cancel' });
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    await sendAudio(world, page, tone(160, .4));
    sample('RightCtrl', false, 600);
    expect(host.events).toHaveLength(0);
    sample('RightCtrl', true, 1000);
    sample('RightCtrl', true, 1000 + TAP_MAX_MS + 1);
    const spoken = [...tone(700, .2), ...tone(20, .1)];
    await sendAudio(world, page, spoken);
    sample('RightCtrl', false, 2200);
    await page.next((m) => m.t === 'listen' && m.phase === 'heard');
    expect(host.events).toHaveLength(1);
    expect(asr.decodes.at(-1)).toBe(floatAudio(spoken).length);
    expect(asr.audio.at(-1)).toEqual(floatAudio(spoken));
  });

  it('hold: changing the typing key restarts the talk key watcher with the matching trigger', async () => {
    const { watch, sample } = sampledKeys();
    const { world, cfg } = await setup('', 'hold', watch);
    await world.webUi().invoke!('voice', 'setMic', [{ hotkey: 'RightCtrl' }]);
    sample('RightCtrl', true, 0);
    expect(world.voiceState().input).toMatchObject({ open: true });
    sample('RightCtrl', false, 100);
    // switched on through the pet panel with the same key: the press waits out a tap
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'RightCtrl*2' }]);
    sample('RightCtrl', true, 1000);
    expect(world.voiceState().input).toMatchObject({ open: false });
    sample('RightCtrl', true, 1000 + TAP_MAX_MS + 1);
    expect(world.voiceState().input).toMatchObject({ open: true });
    sample('RightCtrl', false, 1500);
    // switched off in the config directly: the next config sync goes back to listening from the press
    cfg.typeKey.enabled = false;
    await expect.poll(() => {
      sample('RightCtrl', true, 2000);
      const open = (world.voiceState().input as { open: boolean }).open;
      sample('RightCtrl', false, 2050);
      return open;
    }).toBe(true);
  });

  it('a single-press typing shortcut opens the box before the key is released', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page } = await setup('', 'always', watch);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'F8' }]);
    sample('F8', true, 0);
    await page.next((m) => m.t === 'type');
  });

  it('Ctrl+C then Ctrl+V does not open the typing box; a double tap of Ctrl does', async () => {
    const { watch, sample } = sampledKeys();
    const { world, page } = await setup('', 'always', watch);
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true, hotkey: 'LeftCtrl*2' }]);
    for (const [letter, at] of [['C', 0], ['V', 200]] as const) {
      sample('LeftCtrl', true, at);
      sample(letter, true, at + 30);
      sample(letter, false, at + 90);
      sample('LeftCtrl', false, at + 120);
    }
    // a later message on the same socket: a type sent for the shortcuts would have arrived before it
    await world.webUi().invoke!('pet', 'setClickThrough', [true]);
    await page.next((m) => m.t === 'prefs' && m.clickThrough === true);
    expect(page.messages.some((m) => m.t === 'type')).toBe(false);
    sample('LeftCtrl', true, 1000);
    sample('LeftCtrl', false, 1080);
    sample('LeftCtrl', true, 1200);
    sample('LeftCtrl', false, 1280);
    await page.next((m) => m.t === 'type');
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
    expect(host.events[0].text).toBe('[voice] 伙伴:帮我开灯');
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
    expect(host.pushOpts[0]).toEqual({ trigger: 'interrupt' });
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
    expect(host.events[0].text).toBe('[voice] 伙伴:听清楚了');
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
    expect(host.events[0].text.length).toBeGreaterThan('[voice] 伙伴:'.length + 13);
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
    await expect.poll(() => (world.voiceState().server as { detail: string | null }).detail).toContain(petText('zh').voice.modelMissing(0));
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
