/**
 * Engine `api` end to end inside the World: PCM frames over the pet socket → segmenter → one POST to
 * a stand-in for an OpenAI-compatible transcription service on a local port → `desktop-pet.speech`,
 * and what the voice panel shows when the service fails.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import { petText } from '../src/i18n/index.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

const t = petText('zh');

const tone = (ms: number, amp: number) => {
  const frames: Int16Array[] = [];
  for (let f = 0; f < ms / 20; f++) {
    const fr = new Int16Array(320);
    for (let i = 0; i < 320; i++) fr[i] = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 440 * (f * 320 + i) / 16000));
    frames.push(fr);
  }
  return frames;
};
/** 900 ms of speech and the pause that ends the sentence. */
const sentence = () => [...tone(900, .3), ...tone(900, 0)];

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

interface Request { method: string; path: string; auth: string | undefined; fields: Record<string, string>; file: { name: string; type: string; bytes: Buffer } | null }

/** A transcription service on a local port: `answer` replies to each request, in order; all are recorded. */
async function service(...answers: Array<(res: ServerResponse) => void>) {
  const seen: Request[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData();
    const fields: Record<string, string> = {};
    let file: Request['file'] = null;
    for (const [name, value] of form) {
      if (typeof value === 'string') fields[name] = value;
      else file = { name: value.name, type: value.type, bytes: Buffer.from(await value.arrayBuffer()) };
    }
    seen.push({ method: req.method ?? '', path: req.url ?? '', auth: req.headers.authorization, fields, file });
    (answers[seen.length - 1] ?? answers.at(-1)!)(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  cleanup.push(() => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, seen };
}

const json = (status: number, body: unknown) => (res: ServerResponse) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

/** Writes a config patch into the live section, as Core does with a World's persist. */
const merge = (to: Record<string, unknown>, patch: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) merge(to[k] as Record<string, unknown>, v as Record<string, unknown>);
    else to[k] = v;
  }
};

/** A started World on engine `api` at `baseUrl`, listening all the time, with its secrets in `secrets`. */
async function setup(baseUrl: string, change: (cfg: DesktopPetConfigSection) => void = () => {}) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.engine = 'api';
  cfg.asr.mic.mode = 'always';
  cfg.asr.api = { baseUrl, model: 'test-model' };
  change(cfg);
  const secrets = { key: '' };
  const dir = mkdtempSync(join(tmpdir(), 'pet-api-'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: (patch) => merge(cfg as never, patch as never), runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
    asrApiKey: () => secrets.key, storeAsrApiKey: (key) => { secrets.key = key; },
  });
  const host = new FakeHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  const panel = (method: string, args: unknown[] = []) => world.webUi().invoke!('voice', method, args) as Promise<Record<string, unknown>>;
  const engine = () => world.voiceState().server as { phase: string; detail: string | null };
  return { cfg, world, host, page, panel, engine, secrets };
}

describe('engine api', () => {
  it('sends a finished sentence as 16 kHz mono 16-bit WAV with the model, the language and the json format, and delivers the text', async () => {
    const { url, seen } = await service(json(200, { text: ' 今天天气怎么样 ' }));
    const { cfg, host, page, panel, engine, secrets } = await setup(url);
    await panel('setApi', [{ key: 'test-key' }]);
    expect(secrets.key).toBe('test-key');
    expect(JSON.stringify(cfg)).not.toContain('test-key');
    expect((await panel('state')).api).toEqual({ baseUrl: url, model: 'test-model', keySaved: true });
    await expect.poll(() => engine().phase).toBe('running');

    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.speech', text: '[voice] 伙伴:今天天气怎么样' });
    const [req] = seen;
    expect(req).toMatchObject({ method: 'POST', path: '/v1/audio/transcriptions', auth: 'Bearer test-key', fields: { model: 'test-model', language: 'zh', response_format: 'json' } });
    expect(req!.file!.type).toBe('audio/wav');
    const wav = req!.file!.bytes;
    expect([wav.toString('ascii', 0, 4), wav.toString('ascii', 8, 16), wav.toString('ascii', 36, 40)]).toEqual(['RIFF', 'WAVEfmt ', 'data']);
    expect({ format: wav.readUInt16LE(20), channels: wav.readUInt16LE(22), rate: wav.readUInt32LE(24), bits: wav.readUInt16LE(34) }).toEqual({ format: 1, channels: 1, rate: 16000, bits: 16 });
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
    // the whole sentence: at least the 900 ms spoken
    expect(wav.length - 44).toBeGreaterThanOrEqual(900 * 16 * 2);

    // auto names no language: the service tells it
    cfg.asr.language = 'auto';
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => seen.length, { timeout: 5000 }).toBe(2);
    expect(seen[1]!.fields).not.toHaveProperty('language');
  });

  it("shows a failed request's status and message as the engine's state and sends nothing more (one request) until a new key starts it again", async () => {
    const { url, seen } = await service(json(401, { error: { message: 'Invalid API key' } }), (res) => { res.writeHead(503); res.end('upstream down'); });
    const { world, host, page, panel, engine } = await setup(url);
    await expect.poll(() => engine().phase).toBe('running');

    for (const fr of sentence()) page.audio(fr);
    const failed = t.transcription.status(401, 'Invalid API key');
    await expect.poll(() => engine()).toMatchObject({ phase: 'error', detail: failed });
    expect(world.voiceState().recent).toMatchObject([{ text: t.voice.failedLine(failed), dropped: true }]);
    // the pet page closes the microphone, and its button says why
    await page.next((m) => m.t === 'prefs' && m.mic === false && (m.voice as { detail?: string })?.detail === failed);
    for (const fr of sentence()) page.audio(fr);
    await new Promise((r) => setTimeout(r, 1500));
    expect(seen).toHaveLength(1);
    expect(host.events).toHaveLength(0);

    await panel('setApi', [{ key: 'another-key' }]);
    expect(engine().phase).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => engine().detail, { timeout: 5000 }).toBe(t.transcription.status(503, 'upstream down'));
    expect(seen.map((r) => r.auth)).toEqual([undefined, 'Bearer another-key']);
  });

  it('gives up on a service that does not answer within asr.timeoutMs', async () => {
    const { url } = await service(() => {});
    const { page, engine } = await setup(url, (cfg) => { cfg.asr.timeoutMs = 300; });
    await expect.poll(() => engine().phase).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => engine(), { timeout: 5000 }).toMatchObject({ phase: 'error', detail: t.transcription.timeout(300) });
  });

  it('says what is missing before anything is sent, and starts once the address is filled in', async () => {
    const { url, seen } = await service(json(200, { text: '好' }));
    const { cfg, panel, engine } = await setup('');
    await expect.poll(() => engine()).toMatchObject({ phase: 'error', detail: t.transcription.noUrl });
    await panel('setApi', [{ baseUrl: ` ${url} ` }]);
    expect(cfg.asr.api.baseUrl).toBe(url);
    expect(engine()).toMatchObject({ phase: 'running', detail: null });
    expect(seen).toHaveLength(0);
  });
});
