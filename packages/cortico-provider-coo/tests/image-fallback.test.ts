/**
 * The `coo` module's clients behind Cortico's `ImageFallback`, called through `ProviderRegistry.bind`
 * as Core calls them, on every protocol against a local fake service that refuses a request by its body.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nullLogger } from 'cortico/core/util.ts';
import type { BlobRef, LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { message, type ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { blobLine } from 'cortico/core/blobs.ts';
import { ProviderRegistry } from 'cortico/providers/registry.ts';
import { imageLeftOut } from 'cortico/providers/transport/image-fallback.ts';
import COO from '../src/index.ts';
import { PROTOCOLS, type Protocol } from '../src/vendors.ts';

const IMAGE = Buffer.from('an image the service cannot decode');
const IMAGE_DATA = IMAGE.toString('base64');
const picture: BlobRef = { handle: 'log:0123456789abcdef0123.png', mime: 'image/png', name: 'big.png', fallbackText: 'Image' };
const withPicture = message('user', `看这张\n${blobLine(picture)}`, { blobs: [picture] });

const REPLIES: Record<string, object> = {
  '/responses': { id: 'r1', object: 'response', model: 'm', status: 'completed', created_at: 1, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    output: [{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }] },
  '/chat/completions': { id: 'c1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  '/v1/messages': { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn',
    stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  '/models/m:generateContent': { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
};

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

/** A fake service that answers 400 to the requests `refuse` picks. */
async function service(refuse: (body: string) => boolean): Promise<{ url: string; bodies: string[] }> {
  const bodies: string[] = [];
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    bodies.push(body);
    if (refuse(body)) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'invalid parameter' } }));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(REPLIES[(req.url ?? '').split('?')[0]!] ?? {}));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`, bodies };
}

const carriesImage = (body: string) => body.includes(IMAGE_DATA);

/** Sends `context` through the registry's client for an endpoint of `protocol`. */
function ask(url: string, protocol: Protocol, context: ContextRecord[]) {
  const root = mkdtempSync(join(tmpdir(), 'coo-image-'));
  mkdirSync(join(root, 'x'));
  writeFileSync(join(root, 'x', '.env'), 'COO_TEST_KEY=sk-test\n');
  const entry: LLMProviderEntry = { kind: 'coo', baseUrl: url, secret: 'COO_TEST_KEY', options: { protocol }, spec: { model: 'm', thinking: false }, multimodal: true };
  const registry = new ProviderRegistry(() => ({ x: entry }), {
    stateRoot: root, keepThinking: () => true, log: nullLogger(),
    readBlob: (handle) => (handle === picture.handle ? IMAGE : null),
  }, [COO]);
  return registry.bind('x').respond({ model: 'm', input: [] } as unknown as Request, { context });
}

describe('a request the model service refuses, sent through the registry', () => {
  it('goes out once more without its images on every protocol, each with its left-out line', async () => {
    const { url, bodies } = await service(carriesImage);
    for (const protocol of PROTOCOLS) {
      bodies.length = 0;
      const out = await ask(url, protocol, [withPicture]);
      expect(out.attempts.map((a) => a.status), protocol).toEqual([400, 200]);
      expect(bodies.map(carriesImage), protocol).toEqual([true, false]);
      expect(bodies[1], protocol).toContain(imageLeftOut(picture.handle));
    }
  });

  it('is not sent again when its only images are older than the newest delivered batch, which no client attaches: one request', async () => {
    const { url, bodies } = await service(() => true);
    for (const protocol of PROTOCOLS) {
      bodies.length = 0;
      await expect(ask(url, protocol, [withPicture, message('assistant', '看到了'), message('user', '再看一眼')]), protocol).rejects.toMatchObject({ status: 400 });
      expect(bodies.map(carriesImage), protocol).toEqual([false]);
    }
  });
});
