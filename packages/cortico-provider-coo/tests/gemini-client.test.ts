import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { GenerationError, type GenerateOptions } from 'cortico/core/generation.ts';
import { RESERVED_FRAME_NAMES } from 'cortico/core/loop.ts';
import { nullLogger } from 'cortico/core/util.ts';
import { functionResult, message, responseRecords, type ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { imageLeftOut } from 'cortico/providers/transport/image-fallback.ts';
import COO from '../src/index.ts';
import { INLINE_MAX_CHARS, type GeminiInput, type GeminiPart } from '../src/gemini/wire.ts';

const request = { model: 'fixture' };
const rawBudget = INLINE_MAX_CHARS * 3 / 4;
const screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const stream = { onEvent: () => {} };
const [frameName] = RESERVED_FRAME_NAMES;

const blob = (handle: string, mime: string) => ({ handle, mime, fallbackText: handle });
const input = (handle: string, mime = 'application/pdf') => message('user', handle, { blobs: [blob(handle, mime)] });
const digest = (data: string) => createHash('sha256').update(data).digest('hex');

function fixture(bytes: Record<string, Buffer>, repeatedResponseId?: string) {
  const requests: Array<Array<{ role: string; part: GeminiPart }>> = [];
  let enabled = true;
  type Reply = 'rejected' | 'refused' | 'partial' | 'empty' | 'reserved';
  let nextResponse: { kind: Reply; received?: () => void } | undefined;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const { contents } = JSON.parse(String(init.body)) as GeminiInput;
    requests.push(contents.flatMap(({ role, parts }) => parts.map(part => ({
      role,
      part: part.inlineData ? { inlineData: { ...part.inlineData, data: digest(part.inlineData.data) } } : part,
    }))));
    const replyOverride = nextResponse;
    nextResponse = undefined;
    replyOverride?.received?.();
    const kind = replyOverride?.kind;
    if (kind === 'rejected' || kind === 'refused')
      return new Response('Fixture rejected the request', { status: kind === 'refused' ? 400 : 422 });
    const tool = { functionCall: { name: kind === 'reserved' ? frameName : 'capture_screen', id: 'capture', args: {} } };
    const parts = kind === 'partial' ? [{ text: 'Partial model output' }]
      : kind === 'empty' ? [] : [tool];
    const reply = {
      responseId: repeatedResponseId ?? `fixture-response-${requests.length}`,
      candidates: [{ content: { role: 'model', parts }, ...(kind === 'partial' ? {} : { finishReason: 'STOP' }) }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 1, totalTokenCount: 21 },
    };
    if (url.includes(':streamGenerateContent')) return new Response(`data: ${JSON.stringify(reply)}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
    return Response.json(reply);
  });
  const entry = {
    kind: 'coo', baseUrl: 'https://fixture.invalid', secret: 'fixture-key',
    options: { protocol: 'gemini' }, spec: { ...request, thinking: false }, multimodal: true,
  };
  const { client } = COO.create('fixture', entry, {
    currentEntry: () => ({ ...entry, multimodal: enabled }),
    secret: () => 'fixture-key', keepThinking: () => true,
    readBlob: handle => bytes[handle] ?? null, log: nullLogger(), stateDir: '',
  });
  const respond = (sessionId: string, context: readonly ContextRecord[], options?: Pick<GenerateOptions, 'onEvent' | 'signal'>) =>
    client.respond(request, { ...options, sessionId, context });
  const attachments = (index: number) => requests[index].flatMap(({ part }) => part.inlineData ? [part.inlineData.data] : []);
  const reference = (name: string) => digest(bytes[name].toString('base64'));
  return {
    respond, requests, attachments, reference,
    replyNext: (kind: Reply, received?: () => void) => { nextResponse = { kind, received }; },
    setMultimodal: (value: boolean) => { enabled = value; },
  };
}

afterEach(() => vi.unstubAllGlobals());

it('keeps the earliest attachment when a new screenshot request succeeds after a rejection', async () => {
  const { respond, requests, attachments, reference, replyNext } = fixture({
    earlier: Buffer.alloc(rawBudget / 2, 0x20),
    later: Buffer.alloc(rawBudget / 2, 0x80),
    largeShot: Buffer.alloc(rawBudget, 0x25),
    shot: screenshot,
  });
  const context = [input('earlier'), message('assistant', 'Already saw the earlier PDF'), input('later')];
  const prior = await respond('session', context, stream);
  expect(attachments(0)).toEqual([reference('earlier'), reference('later')]);

  const continuation = [...context, ...responseRecords(prior.response, prior.origin)];
  const toolShot = (handle: string) => functionResult('capture', 'New screenshot', { blobs: [blob(handle, 'image/png')] });
  replyNext('rejected');
  await expect(respond('session', [...continuation, toolShot('largeShot')], stream)).rejects.toMatchObject({ status: 422 });
  expect(attachments(1)).toEqual([reference('largeShot')]);
  await respond('session', [...continuation, toolShot('shot')], stream);

  expect(attachments(2)).toEqual([reference('earlier'), reference('shot')]);
  const prefix = requests[0].slice(0, -1);
  expect(requests[2].slice(0, prefix.length)).toEqual(prefix);
});

it('keeps a previously skipped PDF out after another session and a new delivery', async () => {
  const { respond, attachments, reference } = fixture({
    earlier: Buffer.alloc(rawBudget * 2 / 3, 0x20),
    oldImage: Buffer.alloc(rawBudget * 2 / 3, 0x80),
    shot: screenshot,
  }, 'shared-response-id');
  const earlier = input('earlier');
  const context = [earlier, message('assistant', 'After the earlier delivery'), input('oldImage', 'image/png')];
  const prior = await respond('one', context);
  expect(attachments(0)).toEqual([reference('oldImage')]);
  await respond('two', [earlier]);
  expect(attachments(1)).toEqual([reference('earlier')]);

  const continuation = [...context, ...responseRecords(prior.response, prior.origin)];
  const screenshotInput = input('shot', 'image/png');
  await respond('one', [...continuation, screenshotInput]);
  expect(attachments(2)).toEqual([reference('oldImage'), reference('shot')]);

  // A session without a matching response uses the stateless budget policy.
  await respond('three', [...continuation, screenshotInput]);
  expect(attachments(3)).toEqual([reference('earlier'), reference('shot')]);
});

it('keeps a pending screenshot across partial output and a new delivery before retry', async () => {
  const { respond, attachments, reference, replyNext } = fixture({
    earlier: Buffer.alloc(rawBudget / 2, 0x20),
    later: Buffer.alloc(rawBudget / 2, 0x80),
    shot: screenshot,
  });
  const context = [input('earlier'), message('assistant', 'Already saw the earlier PDF'), input('later')];
  const prior = await respond('session', context);
  await respond('session', [context[2]]);

  const continuation = [
    ...context,
    ...responseRecords(prior.response, prior.origin),
    functionResult('capture', 'Pending screenshot', { blobs: [blob('shot', 'image/png')] }),
  ];
  replyNext('partial');
  const failure = await respond('session', continuation, stream).catch((error: unknown) => error);
  assert(failure instanceof GenerationError && failure.partial);
  expect(failure.partial.status).toBe('in_progress');
  await respond('session', [
    ...continuation, ...responseRecords(failure.partial, failure.origin), message('user', 'New event during backoff'),
  ]);
  expect(attachments(3)).toEqual([reference('earlier'), reference('shot')]);
});

it.each(['empty', 'reserved'] as const)('reuses a text-only selection after an accepted %s reply leaves no output in session history', async (reply) => {
  const { respond, attachments, reference, replyNext, setMultimodal } = fixture({ earlier: Buffer.from('PDF'), shot: screenshot });
  const context = [input('earlier')];
  const prior = await respond('session', context);
  expect(attachments(0)).toEqual([reference('earlier')]);
  const continuation = [
    ...context,
    ...responseRecords(prior.response, prior.origin),
    functionResult('capture', 'No image'),
  ];
  setMultimodal(false);
  replyNext(reply);
  await respond('session', continuation);

  setMultimodal(true);
  await respond('session', [...continuation, input('shot', 'image/png')]);
  expect(attachments(2)).toEqual([reference('shot')]);
});

it('keeps the accepted attachment selection when a later response is discarded', async () => {
  const { respond, attachments, reference, replyNext, setMultimodal } = fixture({ earlier: Buffer.from('PDF'), shot: screenshot });
  const context = [input('earlier')];
  const prior = await respond('session', context);
  const continuation = [...context, ...responseRecords(prior.response, prior.origin), functionResult('capture', 'No image')];
  const abort = new AbortController();
  setMultimodal(false);
  replyNext('empty', () => abort.abort());
  const discarded = await respond('session', continuation, { signal: abort.signal });
  expect(discarded.attempts.map(attempt => attempt.outcome)).toEqual(['discarded']);

  setMultimodal(true);
  await respond('session', [...continuation, input('shot', 'image/png')]);
  expect(attachments(2)).toEqual([reference('earlier'), reference('shot')]);
});

it('replays an earlier image and retries a refusal using only the images actually sent', async () => {
  const { respond, requests, attachments, reference, replyNext } = fixture({
    earlier: Buffer.from('Earlier image'),
    shot: screenshot,
    oversize: Buffer.alloc(rawBudget + 1),
  });
  const previousImage = input('earlier', 'image/png');
  const prior = await respond('session', [previousImage]);
  replyNext('refused');
  const retried = await respond('session', [
    previousImage, ...responseRecords(prior.response, prior.origin), functionResult('capture', 'No image'),
    input('shot', 'image/png'), input('oversize', 'image/png'),
  ]);

  expect(attachments(1)).toEqual([reference('earlier'), reference('shot')]);
  expect(attachments(2)).toEqual([]);
  expect(retried.attempts.map(attempt => attempt.status)).toEqual([400, 200]);
  const retry = JSON.stringify(requests[2]);
  expect(retry).toContain(imageLeftOut('earlier'));
  expect(retry).toContain(imageLeftOut('shot'));
  expect(retry).not.toContain(imageLeftOut('oversize'));
});
