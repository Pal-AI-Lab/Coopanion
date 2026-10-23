/**
 * Vokie's recognition service behind its HTTP API: a real server on a free port (no mocked
 * network), the temporary WAV it receives, and the errors the panel can show.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DESKTOP_PET_DEFAULTS, asrEngineFor } from '../src/config.ts';
import { VokieRecognizer, type VokieRecognizerOptions } from '../src/asr/vokie.ts';
import { petText } from '../src/i18n/index.ts';
import { FakeHost } from './helpers/fake-host.ts';

const t = petText('zh').vokie;
const log = new FakeHost().log;
const HEALTH = '{"ok":true,"service":"vokie-skill","backend":"cpp","version":"1.6.3","port":27678}';

/** What the test server does with one request. */
type Reply = { status: number; body: string } | 'hang' | 'drop';
interface Request { method: string; path: string; body: string }

let cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function serve(handler: (req: Request) => Reply) {
  const requests: Request[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const seen: Request = { method: req.method ?? '', path: req.url ?? '', body: Buffer.concat(chunks).toString('utf8') };
      requests.push(seen);
      const reply = handler(seen);
      if (reply === 'hang') return;
      if (reply === 'drop') { res.destroy(); return; }
      res.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  }));
  return { port: (server.address() as AddressInfo).port, requests };
}

/** A port nothing listens on any more. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function settingsFile(settings: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'pet-vokie-settings-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'app-settings.json');
  writeFileSync(file, JSON.stringify(settings));
  return file;
}

function recognizer(port: number | (() => number), extra: Partial<VokieRecognizerOptions> = {}): VokieRecognizer {
  return new VokieRecognizer({
    port: typeof port === 'number' ? () => port : port,
    language: () => 'zh',
    timeoutMs: () => 5000,
    log,
    // never the operator's own Vokie settings: the defaults stand in for a file this does not read
    settingsFile: () => null,
    ...extra,
  });
}

/** 1600 samples: 100 ms at Vokie's 16 kHz. */
const pcm = (samples = 1600): Int16Array => Int16Array.from({ length: samples }, (_, i) => Math.round(8000 * Math.sin(i / 10)));

interface AsrBody { inputPath: string; locale: string; includeSegments: boolean; includeMergedText: boolean }
const asrBody = (req: Request): AsrBody => JSON.parse(req.body) as AsrBody;
const offline2pass = (requests: Request[]): Request[] => requests.filter((r) => r.path === '/v1/asr/offline2pass');

const wavInfo = (bytes: Buffer) => ({
  riff: bytes.toString('ascii', 0, 4),
  riffSize: bytes.readUInt32LE(4),
  wave: bytes.toString('ascii', 8, 12),
  formatTag: bytes.readUInt16LE(20),
  channels: bytes.readUInt16LE(22),
  sampleRate: bytes.readUInt32LE(24),
  byteRate: bytes.readUInt32LE(28),
  blockAlign: bytes.readUInt16LE(32),
  bitsPerSample: bytes.readUInt16LE(34),
  dataTag: bytes.toString('ascii', 36, 40),
  dataBytes: bytes.readUInt32LE(40),
});

describe('VokieRecognizer', () => {
  it('marks the service running after its health reply, and shows its address', async () => {
    const server = await serve(() => ({ status: 200, body: HEALTH }));
    const r = recognizer(server.port);
    await r.start();
    expect(r.state()).toEqual({ phase: 'running', url: `http://127.0.0.1:${server.port}`, pid: null, detail: null });
    expect(server.requests[0]).toMatchObject({ method: 'GET', path: '/v1/asr/health' });
    await r.stop();
    expect(r.state().phase).toBe('stopped');
  });

  it('shows the address it will try before it has started', () => {
    expect(recognizer(() => 0).state()).toEqual({ phase: 'stopped', url: 'http://127.0.0.1:27678', pid: null, detail: null });
  });

  it('reads the port and the switch from Vokie\'s settings while asr.vokiePort is 0', async () => {
    const server = await serve((req) => ({ status: 200, body: req.path === '/v1/asr/health' ? HEALTH : '{"ok":true,"text":"hi"}' }));
    const file = settingsFile({ externalAsrApi: { enabled: true, port: server.port } });
    const r = recognizer(0, { settingsFile: () => file });
    await r.start();
    expect(r.state()).toMatchObject({ phase: 'running', url: `http://127.0.0.1:${server.port}` });
    expect(server.requests).toHaveLength(1);
    await r.stop();
  });

  it('says Vokie\'s external ASR API is off, without asking a port that cannot answer', async () => {
    const server = await serve(() => ({ status: 200, body: HEALTH }));
    const file = settingsFile({ externalAsrApi: { enabled: false, port: server.port } });
    const r = recognizer(0, { settingsFile: () => file });
    await r.start();
    expect(r.state()).toMatchObject({ phase: 'error', detail: t.apiOff });
    expect(server.requests).toHaveLength(0);
    expect((await r.transcribe(pcm())).error).toBe(t.apiOff);
    await r.stop();
  });

  it('a health reply that is not Vokie\'s is an error the panel shows, not a throw', async () => {
    const server = await serve(() => ({ status: 200, body: '{"ok":false,"service":"something-else"}' }));
    const r = recognizer(server.port);
    await expect(r.start()).resolves.toBeUndefined();
    expect(r.state()).toMatchObject({ phase: 'error', detail: t.notRunning });
    expect((await r.transcribe(pcm())).error).toBe(t.notRunning);
    await r.stop();
  });

  it('a service that is not running is an error, not a throw', async () => {
    const port = await closedPort();
    const r = recognizer(port);
    await expect(r.start()).resolves.toBeUndefined();
    expect(r.state()).toMatchObject({ phase: 'error', detail: t.notRunning });
    expect(await r.transcribe(pcm())).toMatchObject({ text: '', error: t.notRunning });
    await r.stop();
  });

  it('transcribes a sentence through a 16 kHz mono temporary WAV and removes it', async () => {
    let wav: Buffer | null = null;
    let wavPath = '';
    const server = await serve((req) => {
      if (req.path === '/v1/asr/health') return { status: 200, body: HEALTH };
      wavPath = asrBody(req).inputPath;
      wav = readFileSync(wavPath);
      return { status: 200, body: '{"ok":true,"text":" 你好 "}' };
    });
    const r = recognizer(server.port);
    await r.start();
    const result = await r.transcribe(pcm(1600));

    expect(result).toMatchObject({ text: '你好', error: null });
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(offline2pass(server.requests)).toHaveLength(1);
    expect(asrBody(offline2pass(server.requests)[0]!)).toEqual({
      inputPath: expect.stringMatching(/pet-vokie-.*\.wav$/),
      locale: 'zh',
      includeSegments: false,
      includeMergedText: true,
    });
    expect(dirname(wavPath)).toBe(tmpdir());

    const info = wavInfo(wav!);
    expect(info).toMatchObject({ riff: 'RIFF', wave: 'WAVE', formatTag: 1, channels: 1, sampleRate: 16_000, blockAlign: 2, bitsPerSample: 16, dataTag: 'data' });
    expect(info.byteRate).toBe(16_000 * 2);
    expect(info.dataBytes).toBe(1600 * 2);
    expect(info.riffSize).toBe(36 + 1600 * 2);
    expect(wav!.length).toBe(44 + 1600 * 2);

    expect(existsSync(wavPath)).toBe(false);
    await r.stop();
  });

  it('maps ok:false and its error code to the line the panel shows', async () => {
    let wavPath = '';
    const server = await serve((req) => {
      if (req.path === '/v1/asr/health') return { status: 200, body: HEALTH };
      wavPath = asrBody(req).inputPath;
      return { status: 200, body: '{"ok":false,"error":{"code":"MODEL_NOT_READY","message":"模型还没准备好"}}' };
    });
    const r = recognizer(server.port);
    await r.start();
    const result = await r.transcribe(pcm());
    expect(result.text).toBe('');
    expect(result.error).toBe(t.failed('MODEL_NOT_READY: 模型还没准备好'));
    expect(existsSync(wavPath)).toBe(false);
    await r.stop();
  });

  it('maps an empty reply and a dropped connection to errors, and removes the WAV in both cases', async () => {
    const paths: string[] = [];
    let reply: Reply = { status: 200, body: '' };
    const server = await serve((req) => {
      if (req.path === '/v1/asr/health') return { status: 200, body: HEALTH };
      paths.push(asrBody(req).inputPath);
      return reply;
    });
    const r = recognizer(server.port);
    await r.start();
    expect((await r.transcribe(pcm())).error).toBe(t.emptyReply);
    reply = 'drop';
    expect((await r.transcribe(pcm())).error!.startsWith(t.failed(''))).toBe(true);
    expect(paths).toHaveLength(2);
    for (const path of paths) expect(existsSync(path)).toBe(false);
    await r.stop();
  });

  it('gives up after asr.timeoutMs', async () => {
    let wavPath = '';
    const server = await serve((req) => {
      if (req.path === '/v1/asr/health') return { status: 200, body: HEALTH };
      wavPath = asrBody(req).inputPath;
      return 'hang';
    });
    const r = recognizer(server.port, { timeoutMs: () => 200 });
    await r.start();
    const started = Date.now();
    const result = await r.transcribe(pcm());
    expect(result.text).toBe('');
    expect(result.error).toBe(t.timeout(200));
    expect(Date.now() - started).toBeLessThan(5000);
    expect(existsSync(wavPath)).toBe(false);
    await r.stop();
  });

  it('stop() aborts the request in flight and removes its WAV', async () => {
    let wavPath = '';
    const server = await serve((req) => {
      if (req.path === '/v1/asr/health') return { status: 200, body: HEALTH };
      wavPath = asrBody(req).inputPath;
      return 'hang';
    });
    const r = recognizer(server.port, { timeoutMs: () => 30_000 });
    await r.start();
    const transcribing = r.transcribe(pcm());
    await expect.poll(() => offline2pass(server.requests).length).toBe(1);
    await r.stop();
    expect((await transcribing).error).toBe(t.stopped);
    expect(existsSync(wavPath)).toBe(false);
    expect(r.state().phase).toBe('stopped');
  });

  it('sends asr.language, or the app language\'s code when it is empty or auto', async () => {
    const server = await serve((req) => ({ status: 200, body: req.path === '/v1/asr/health' ? HEALTH : '{"ok":true,"text":"ok"}' }));
    const cases: Array<{ language: string; appLanguage: 'zh' | 'zh-Hant' | 'ja'; locale: string }> = [
      { language: 'fr', appLanguage: 'zh', locale: 'fr' },
      { language: '', appLanguage: 'zh-Hant', locale: 'zh' },
      { language: 'auto', appLanguage: 'ja', locale: 'ja' },
    ];
    for (const item of cases) {
      const r = recognizer(server.port, { language: () => item.language, appLanguage: () => item.appLanguage });
      await r.start();
      await r.transcribe(pcm());
      expect(asrBody(offline2pass(server.requests).at(-1)!).locale, item.language || item.appLanguage).toBe(item.locale);
      await r.stop();
    }
  });

  it('has no partial text while a sentence is spoken', () => {
    expect(recognizer(9).sentence(() => {})).toBeNull();
  });
});

describe('the vokie engine setting', () => {
  it('is chosen only when set, never by the app language', () => {
    for (const language of ['zh', 'en', 'ja', 'fr', 'ru']) {
      expect(asrEngineFor('', language, true), language).not.toBe('vokie');
      expect(asrEngineFor('vokie', language, true), language).toBe('vokie');
    }
  });

  it('leaves the Windows recognizer its platform rule', () => {
    expect(asrEngineFor('vokie', 'fr', false)).toBe('vokie');
    expect(asrEngineFor('system', 'fr', false)).toBe('whisper');
  });

  it('defaults asr.vokiePort to 0, which reads the port from Vokie\'s settings', () => {
    expect(DESKTOP_PET_DEFAULTS.asr.vokiePort).toBe(0);
  });
});
