import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolCallContext, ToolDef } from 'cortico/core/types.ts';
import { dryMountWorld } from 'cortico/extensions/dry-mount.ts';
import { registerProviderModules } from 'cortico/providers/registry.ts';
import { BILISCRIPT } from '../src/definition.ts';
import { BILISCRIPT_DEFAULTS, BILISCRIPT_SECRETS, type BiliScriptConfigSection } from '../src/config.ts';
import { modelText } from '../src/model-text.ts';
import type { Script } from '../src/script.ts';
import { BiliScriptWorld, type BiliScriptWorldOptions } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { startChatServer } from './helpers/chat-server.ts';
import { SCRIPTED_KIND, scriptedProvider } from './helpers/scripted-provider.ts';

const FAKE_WORKER = fileURLToPath(new URL('./helpers/fake-worker.mjs', import.meta.url));
const t = modelText('zh');
const call = {} as ToolCallContext;

/** Replies of the scripted deployment model: a cast for naming requests, one correction otherwise. */
const scripted = scriptedProvider((request) => {
  const user = JSON.stringify(request.input);
  return user.includes('Speaker labels')
    ? JSON.stringify({ S1: { name: '老王', evidence: '自我介绍' }, S2: { name: '主持人', evidence: '称呼对方王老师' } })
    : '[{"n": 3, "text": "聊聊机器学习吧。"}]';
});
registerProviderModules([scripted.module]);

let dataDir: string;
let world: BiliScriptWorld | null = null;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'biliscript-'));
  delete process.env.FAKE_WORKER_MODE;
});
afterEach(async () => {
  await world?.stop();
  world = null;
  delete process.env.FAKE_WORKER_MODE;
  rmSync(dataDir, { recursive: true, force: true });
});

const BOT_WRITER = { ...BILISCRIPT_DEFAULTS.writer, mode: 'bot' as const };

function makeWorld(over: Partial<BiliScriptWorldOptions> = {}, cfg: Partial<BiliScriptConfigSection> = { writer: BOT_WRITER }) {
  const secrets: Record<string, string> = { [BILISCRIPT_SECRETS.hfToken]: 'hf-test', [BILISCRIPT_SECRETS.biliCookie]: 'abc' };
  world = new BiliScriptWorld({
    cfg: { ...structuredClone(BILISCRIPT_DEFAULTS), ...cfg },
    timezone: 'Asia/Shanghai',
    dataDir,
    botDir: join(dataDir, 'bot'),
    repoRoot: dataDir,
    providersDirs: [join(dataDir, 'providers')],
    secret: (n) => secrets[n] ?? '',
    workerCommand: () => ({ command: process.execPath, args: [FAKE_WORKER] }),
    language: 'zh',
    ...over,
  });
  return world;
}

const tool = (w: BiliScriptWorld, name: string): ToolDef => w.tools().find((x) => x.name === name)!;
const text = (out: unknown): string => (typeof out === 'string' ? out : (out as { text: string }).text);

describe('BiliScript World', () => {
  it('dry mount reports no failures', async () => {
    const report = await dryMountWorld(BILISCRIPT, { scratchDir: dataDir });
    expect(report.failures).toEqual([]);
  });

  it('tools() returns every declared tool', () => {
    expect(makeWorld().tools().map((x) => x.name)).toEqual(BILISCRIPT.describe!.tools.map((x) => x.name));
  });

  it('a finished job pushes biliscript.finished, writes script.md and passes the secrets to the worker', async () => {
    const w = makeWorld();
    const host = new FakeHost();
    await w.start(host);
    const out = await tool(w, 'biliscript_transcribe').handler({ video: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2' }, call);
    expect(text(out)).toBe(t.queued(1, 0));
    await expect.poll(() => host.events.length).toBe(1);
    const e = host.events[0];
    expect(e.type).toBe('biliscript.finished');
    expect(e.text).toContain('[00:01] S1：大家好,我是老王。');
    expect(e.text).toContain(t.devices('cpu', null));
    expect(e.text).toContain('GPU transcription failed (RuntimeError: test); ran on the CPU');
    const md = readFileSync(join(dataDir, 'biliscript', '1', 'script.md'), 'utf8');
    expect(md).toContain('[00:04] S2：王老师好,今天聊什么?');
    const seen = JSON.parse(readFileSync(join(dataDir, 'biliscript', '1', 'seen-env.json'), 'utf8'));
    expect(seen.hf).toBe('hf-test');
    expect(seen.cookie).toBe('abc');
    expect(seen.job.url).toBe('https://www.bilibili.com/video/BV1xx411c7mD/?p=2');
  });

  it('naming speakers rewrites the script and biliscript_read shows the names', async () => {
    const w = makeWorld();
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    const named = await tool(w, 'biliscript_name_speakers').handler({ job: 1, names: { S1: '王老师', S2: '主持人' } }, call);
    expect(text(named)).toContain('S1=王老师');
    const read = text(await tool(w, 'biliscript_read').handler({ job: 1, speaker: 'S2' }, call));
    expect(read).toContain('2. [00:04] 主持人：王老师好,今天聊什么?');
    expect(read).not.toContain('大家好');
    const md = readFileSync(join(dataDir, 'biliscript', '1', 'script.md'), 'utf8');
    expect(md).toContain('[00:07] 王老师：聊聊机器学习。');
    const bad = await tool(w, 'biliscript_name_speakers').handler({ job: 1, names: { S9: 'x' } }, call);
    expect(bad).toEqual({ text: t.unknownSpeakers('S9'), failed: true });
  });

  it('a worker error pushes biliscript.failed with the stage and message', async () => {
    process.env.FAKE_WORKER_MODE = 'error';
    const w = makeWorld();
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'av170001' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].type).toBe('biliscript.failed');
    expect(host.events[0].text).toBe(t.failed(1, 'av170001', 'download', 'download: HTTP Error 412'));
  });

  it('a worker that exits without a result fails with its stderr tail', async () => {
    process.env.FAKE_WORKER_MODE = 'silent-exit';
    const w = makeWorld();
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].text).toContain('Traceback: boom');
  });

  it('cancelling a running job stops it without an event, and the next job runs', async () => {
    process.env.FAKE_WORKER_MODE = 'hang';
    const w = makeWorld();
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(async () => text(await tool(w, 'biliscript_jobs').handler({}, call))).toContain('语音识别');
    expect(text(await tool(w, 'biliscript_cancel').handler({ job: 1 }, call))).toBe(t.cancelled(1));
    delete process.env.FAKE_WORKER_MODE;
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].meta?.job).toBe(2);
  });

  it('rejects input without a video id', async () => {
    const w = makeWorld();
    const out = await tool(w, 'biliscript_transcribe').handler({ video: 'hello' }, call);
    expect(out).toEqual({ text: t.badVideo('hello'), failed: true });
  });

  it('a job left running by a restart is marked failed', async () => {
    const first = makeWorld();
    const host = new FakeHost();
    process.env.FAKE_WORKER_MODE = 'hang';
    await first.start(host);
    await first.tools().find((x) => x.name === 'biliscript_transcribe')!.handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => readFileSync(join(dataDir, 'biliscript', 'jobs.json'), 'utf8')).toContain('"running"');
    // simulate a crash: the record still says running when the next process starts
    const record = readFileSync(join(dataDir, 'biliscript', 'jobs.json'), 'utf8');
    await first.stop();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dataDir, 'biliscript', 'jobs.json'), record);
    const second = makeWorld();
    await second.start(new FakeHost());
    expect(text(await tool(second, 'biliscript_jobs').handler({}, call))).toContain(t.restarted);
  });

  it('endpoint mode names speakers and corrects text through the configured model', async () => {
    const server = await startChatServer((r) => {
      const user: string = r.body.messages[1].content;
      const content = user.includes('Speaker labels')
        ? JSON.stringify({ S1: { name: '老王', evidence: '自我介绍' }, S2: { name: null, evidence: '' } })
        : '```json\n[{"n": 3, "text": "聊聊机器学习吧。"}]\n```';
      return { json: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } };
    });
    try {
      const w = makeWorld({}, {
        writer: { ...BILISCRIPT_DEFAULTS.writer, mode: 'endpoint', protocol: 'openai', baseUrl: `${server.baseUrl}/v1`, model: 'test-model' },
      });
      const host = new FakeHost();
      await w.start(host);
      await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
      await expect.poll(() => host.events.length).toBe(1);
      expect(server.received.map((r) => r.path)).toEqual(['/v1/chat/completions', '/v1/chat/completions']);
      expect(host.usage).toHaveLength(2);
      expect(host.events[0].text).toContain('S1=老王');
      expect(host.events[0].text).toContain(t.polished(1, 'test-model'));
      const script = JSON.parse(readFileSync(join(dataDir, 'biliscript', '1', 'script.json'), 'utf8')) as Script;
      expect(script.lines[2]).toMatchObject({ text: '聊聊机器学习吧。', asrText: '聊聊机器学习。' });
      expect(script.names).toEqual({ S1: '老王' });
    } finally {
      await server.close();
    }
  });

  it('endpoint mode without a configured model finishes with labels and says why', async () => {
    const w = makeWorld({}, { writer: { ...BILISCRIPT_DEFAULTS.writer, mode: 'endpoint' } });
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].text).toContain(t.writerUnset);
  });

  it('deployment mode names speakers and corrects text with the active endpoint, its key and its model', async () => {
    mkdirSync(join(dataDir, 'bot'), { recursive: true });
    writeFileSync(join(dataDir, 'bot', 'config.json'), JSON.stringify({ activeProvider: 'main' }));
    mkdirSync(join(dataDir, 'providers', 'main'), { recursive: true });
    writeFileSync(
      join(dataDir, 'providers', 'main', 'config.json'),
      JSON.stringify({ kind: SCRIPTED_KIND, baseUrl: 'http://127.0.0.1:9', secret: 'MAIN_KEY', spec: { model: 'scripted-model', thinking: false } }),
    );
    writeFileSync(join(dataDir, 'providers', 'main', '.env'), 'MAIN_KEY=sk-from-endpoint\n');
    scripted.calls.length = 0;
    const w = makeWorld({}, { writer: { ...BILISCRIPT_DEFAULTS.writer, mode: 'deployment' } });
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    expect(scripted.calls).toHaveLength(2);
    expect(scripted.calls.map((c) => c.apiKey)).toEqual(['sk-from-endpoint', 'sk-from-endpoint']);
    expect(scripted.calls[0].request.model).toBe('scripted-model');
    expect((scripted.calls[0].request.input as Array<{ role?: string }>).map((i) => i.role)).toEqual(['system', 'user']);
    expect(host.usage.map((u) => u.model)).toEqual(['scripted-model', 'scripted-model']);
    expect(host.usage[0].usage.promptTokens).toBe(100);
    expect(host.events[0].text).toContain('S1=老王');
    expect(host.events[0].text).toContain(t.polished(1, 'scripted-model (main)'));
    const script = JSON.parse(readFileSync(join(dataDir, 'biliscript', '1', 'script.json'), 'utf8')) as Script;
    expect(script.names).toEqual({ S1: '老王', S2: '主持人' });
    expect(script.nameSource).toEqual({ S1: 'model', S2: 'model' });
  });

  it('deployment mode without an active endpoint finishes with labels and says why', async () => {
    const w = makeWorld({}, { writer: { ...BILISCRIPT_DEFAULTS.writer, mode: 'deployment' } });
    const host = new FakeHost();
    await w.start(host);
    await tool(w, 'biliscript_transcribe').handler({ video: 'BV1xx411c7mD' }, call);
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].text).toContain(t.writerFailed(`${join(dataDir, 'bot', 'config.json')} names no active model endpoint (activeProvider)`));
    expect(host.events[0].text).toContain('S1 (2 句, 未命名)');
  });

  it('the environment prompt reports the Python check', async () => {
    const w = makeWorld();
    await w.checkSetup();
    const setup = w.envPromptVars()['biliscript.setup'];
    expect(setup).toContain('Python 3.11.0');
    expect(setup).toContain('GPU(Test GPU)');
    expect(setup).toContain('torch 2.0 is a CPU-only build');
    expect(existsSync(join(dataDir, 'biliscript'))).toBe(false);
  });
});
