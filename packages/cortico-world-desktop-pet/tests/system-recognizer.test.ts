/**
 * Windows' own recognizer behind its line protocol: a fake helper process for the protocol,
 * and on Windows the real one once.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SystemRecognizer, systemRecognizerSupported } from '../src/asr/system-recognizer.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { fakeSapi } from './helpers/fake-sapi.ts';

const log = new FakeHost().log;
const platform = process.platform;
beforeEach(() => Object.defineProperty(process, 'platform', { value: 'win32' }));
afterEach(() => Object.defineProperty(process, 'platform', { value: platform }));

describe('SystemRecognizer', () => {
  it('streams a sentence frame by frame and reports the text as it grows', async () => {
    const { spawnImpl, spawned } = fakeSapi({ partial: (n) => `听到 ${n}`, final: (n) => `一共 ${n}` });
    const r = new SystemRecognizer({ language: () => 'zh', timeoutMs: () => 1000, log, spawnImpl });
    await r.start();
    expect(r.state()).toMatchObject({ phase: 'running', url: 'Windows 语音识别（zh-CN）' });
    expect(spawned[0].env?.PET_ASR_LANGUAGE).toBe('zh');
    const partials: string[] = [];
    const s = r.sentence((t) => partials.push(t))!;
    s.write(new Int16Array(320));
    s.write(new Int16Array(320));
    await expect.poll(() => partials).toEqual(['听到 640', '听到 1280']);
    expect(await s.end()).toMatchObject({ text: '一共 1280', error: null });
    expect(spawned[0].lines.map((l) => l.slice(0, 2))).toEqual(['B ', 'A ', 'A ', 'E']);
    await r.stop();
    expect(r.state().phase).toBe('stopped');
  });

  it('keeps sentences apart by id', async () => {
    const { spawnImpl } = fakeSapi({ final: (n) => String(n) });
    const r = new SystemRecognizer({ language: () => 'zh', timeoutMs: () => 1000, log, spawnImpl });
    await r.start();
    const a = r.sentence()!;
    a.write(new Int16Array(100));
    const ra = a.end();
    const b = r.sentence()!;
    b.write(new Int16Array(300));
    expect((await ra).text).toBe('200');
    expect((await b.end()).text).toBe('600');
    await r.stop();
  });

  it('transcribes a finished sentence in one go', async () => {
    const { spawnImpl } = fakeSapi({ final: (n) => `共 ${n} 字节` });
    const r = new SystemRecognizer({ language: () => 'zh', timeoutMs: () => 1000, log, spawnImpl });
    expect(await r.transcribe(new Int16Array(4000))).toMatchObject({ text: '共 8000 字节', error: null });
    await r.stop();
  });

  it('reports a missing recognizer as an error the panel can show, and retries only for another language', async () => {
    let lang = 'ja';
    const { spawnImpl, spawned } = fakeSapi({ final: () => '', first: '{"fatal":"no-recognizer"}' });
    const r = new SystemRecognizer({ language: () => lang, timeoutMs: () => 1000, log, spawnImpl });
    await r.start();
    expect(r.state().phase).toBe('error');
    expect(r.state().detail).toContain('「ja」');
    expect(r.sentence()).toBeNull();
    expect((await r.transcribe(new Int16Array(160))).error).toContain('「ja」');
    expect(spawned).toHaveLength(1);
    lang = 'ko';
    expect(r.languageChanged).toBe(true);
    await r.transcribe(new Int16Array(160));
    expect(spawned.map((s) => s.env?.PET_ASR_LANGUAGE)).toEqual(['ja', 'ko']);
  });

  it('restarts with the new language when the setting changes', async () => {
    let lang = 'zh';
    const { spawnImpl, spawned } = fakeSapi({ final: () => 'ok' });
    const r = new SystemRecognizer({ language: () => lang, timeoutMs: () => 1000, log, spawnImpl });
    await r.start();
    lang = 'en';
    expect(r.ready).toBe(false);
    await r.transcribe(new Int16Array(160));
    expect(spawned.map((s) => s.env?.PET_ASR_LANGUAGE)).toEqual(['zh', 'en']);
    await r.stop();
  });

  it.skipIf(!systemRecognizerSupported())('opens the real Windows recognizer and hears nothing in silence', async () => {
    const r = new SystemRecognizer({ language: () => 'auto', timeoutMs: () => 10_000, log });
    try {
      await r.start();
      if (r.state().phase === 'error') return; // a Windows without any recognizer installed
      expect(r.state().phase).toBe('running');
      expect(await r.transcribe(new Int16Array(16000))).toMatchObject({ text: '', error: null });
    } finally {
      await r.stop();
    }
  }, 60_000);
});
