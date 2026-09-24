import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dryMountProvider } from 'cortico/extensions/dry-mount.ts';
import { priceUsage, unknownMeters } from 'cortico/core/generation.ts';
import { snapshotPrice } from 'cortico/providers/pricebook.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import COO, { OFF_PEAK, VENDORS, VENDOR_ICONS, vendorEntry, vendorOf } from '../src/index.ts';
import { connectVendor, type ConsoleCall } from '../src/connect.ts';

const entry = (patch: Partial<LLMProviderEntry> = {}): LLMProviderEntry => ({
  kind: 'coo', baseUrl: 'https://api.deepseek.com', secret: 'KEY',
  spec: { model: 'deepseek-flash', thinking: true, reasoningEffort: 'high' }, multimodal: true, ...patch,
});
const host = (secret = 'sk-test') => ({
  stateDir: mkdtempSync(join(tmpdir(), 'ds-')), secret: () => secret, readBlob: () => null,
  keepThinking: () => true, log: nullLogger(),
});

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

async function stub(): Promise<{ url: string; seen: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> }> {
  const seen: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> = [];
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    seen.push({ path: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(raw) as Record<string, unknown> });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      id: 'resp_1', object: 'response', model: 'deepseek-flash', status: 'completed', created_at: 1,
      output: [{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '你好', annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 0 } },
    }));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`, seen };
}

describe('Coo Pet Provider', () => {
  it('passes the provider dry mount', () => {
    const report = dryMountProvider(COO, { scratchDir: mkdtempSync(join(tmpdir(), 'ds-dry-')) });
    expect(report.failures).toEqual([]);
  });

  it('posts to /responses with the key, keeps effort none for no thinking, and asks no encrypted reasoning back', async () => {
    const { url, seen } = await stub();
    const instance = COO.create('deepseek', entry({ baseUrl: url }), host() as never);
    const request = { model: 'deepseek-flash', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '在吗' }] }], reasoning: { effort: 'none' } } as unknown as Request;
    const out = await instance.client.respond(request, {});
    expect(out.response.output[0]).toMatchObject({ type: 'message' });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('/responses');
    expect(seen[0].auth).toBe('Bearer sk-test');
    expect(seen[0].body).toMatchObject({ model: 'deepseek-flash', store: false, reasoning: { effort: 'none' } });
    expect(seen[0].body.include).toBeUndefined();
  });

  it('charges double inside the peak windows (UTC 01–04 and 06–10 on workdays)', () => {
    const [flash] = COO.prices(entry());
    const meters = { ...unknownMeters(), input: 1_000_000, uncachedInput: 1_000_000, cachedInput: 0, output: 0, total: 1_000_000, reasoning: 0 };
    const cost = (at: string) => priceUsage(meters, [snapshotPrice(flash, { startedAt: at, requestedServiceTier: null })])[0].amount;
    expect(cost('2026-09-22T02:30:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput * 2, 6); // Tuesday, peak
    expect(cost('2026-09-22T12:00:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput, 6); // Tuesday, off-peak
    expect(cost('2026-09-26T02:30:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput, 6); // Saturday
  });

  it('accepts images only for a multimodal endpoint on a model that reads them', () => {
    const spec = (model: string) => ({ model, thinking: true });
    expect(COO.accepts!(entry(), spec('deepseek-flash'), 'image/jpeg')).toBe(true);
    expect(COO.accepts!(entry(), spec('deepseek-v4-pro'), 'image/jpeg')).toBe(false);
    expect(COO.accepts!(entry({ multimodal: false }), spec('deepseek-flash'), 'image/png')).toBe(false);
  });

  it('sends each service the thinking level it takes, or none where it documents none', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reply = { id: 'r', object: 'response', model: 'm', status: 'completed', created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    try {
      const send = async (id: string, effort: string) => {
        const v = VENDORS.find((x) => x.id === id)!;
        const instance = COO.create(id, entry({ baseUrl: v.baseUrl, spec: { model: v.model, thinking: true } }), host() as never);
        await instance.client.respond({ model: v.model, input: [], reasoning: { effort } } as unknown as Request, {});
        return bodies.at(-1)!.reasoning;
      };
      expect(await send('deepseek', 'max')).toEqual({ effort: 'max' });
      expect(await send('qwen', 'high')).toEqual({ effort: 'medium' });
      expect(await send('qwen', 'none')).toEqual({ effort: 'none' });
      expect(await send('kimi', 'none')).toEqual({ effort: 'low' });
      expect(await send('stepfun', 'max')).toEqual({ effort: 'high' });
      expect(await send('qianfan', 'high')).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('prices DeepSeek only', () => {
    expect(COO.prices(entry()).length).toBeGreaterThan(0);
    expect(COO.prices(entry({ baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }))).toEqual([]);
  });

  it('tells the service from the base URL, trailing slash or not, and nothing else', () => {
    for (const v of VENDORS) {
      expect(vendorOf(v.baseUrl)?.id).toBe(v.id);
      expect(vendorOf(`${v.baseUrl}/`)?.id).toBe(v.id);
      expect(VENDOR_ICONS[v.id], v.id).toMatch(/^<svg /);
      expect(vendorEntry(v)).toMatchObject({ kind: 'coo', baseUrl: v.baseUrl, secret: v.secret, spec: { model: v.model } });
    }
    expect(new Set(VENDORS.map((v) => v.id)).size).toBe(VENDORS.length);
    expect(VENDORS[0]!.id).toBe('deepseek');
    // Zhipu's Responses endpoint is not under its chat path
    expect(vendorOf('https://open.bigmodel.cn/api/paas/v4')).toBeNull();
    expect(vendorOf('http://127.0.0.1:1234/v1')).toBeNull();
  });
});

describe('connecting a service through the console routes', () => {
  /** A console that knows the endpoints in `existing`, records every call, and tests with `testOk`. */
  function fakeConsole(existing: string[], testOk: boolean) {
    const calls: Array<[string, unknown]> = [];
    const call = (async (path: string, body?: unknown) => {
      calls.push([path, body]);
      if (path === '/api/providers' && body === undefined) return { providers: existing.map((name) => ({ name })) };
      if (path.endsWith('/test')) return testOk ? { ok: true, elapsedMs: 42 } : { ok: false, hint: '密钥无效' };
      if (body === undefined) return { name: path.split('/').pop(), entry: { kind: 'coo', spec: { model: 'mine' } }, revision: 'r1' };
      return {};
    }) as ConsoleCall;
    return { call, calls };
  }
  const qwen = VENDORS.find((v) => v.id === 'qwen')!;

  it('creates the endpoint the first time, tests it, makes it active and resumes', async () => {
    const { call, calls } = fakeConsole(['deepseek'], true);
    expect(await connectVendor(call, qwen, 'sk-1')).toEqual({ ok: true, ms: 42, why: null });
    expect(calls.map(([p]) => p)).toEqual(['/api/providers', '/api/providers', '/api/providers/qwen/test', '/api/providers/qwen/activate', '/api/run/resume']);
    expect(calls[1]![1]).toEqual({ name: 'qwen', entry: vendorEntry(qwen), secretValue: 'sk-1' });
  });

  it("keeps an existing endpoint's own settings and only replaces its key", async () => {
    const { call, calls } = fakeConsole(['qwen'], true);
    await connectVendor(call, qwen, 'sk-2');
    expect(calls[2]).toEqual(['/api/providers/qwen/save', { name: 'qwen', entry: { kind: 'coo', spec: { model: 'mine' } }, expectedRevision: 'r1', secretValue: 'sk-2' }]);
  });

  it('sets the model typed in, keeps the saved key when none is typed, and starts a new endpoint on it', async () => {
    const saved = fakeConsole(['qwen'], true);
    await connectVendor(saved.call, qwen, '', 'qwen3.8-plus');
    expect(saved.calls[2]).toEqual(['/api/providers/qwen/save', {
      name: 'qwen', entry: { kind: 'coo', spec: { model: 'qwen3.8-plus' }, multimodal: false }, expectedRevision: 'r1', secretValue: undefined,
    }]);
    const fresh = fakeConsole([], true);
    await connectVendor(fresh.call, qwen, 'sk-3', 'qwen3.8-flash');
    expect(fresh.calls[1]![1]).toEqual({ name: 'qwen', entry: vendorEntry(qwen, 'qwen3.8-flash'), secretValue: 'sk-3' });
  });

  it('does not switch to an endpoint whose test fails', async () => {
    const { call, calls } = fakeConsole([], false);
    expect(await connectVendor(call, qwen, 'bad')).toEqual({ ok: false, ms: null, why: '密钥无效' });
    expect(calls.some(([p]) => p.endsWith('/activate') || p === '/api/run/resume')).toBe(false);
  });
});
