/**
 * Decider mode in the World: the pet page over the real socket, OpenRouter's decisions endpoint as a local mock.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DESKTOP_PET } from '../src/definition.ts';
import { DesktopPetWorld, type DesktopPetWorldOptions, type PetMode } from '../src/world.ts';
import { BREAKER_FAILS, DECIDER_DEFAULT_MODEL } from '../src/decider.ts';
import { deciderToolDecls, petToolDecls } from '../src/tools.ts';
import { MODEL_TEXT } from '../src/model-text.ts';
import { petText } from '../src/i18n/index.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { DeciderMock } from './helpers/decider-mock.ts';

const KEY = 'sk-or-test-0123456789';
const t = MODEL_TEXT.zh;
const failure = petText('zh').decider.failure;

/** A host that keeps the World's log lines. */
class LoggingHost extends FakeHost {
  lines: string[] = [];
  constructor() {
    super();
    const line = (...a: unknown[]) => { this.lines.push(a.map(String).join(' ')); };
    this.log = { ...this.log, info: line, warn: line, debug: line, error: line } as never;
  }
}

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function setup(opts: { enabled?: boolean; key?: string; patch?: (c: DesktopPetConfigSection) => void; extra?: Partial<DesktopPetWorldOptions> } = {}) {
  const mock = new DeciderMock();
  await mock.start();
  cleanup.push(() => mock.stop());
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  cfg.decider.enabled = opts.enabled ?? true;
  cfg.decider.model = 'vendor/decider-a';
  opts.patch?.(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-decider-'));
  const key = { own: opts.key ?? KEY };
  const modes: PetMode[] = [];
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: (p) => Object.assign(cfg, p),
    runtimesRoot: () => join(dir, 'r'), modelsDir: () => join(dir, 'm'),
    deciderApiKey: () => key.own, storeDeciderApiKey: (k) => { key.own = k; },
    deciderUrl: mock.url, onModeChange: (m) => modes.push(m),
    ...opts.extra,
  });
  const host = new LoggingHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  /** A tool as bound now, called as the loop calls it; `signal` stands for a voice stop. */
  const tool = (name: string) => {
    const def = world.tools().find((x) => x.name === name);
    if (!def) throw new Error(`no tool ${name}`);
    return async (args: Record<string, unknown>, signal?: AbortSignal) => {
      const out = await def.handler(args, { signal } as never);
      return typeof out === 'string' ? out : out.text;
    };
  };
  const decls = () => world.tools().map(({ handler: _h, interruptible: _i, ...d }) => d);
  return { world, cfg, host, page, mock, key, modes, tool, decls };
}

describe('choosing the mode', () => {
  it('stays classic, tools and prompt as they are and nothing asked, while switched off or without a key', async () => {
    for (const [enabled, key] of [[false, KEY], [true, '']] as const) {
      const { world, modes, decls, tool, page, mock } = await setup({ enabled, key });
      expect(world.petMode).toBe('classic');
      expect(decls()).toEqual(petToolDecls('zh'));
      expect(readFileSync(world.webUi('zh').promptDocs![0]!.path, 'utf8')).toBe(readFileSync(new URL('../src/ENV_PROMPT.md', import.meta.url), 'utf8'));
      await tool('pet_say')({ script: '【开心】你好' });
      expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: ['happy'], text: '你好', anchors: [] }]);
      expect([modes, mock.requests]).toEqual([[], []]);
    }
  });

  it('on with a key: a feeling in place of words, waits a voice stop ends, the decider template and no word table', async () => {
    const { world, decls } = await setup();
    expect(world.petMode).toBe('decider');
    expect(decls()).toEqual(deciderToolDecls('zh'));
    expect(world.tools().filter((d) => d.interruptible).map((d) => d.name)).toEqual(['pet_say', 'pet_move_to', 'pet_feel']);
    expect(world.webUi('zh').promptDocs![0]!.path).toMatch(/ENV_PROMPT_DECIDER\.md$/);
    expect((await world.envPromptVars())['pet.vocab']).toBe('');
  });

  it('follows the switch and the key, tells the app each change, and keeps the template until the next build reads the mode', async () => {
    const { world, cfg, key, modes } = await setup({ enabled: false });
    cfg.decider.enabled = true;
    world.refresh();
    expect([modes, world.promptMode]).toEqual([['decider'], 'classic']);
    expect(world.webUi('zh').promptDocs![0]!.path).toMatch(/ENV_PROMPT\.md$/);
    expect((await world.envPromptVars())['pet.vocab']).toBe('');
    expect(world.promptMode).toBe('decider');
    cfg.decider.enabled = false;
    world.refresh();
    // the key is read again when the switch turns on
    key.own = '';
    cfg.decider.enabled = true;
    world.refresh();
    expect(modes).toEqual(['decider', 'classic']);
    await world['invoke']('pet', 'setDeciderKey', [' sk-or-new-key-123 ']);
    expect(key.own).toBe('sk-or-new-key-123');
    expect(modes).toEqual(['decider', 'classic', 'decider']);
  });

  it('after a restart, starts in the mode the stored prompt was built for and changes at its first sync', async () => {
    const promptModeFile = join(mkdtempSync(join(tmpdir(), 'pet-decider-mark-')), 'mark');
    // no mark: the stored prompt is classic
    const a = await setup({ extra: { promptModeFile } });
    a.world.refresh();
    expect([a.modes, a.world.promptMode]).toEqual([['decider'], 'classic']);
    await a.world.envPromptVars();
    const b = await setup({ enabled: false, extra: { promptModeFile } });
    b.world.refresh();
    expect([b.modes, b.world.promptMode]).toEqual([['classic'], 'decider']);
    await b.world.envPromptVars();
    const c = await setup({ enabled: false, extra: { promptModeFile } });
    c.world.refresh();
    expect([c.modes, c.world.promptMode]).toEqual([[], 'classic']);
  });

  it('reads a config written before decider mode as off, and the switch alone with the default model', async () => {
    const { world, cfg, modes, page, mock, tool } = await setup({ enabled: false, patch: (c) => { delete (c as Partial<typeof c>).decider; } });
    expect(world.petMode).toBe('classic');
    expect(world.petState().decider).toEqual({ mode: 'classic', enabled: false, failing: null });
    (cfg as { decider: unknown }).decider = { enabled: true };
    world.refresh();
    expect(modes).toEqual(['decider']);
    await tool('pet_say')({ text: '嗨', feeling: '开心' });
    await page.next((m) => m.t === 'say');
    expect(mock.requests[0]!.body.model).toBe(DECIDER_DEFAULT_MODEL);
  });
});

describe('a bubble', () => {
  it('waits for its words and goes out with them in play order, sleep not offered; the receipt names them', async () => {
    const { page, mock, tool } = await setup();
    mock.delayMs = 150;
    mock.answer = () => ({ face: [['开心', .7]], head: [['点头', .6]] });
    expect(await tool('pet_say')({ text: '太好啦!', feeling: '替对方高兴,想点头' })).toContain('表情动作:点头 → 开心。');
    expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: ['nod', 'happy'], text: '太好啦!', anchors: [] }]);
    const req = mock.requests[0]!;
    expect([req.auth, req.body.model]).toEqual([`Bearer ${KEY}`, 'vendor/decider-a']);
    expect(Object.keys(req.body.questions)).toEqual(['face', 'head', 'arm', 'body']);
    expect(Object.keys(req.body.questions.body!.criteria)).not.toContain('睡觉');
    expect(req.body.state.split('\n').slice(1)).toEqual(['它此刻的心情:替对方高兴,想点头', '它正要说的话:太好啦!']);
  });

  it('loses markers written out of habit, reads a script as its text, and without a feeling asks nothing', async () => {
    const { page, mock, tool } = await setup();
    await tool('pet_say')({ text: '【开心】你好呀<点头>', feeling: '开心' });
    expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: [], text: '你好呀', anchors: [] }]);
    await tool('pet_say')({ script: '【开心】在吗', feeling: '开心' });
    expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: [], text: '在吗', anchors: [] }]);
    expect(await tool('pet_say')({ text: '嗯' })).toContain(t.felt(null));
    expect(mock.requests).toHaveLength(2);
  });

  it('stops waiting at a voice stop and goes out without words', async () => {
    const { page, mock, tool, cfg } = await setup();
    cfg.decider.timeoutMs = 10_000;
    mock.delayMs = 5_000;
    const stop = new AbortController();
    const out = tool('pet_say')({ text: '好', feeling: '开心' }, stop.signal);
    await expect.poll(() => mock.requests.length).toBe(1);
    stop.abort();
    expect(await out).toContain(t.felt({ why: t.failure('aborted', '') }));
    expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: [], text: '好', anchors: [] }]);
  });
});

it('pet_feel plays its words at once, falling asleep included, and says a posture lasts', async () => {
  const { page, mock, tool } = await setup();
  mock.answer = () => ({ face: [['开心', .9]], body: [['睡觉', .75]] });
  expect(await tool('pet_feel')({ feeling: '困了,想睡' })).toBe(t.actReceipt(['睡觉'], ['睡觉'], []));
  expect((await page.next((m) => m.t === 'act')).actions).toEqual(['sleep']);
});

describe('no words', () => {
  it('when a decision fails: the bubble still goes out, and after the breaker opens nothing is asked until a key is saved; the Habits page says why', async () => {
    const { world, page, mock, tool, host } = await setup();
    mock.status = 500;
    await tool('pet_say')({ text: '先失败一次', feeling: '有点担心' });
    await page.next((m) => m.t === 'say');
    expect(world.petState().decider).toEqual({ mode: 'decider', enabled: true, failing: failure.http('500 mock failure') });
    for (let i = 0; i <= BREAKER_FAILS; i++) {
      await tool('pet_say')({ text: `第 ${i} 句`, feeling: '有点担心' });
      expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: [], text: `第 ${i} 句`, anchors: [] }]);
    }
    expect(mock.requests).toHaveLength(BREAKER_FAILS);
    expect(await tool('pet_feel')({ feeling: '有点担心' })).toBe(t.felt({ why: t.failure('breaker', '') }));
    expect(world.petState().decider).toEqual({ mode: 'decider', enabled: true, failing: failure.breaker });
    expect(host.lines.some((l) => l.includes(`连续 ${BREAKER_FAILS} 次失败`))).toBe(true);
    mock.status = 200;
    await world['invoke']('pet', 'setDeciderKey', ['sk-or-fixed-key-456']);
    expect(world.petState().decider).toMatchObject({ failing: null });
    await tool('pet_say')({ text: '好了', feeling: '开心' });
    expect(mock.requests).toHaveLength(BREAKER_FAILS + 1);
  });

  it('when a decision times out', async () => {
    const { mock, tool, cfg } = await setup();
    cfg.decider.timeoutMs = 100;
    mock.delayMs = 400;
    expect(await tool('pet_say')({ text: '嗯', feeling: '开心' })).toContain(t.failure('timeout', ''));
  });

  it('and nothing asked from a decider tool still bound after the switch went off', async () => {
    const { cfg, world, page, mock, tool } = await setup();
    const say = tool('pet_say'), feel = tool('pet_feel');
    cfg.decider.enabled = false;
    world.refresh();
    expect(await say({ text: '还在吗', feeling: '有点担心' })).toContain(t.failure('off', ''));
    expect((await page.next((m) => m.t === 'say')).beats).toEqual([{ actions: [], text: '还在吗', anchors: [] }]);
    expect(await feel({ feeling: '有点担心' })).toBe(t.felt({ why: t.failure('off', '') }));
    expect(mock.requests).toEqual([]);
  });

  it('and nothing asked for a body with no word to ask about', async () => {
    const { world, page, mock, tool } = await setup();
    page.send({ t: 'figure', id: 'coo', ok: true, words: [] });
    await expect.poll(() => world['vocab']().length).toBe(0);
    expect(await tool('pet_feel')({ feeling: '开心' })).toBe(t.felt({ words: [] }));
    expect(mock.requests).toEqual([]);
  });

  it('and the decision in flight given up when the World stops, its bubble not sent', async () => {
    const { world, page, mock, tool, cfg } = await setup();
    cfg.decider.timeoutMs = 10_000;
    mock.delayMs = 5_000;
    const out = tool('pet_say')({ text: '第一句', feeling: '开心' });
    await expect.poll(() => mock.requests.length).toBe(1);
    await world.stop();
    expect(await Promise.race([out, sleep(2_000, 'still waiting')])).toContain('[pet_say 没执行]');
    expect(page.messages.filter((m) => m.t === 'say')).toEqual([]);
  });
});

it('keeps the key out of every log line, event, receipt, page order and state', async () => {
  const { world, page, mock, tool, host } = await setup();
  mock.status = 401;
  mock.failMessage = `bad key ${KEY}`;
  const receipts = [await tool('pet_say')({ text: '嗯', feeling: '开心' }), await tool('pet_feel')({ feeling: '开心' })];
  expect(world.petState().decider).toMatchObject({ failing: failure.http('401 bad key ***') });
  await world['invoke']('pet', 'setDeciderKey', [KEY]);
  const seen = JSON.stringify([receipts, host.lines, host.events, host.stored, world.petState(), world.webUi('zh'), page.messages]);
  expect(seen).not.toContain(KEY);
});

it('describes pet_feel', () => {
  expect(DESKTOP_PET.describe!.tools.map((d) => d.name)).toContain('pet_feel');
});
