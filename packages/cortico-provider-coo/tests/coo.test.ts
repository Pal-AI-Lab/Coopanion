import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dryMountProvider } from 'cortico/extensions/dry-mount.ts';
import { priceUsage, unknownMeters } from 'cortico/core/generation.ts';
import { snapshotPrice } from 'cortico/providers/pricebook.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { functionCall, functionResult, message } from 'cortico/protocol/open-responses/context.ts';
import { RESERVED_FRAME_NAMES } from 'cortico/core/loop.ts';
import { blobLine } from 'cortico/core/blobs.ts';
import COO, { OFF_PEAK, VENDORS, VENDOR_ICONS, protocolOf, vendorEntry, vendorOf } from '../src/index.ts';
import { PROTOCOLS, endpointName, locate, regionsOf, siteOf } from '../src/vendors.ts';
import { connectVendor, type ConsoleCall } from '../src/connect.ts';

const entry = (patch: Partial<LLMProviderEntry> = {}): LLMProviderEntry => ({
  kind: 'coo', baseUrl: 'https://api.deepseek.com', secret: 'KEY',
  spec: { model: 'deepseek-flash', thinking: true, reasoningEffort: 'high' }, multimodal: true, ...patch,
});
const host = (secret = 'sk-test') => ({
  stateDir: mkdtempSync(join(tmpdir(), 'ds-')), secret: () => secret, readBlob: () => null,
  keepThinking: () => true, log: nullLogger(),
});

const AT = { startedAt: '2026-10-08T00:00:00.000Z', requestedServiceTier: null };

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
    const [flash] = COO.prices(entry(), { model: 'deepseek-flash' }, AT);
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
      const send = async (id: string, effort: string, model?: string) => {
        const v = VENDORS.find((x) => x.id === id)!;
        const instance = COO.create(id, entry({ baseUrl: siteOf(v, 'cn').baseUrl, spec: { model: model ?? v.model, thinking: true } }), host() as never);
        await instance.client.respond({ model: model ?? v.model, input: [], reasoning: { effort } } as unknown as Request, {});
        return bodies.at(-1)!.reasoning;
      };
      expect(await send('deepseek', 'max')).toEqual({ effort: 'max' });
      expect(await send('qwen', 'high')).toEqual({ effort: 'medium' });
      expect(await send('qwen', 'none')).toEqual({ effort: 'none' });
      expect(await send('kimi', 'none')).toEqual({ effort: 'low' });
      expect(await send('stepfun', 'max')).toEqual({ effort: 'high' });
      expect(await send('qianfan', 'high')).toBeUndefined();
      expect(await send('openai', 'none')).toEqual({ effort: 'none' });
      expect(await send('openai', 'none', 'gpt-6-astra')).toEqual({ effort: 'low' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends images only from the newest delivered batch on; earlier ones keep their text line', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reply = { id: 'r', object: 'response', model: 'm', status: 'completed', created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const instance = COO.create('deepseek', entry(), { ...host(), readBlob: () => Buffer.from('jpeg') } as never);
    const [frame] = RESERVED_FRAME_NAMES;
    const shot = (handle: string) => ({ handle, mime: 'image/jpeg', name: 'screen.jpg', fallbackText: '屏幕截图' });
    const shotResult = (callId: string, handle: string) => functionResult(callId, blobLine(shot(handle)), { blobs: [shot(handle)] });
    const context = [
      message('user', '开始'),
      functionCall('f1', frame!, '{}'), functionResult('f1', '[打字] 看看屏幕'),
      functionCall('c1', 'look', '{}'), shotResult('c1', 'blob:a.jpg'),
      functionCall('f2', frame!, '{}'), functionResult('f2', '[打字] 再看看'),
      functionCall('c2', 'look', '{}'), shotResult('c2', 'blob:b.jpg'),
    ];
    try {
      await instance.client.respond({ model: 'deepseek-flash', input: context.map((r) => r.item) } as unknown as Request, { context });
    } finally {
      vi.unstubAllGlobals();
    }
    const outputs = (bodies[0].input as Array<{ type: string; call_id?: string; output?: unknown }>)
      .filter((i) => i.type === 'function_call_output' && (i.call_id === 'c1' || i.call_id === 'c2'));
    expect(outputs[0].output).toBe(blobLine(shot('blob:a.jpg')));
    expect(outputs[1].output).toContainEqual(expect.objectContaining({ type: 'input_image' }));
  });

  it('moves tool result images into a user message after them for a service whose tool output takes text only', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reply = { id: 'r', object: 'response', model: 'm', status: 'completed', created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const shot = { handle: 'blob:a.jpg', mime: 'image/jpeg', name: 'screen.jpg', fallbackText: '屏幕截图' };
    const image = { type: 'input_image', image_url: `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}` };
    const context = [message('user', '看看屏幕'), functionCall('c1', 'look', '{}'), functionResult('c1', blobLine(shot), { blobs: [shot] })];
    const send = async (id: string) => {
      const v = VENDORS.find((x) => x.id === id)!;
      const instance = COO.create(id, entry({ baseUrl: siteOf(v, 'cn').baseUrl, spec: { model: v.model, thinking: true } }), { ...host(), readBlob: () => Buffer.from('jpeg') } as never);
      await instance.client.respond({ model: v.model, input: context.map((r) => r.item) } as unknown as Request, { context });
      const input = bodies.at(-1)!.input as Array<Record<string, unknown>>;
      return input.slice(input.findIndex((i) => i.type === 'function_call_output'));
    };
    try {
      expect(await send('qwen')).toMatchObject([
        { type: 'function_call_output', call_id: 'c1', output: blobLine(shot) },
        { type: 'message', role: 'user', content: [image] },
      ]);
      expect(await send('deepseek')).toMatchObject([
        { type: 'function_call_output', call_id: 'c1', output: [{ type: 'input_text', text: blobLine(shot) }, image] },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads the reasoning streams of StepFun and Qwen, which the standard parser rejects (#94)', async () => {
    const at = { output_index: 0, item_id: 'rs_1', content_index: 0 };
    const message = { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '好', annotations: [] }] };
    const tail = [
      { type: 'response.output_item.added', output_index: 1, item: { ...message, status: 'in_progress', content: [] } },
      { type: 'response.content_part.added', output_index: 1, item_id: 'msg_1', content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', output_index: 1, item_id: 'msg_1', content_index: 0, delta: '好' },
      { type: 'response.output_text.done', output_index: 1, item_id: 'msg_1', content_index: 0, text: '好' },
      { type: 'response.content_part.done', output_index: 1, item_id: 'msg_1', content_index: 0, part: message.content[0] },
      { type: 'response.output_item.done', output_index: 1, item: message },
      { type: 'response.completed', response: { id: 'resp_1', object: 'response', model: 'm', status: 'completed', output: [message], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ];
    const reasoning = { id: 'rs_1', type: 'reasoning', summary: [], content: null, encrypted_content: null };
    const streams: Record<string, object[]> = {
      // StepFun's documented stream: vLLM's reasoning_part events; the item closes with null content and
      // is left out of the terminal response
      stepfun: [
        { type: 'response.output_item.added', output_index: 0, item: { ...reasoning, status: 'in_progress' } },
        { type: 'response.reasoning_part.added', ...at, part: { type: 'reasoning_text', text: '' } },
        { type: 'response.reasoning_text.delta', ...at, delta: '想' },
        { type: 'response.reasoning_text.done', ...at, text: '想' },
        { type: 'response.reasoning_part.done', ...at, part: { type: 'reasoning_text', text: '想' } },
        { type: 'response.output_item.done', output_index: 0, item: { ...reasoning, status: 'completed' } },
        ...tail,
      ],
      // Qwen as reported: reasoning deltas with no part added first
      qwen: [
        { type: 'response.output_item.added', output_index: 0, item: { ...reasoning, status: 'in_progress' } },
        { type: 'response.reasoning_text.delta', ...at, delta: '想' },
        { type: 'response.reasoning_text.done', ...at, text: '想' },
        { type: 'response.output_item.done', output_index: 0, item: { ...reasoning, status: 'completed' } },
        ...tail,
      ],
    };
    let events: object[] = [];
    vi.stubGlobal('fetch', async () => {
      const all = [{ type: 'response.created', response: { id: 'resp_1', object: 'response', model: 'm', status: 'in_progress', output: [] } }, ...events];
      const sse = all.map((e, i) => `data: ${JSON.stringify({ ...e, sequence_number: i })}\n\n`).join('');
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    try {
      for (const [id, stream] of Object.entries(streams)) {
        events = stream;
        const v = VENDORS.find((x) => x.id === id)!;
        const instance = COO.create(id, entry({ baseUrl: siteOf(v, 'cn').baseUrl, spec: { model: v.model, thinking: true } }), host() as never);
        const out = await instance.client.respond({ model: v.model, input: [] } as unknown as Request, { onEvent: () => {} });
        expect(out.response.output.map((item) => item.type), id).toEqual(['reasoning', 'message']);
        expect(out.response.output[0], id).toMatchObject({ content: [{ type: 'reasoning_text', text: '想' }] });
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('prices the default model of each service whose price page states per-model prices, and no other service', () => {
    for (const v of VENDORS) {
      const quotes = COO.prices(entry({ baseUrl: siteOf(v, 'cn').baseUrl }), { model: v.model }, AT);
      expect(quotes.some((q) => q.models.includes(v.model)), v.id).toBe(['deepseek', 'openai', 'anthropic', 'gemini', 'xai'].includes(v.id));
    }
  });

  it('tells the service and its platform from the base URL, trailing slash or not, and nothing else', () => {
    for (const v of VENDORS) {
      const sites = regionsOf(v).length ? regionsOf(v).map((r) => [r, siteOf(v, r)] as const) : [[null, siteOf(v, 'cn')] as const];
      for (const [region, site] of sites) {
        expect(locate(site.baseUrl), `${v.id} ${region}`).toMatchObject({ vendor: { id: v.id }, region });
        expect(locate(`${site.baseUrl}/`)?.region).toBe(region);
        expect(vendorEntry(v, v.model, region ?? 'cn')).toMatchObject({ kind: 'coo', baseUrl: site.baseUrl, secret: v.secret, spec: { model: v.model } });
      }
      expect(VENDOR_ICONS[v.id], v.id).toMatch(/^<svg /);
    }
    // every platform of every service has its own endpoint, so each keeps its own key
    const names = VENDORS.flatMap((v) => [endpointName(v, 'cn'), endpointName(v, 'intl')]);
    expect(new Set(names).size).toBe(VENDORS.length + VENDORS.filter((v) => regionsOf(v).length).length);
    expect(VENDORS[0]!.id).toBe('deepseek');
    // Zhipu's mainland Responses endpoint is not under its chat path; Z.ai's chat path is the international platform
    expect(vendorOf('https://open.bigmodel.cn/api/paas/v4')).toBeNull();
    expect(locate('https://api.z.ai/api/paas/v4')).toMatchObject({ vendor: { id: 'glm' }, region: 'intl', site: { protocol: 'chat' } });
    expect(vendorOf('http://127.0.0.1:1234/v1')).toBeNull();
  });

  it("sends each protocol to its own path with its own key header; a listed URL takes its platform's protocol", async () => {
    const seen: Array<{ path: string; headers: IncomingHttpHeaders }> = [];
    const replies: Record<string, object> = {
      '/responses': { id: 'r1', object: 'response', model: 'm', status: 'completed', created_at: 1, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        output: [{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }] },
      '/chat/completions': { id: 'c1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
      '/v1/messages': { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn',
        stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
      '/models/m:generateContent': { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
    };
    server = createServer(async (req, res) => {
      for await (const _ of req) { /* drain the body */ }
      const path = (req.url ?? '').split('?')[0]!;
      seen.push({ path, headers: req.headers });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(replies[path] ?? {}));
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
    for (const protocol of PROTOCOLS) {
      const instance = COO.create('x', entry({ baseUrl: url, options: { protocol }, spec: { model: 'm', thinking: false } }), host() as never);
      const out = await instance.client.respond({ model: 'm', input: [] } as unknown as Request, { context: [message('user', '在吗')] });
      expect(out.response.output.find((item) => item.type === 'message'), protocol).toMatchObject({ content: [{ text: 'ok' }] });
    }
    expect(seen.map((s) => s.path)).toEqual(['/responses', '/chat/completions', '/v1/messages', '/models/m:generateContent']);
    expect(seen.map((s) => s.headers.authorization ?? s.headers['x-api-key'] ?? s.headers['x-goog-api-key']))
      .toEqual(['Bearer sk-test', 'Bearer sk-test', 'sk-test', 'sk-test']);
    expect(protocolOf(entry({ baseUrl: url }))).toBe('responses');
    for (const v of VENDORS) for (const r of ['cn', 'intl'] as const) expect(protocolOf(entry({ baseUrl: siteOf(v, r).baseUrl }))).toBe(siteOf(v, r).protocol);
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
