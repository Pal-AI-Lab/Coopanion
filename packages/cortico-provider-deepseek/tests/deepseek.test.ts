import { afterEach, describe, expect, it } from 'vitest';
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
import DEEPSEEK, { OFF_PEAK } from '../src/index.ts';

const entry = (patch: Partial<LLMProviderEntry> = {}): LLMProviderEntry => ({
  kind: 'deepseek', baseUrl: 'http://127.0.0.1:1', secret: 'KEY',
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

describe('DeepSeek provider', () => {
  it('passes the provider dry mount', () => {
    const report = dryMountProvider(DEEPSEEK, { scratchDir: mkdtempSync(join(tmpdir(), 'ds-dry-')) });
    expect(report.failures).toEqual([]);
  });

  it('posts to /responses with the key, keeps effort none for no thinking, and asks no encrypted reasoning back', async () => {
    const { url, seen } = await stub();
    const instance = DEEPSEEK.create('deepseek', entry({ baseUrl: url }), host() as never);
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
    const [flash] = DEEPSEEK.prices();
    const meters = { ...unknownMeters(), input: 1_000_000, uncachedInput: 1_000_000, cachedInput: 0, output: 0, total: 1_000_000, reasoning: 0 };
    const cost = (at: string) => priceUsage(meters, [snapshotPrice(flash, { startedAt: at, requestedServiceTier: null })])[0].amount;
    expect(cost('2026-09-22T02:30:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput * 2, 6); // Tuesday, peak
    expect(cost('2026-09-22T12:00:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput, 6); // Tuesday, off-peak
    expect(cost('2026-09-26T02:30:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput, 6); // Saturday
  });

  it('accepts images only for a multimodal endpoint on a model that reads them', () => {
    const spec = (model: string) => ({ model, thinking: true });
    expect(DEEPSEEK.accepts!(entry(), spec('deepseek-flash'), 'image/jpeg')).toBe(true);
    expect(DEEPSEEK.accepts!(entry(), spec('deepseek-v4-pro'), 'image/jpeg')).toBe(false);
    expect(DEEPSEEK.accepts!(entry({ multimodal: false }), spec('deepseek-flash'), 'image/png')).toBe(false);
  });
});
