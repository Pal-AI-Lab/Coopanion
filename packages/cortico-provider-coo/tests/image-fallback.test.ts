/**
 * Requests the model service rejects for their images, against a local fake service on every
 * protocol: it answers 400 to any request whose body carries the image's bytes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerationError } from 'cortico/core/generation.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { BlobRef, LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { message } from 'cortico/protocol/open-responses/context.ts';
import { blobLine } from 'cortico/core/blobs.ts';
import COO from '../src/index.ts';
import { PROTOCOLS, type Protocol } from '../src/vendors.ts';
import { imageLeftOut } from '../src/model-text.ts';

const IMAGE = Buffer.from('an image the service cannot decode');
const IMAGE_DATA = IMAGE.toString('base64');
const picture: BlobRef = { handle: 'log:0123456789abcdef0123.png', mime: 'image/png', name: 'big.png', fallbackText: 'Image' };
const context = [message('user', `看这张\n${blobLine(picture)}`, { blobs: [picture] })];

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

/** A fake service; `refuse` picks the requests it answers 400 with `error`. */
async function service(refuse: (body: string) => boolean, error = 'unsupported image'): Promise<{ url: string; bodies: string[] }> {
  const bodies: string[] = [];
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    bodies.push(body);
    if (refuse(body)) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: error } }));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(REPLIES[(req.url ?? '').split('?')[0]!] ?? {}));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`, bodies };
}

const carriesImage = (body: string) => body.includes(IMAGE_DATA);

function endpoint(url: string, protocol: Protocol, patch: Partial<LLMProviderEntry> = {}) {
  const entry: LLMProviderEntry = { kind: 'coo', baseUrl: url, secret: 'KEY', options: { protocol }, spec: { model: 'm', thinking: false }, multimodal: true, ...patch };
  return COO.create('x', entry, {
    stateDir: mkdtempSync(join(tmpdir(), 'coo-image-')), secret: () => 'sk-test', keepThinking: () => true, log: nullLogger(),
    readBlob: (handle: string) => (handle === picture.handle ? IMAGE : null),
  } as never).client;
}

const ask = (client: ReturnType<typeof endpoint>) => client.respond({ model: 'm', input: [] } as unknown as Request, { context });

describe('a request the model service rejects for its images', () => {
  it('is sent once more without them on every protocol, and later requests leave them out: one request each', async () => {
    const { url, bodies } = await service(carriesImage);
    for (const protocol of PROTOCOLS) {
      bodies.length = 0;
      const client = endpoint(url, protocol);
      const first = await ask(client);
      expect(first.attempts.map((a) => a.status), protocol).toEqual([400, 200]);
      expect(bodies.map(carriesImage), protocol).toEqual([true, false]);
      expect(bodies[1], protocol).toContain(imageLeftOut(picture.handle));
      await ask(client);
      expect(bodies.map(carriesImage), protocol).toEqual([true, false, false]);
      expect(bodies[2], protocol).toBe(bodies[1]);
    }
  });

  it('keeps both attempts on the error when the request without the images is refused too, and sends the images next time', async () => {
    const { url, bodies } = await service(() => true, 'invalid parameter');
    const client = endpoint(url, 'responses');
    const error = await ask(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect((error as GenerationError).attempts.map((a) => a.status)).toEqual([400, 400]);
    await ask(client).catch(() => {});
    expect(bodies.map(carriesImage)).toEqual([true, false, true, false]);
  });

  it('is not sent again when it is a context overflow, which Core hands off: one request', async () => {
    const { url, bodies } = await service(carriesImage, 'context_length_exceeded');
    await expect(ask(endpoint(url, 'responses'))).rejects.toMatchObject({ status: 400 });
    expect(bodies).toHaveLength(1);
  });

  it('is not sent again when the endpoint sends no images: one request', async () => {
    const { url, bodies } = await service(() => true);
    await expect(ask(endpoint(url, 'responses', { multimodal: false }))).rejects.toMatchObject({ status: 400 });
    expect(bodies).toHaveLength(1);
  });
});
