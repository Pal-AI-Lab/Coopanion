import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WakeBus } from 'cortico/core/bus.ts';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import { JsonlEventStore } from 'cortico/core/event-store.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import { MainLoop } from 'cortico/core/loop.ts';
import { SessionLog } from 'cortico/core/session.ts';
import { CoreState } from 'cortico/core/state.ts';
import type { LLMProviderEntry, Persona, SessionDecl } from 'cortico/core/types.ts';
import { estimateMessagesTokens, nullLogger } from 'cortico/core/util.ts';
import { createResponse, type StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { ResponseAccumulator, ResponseProtocolError } from 'cortico/protocol/open-responses/stream.ts';
import { NativeResponseAssembly, type ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import COO from '../src/index.ts';
import { CompatibleResponsesAssembly } from '../src/responses-stream.ts';

type Event = Record<string, any>;
const scratch: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const reasoning = { type: 'reasoning', id: 'reason-1', status: 'completed', summary: [], encrypted_content: null,
  content: [{ type: 'reasoning_text', text: 'Check the request.' }] };
const message = { type: 'message', id: 'message-1', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'Ready.', annotations: [], logprobs: [] }] };
const say = { type: 'function_call', id: 'function-1', call_id: 'call-1', name: 'say', arguments: '{"text":"hello","count":1}', status: 'completed' };
const end = { type: 'function_call', id: 'function-2', call_id: 'call-2', name: 'end_turn', arguments: '{}', status: 'completed' };
const output = [reasoning, message, say, end];
const resource = { ...createResponse('response-1', { model: 'fixture' }), status: 'completed', output, service_tier: 'standard',
  usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 2 } } };

/** Synthetic SSE covering reasoning, text and two calls; all identities and content are fixtures. */
function fixture(compatible = true): Event[] {
  const initial = { ...resource, status: 'in_progress', output: [], usage: null };
  const events: Event[] = [
    { type: 'response.created', response: initial },
    { type: 'response.in_progress', response: initial },
  ];
  for (const [index, item] of [reasoning, message].entries()) {
    const at = { output_index: index, item_id: item.id, content_index: 0 };
    const part = item.content[0];
    const donePart = compatible && index === 1 ? { ...part, logprobs: null } : part;
    const partType = compatible && index === 0 ? 'response.reasoning_part' : 'response.content_part';
    const textType = index === 0 ? 'response.reasoning_text' : 'response.output_text';
    events.push(
      { type: 'response.output_item.added', output_index: index, item: { ...item, status: 'in_progress', content: index === 0 ? null : [] } },
      { type: `${partType}.added`, ...at, part: { ...part, text: '' } },
      { type: `${textType}.delta`, ...at, delta: part.text.slice(0, 3), ...(index === 1 ? { logprobs: [] } : {}) },
      { type: `${textType}.delta`, ...at, delta: part.text.slice(3), ...(index === 1 ? { logprobs: [] } : {}) },
      { type: `${textType}.done`, ...at, text: part.text, ...(index === 1 ? { logprobs: [] } : {}) },
      { type: `${partType}.done`, ...at, part: donePart },
      { type: 'response.output_item.done', output_index: index, item: { ...item, content: compatible && index === 0 ? null : [donePart] } },
    );
  }
  for (const [index, item] of [say, end].entries()) {
    const at = { output_index: index + 2, item_id: item.id };
    const arguments_ = compatible ? JSON.stringify(JSON.parse(item.arguments), null, 2) : item.arguments;
    events.push(
      { type: 'response.output_item.added', output_index: at.output_index, item: { ...item, status: 'in_progress', arguments: '' } },
      { type: 'response.function_call_arguments.delta', ...at, delta: item.arguments.slice(0, 2) },
      { type: 'response.function_call_arguments.delta', ...at, delta: item.arguments.slice(2) },
      { type: 'response.function_call_arguments.done', ...at, arguments: arguments_ },
      { type: 'response.output_item.done', output_index: at.output_index, item: { ...item, arguments: arguments_ } },
    );
  }
  const terminal = compatible ? output.map((item, index) => ({ ...item, id: `final-${index}`,
    ...(item.type === 'reasoning' ? { content: [], status: null } : {}),
    ...(item.type === 'message' ? { content: [{ ...message.content[0], logprobs: null }] } : {}),
    ...(item.type === 'function_call' ? { call_id: `final-call-${index}`, arguments: JSON.stringify(JSON.parse((item as typeof say).arguments), null, 2) } : {}),
  })) : output;
  events.push({ type: 'response.completed', response: { ...resource, output: terminal } });
  return events.map((event, sequence_number) => structuredClone({ ...event, sequence_number }));
}

const sse = (events: Event[]) => events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
const at = (events: Event[], type: string, index?: number) => events.find(event => event.type === type && (index === undefined || event.output_index === index))!;
const final = (events: Event[]) => events.at(-1)!.response;

const gatewaySse = readFileSync(new URL('./fixtures/gateway-responses.sse', import.meta.url), 'utf8');
function gatewayFixture(namespaced: boolean): Event[] {
  const events: Event[] = gatewaySse.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  if (namespaced) {
    for (const event of events) if (event.item?.type === 'function_call') event.item.namespace = null;
    for (const item of final(events).output) if (item.type === 'function_call') item.namespace = null;
  }
  return events;
}

function repeatedCalls(): Event[] {
  const events = fixture();
  const repeated = events.filter(event => event.output_index === 2).map(event => ({
    ...structuredClone(event), output_index: 3,
    ...(event.item_id ? { item_id: 'function-repeat' } : {}),
    ...(event.item ? { item: { ...event.item, id: 'function-repeat', call_id: 'call-repeat' } } : {}),
  }));
  const insert = events.indexOf(at(events, 'response.output_item.added', 3));
  for (const event of events) if (event.output_index === 3) event.output_index = 4;
  events.splice(insert, 0, ...repeated);
  final(events).output.splice(3, 0, { ...final(events).output[2], id: 'final-repeat', call_id: 'final-call-repeat' });
  return events.map((event, sequence_number) => ({ ...event, sequence_number }));
}

function client(normalizeResponses: boolean | undefined = true) {
  const dir = mkdtempSync(join(tmpdir(), 'coo-stream-'));
  scratch.push(dir);
  const spec = { model: 'fixture', thinking: true, reasoningEffort: 'high' };
  const entry: LLMProviderEntry = { kind: 'coo', baseUrl: 'https://gateway.example/v1', spec, options: { normalizeResponses } };
  const instance = COO.create('fixture', entry, {
    stateDir: dir, secret: () => undefined, readBlob: () => null, keepThinking: () => true, log: nullLogger(),
  } as never);
  return { client: instance.client, dir, spec, entry };
}

function assemble(events: Event[], assembly: ResponseAssembly = new CompatibleResponsesAssembly()) {
  const checked: StreamEvent[] = [];
  for (const event of events) assembly.feed(event, event => checked.push(event));
  return { response: assembly.finish(event => checked.push(event)), checked };
}

async function runCore(provider: ReturnType<typeof client>) {
  const spoken: unknown[] = [];
  let ended = 0;
  const decl: SessionDecl = {
    id: 'main', label: 'main', persistent: true, receivesEvents: true,
    rounds: () => ({ soft: 4, hard: 6 }), outputTap: { onEvent() {}, externalizes: () => false },
    tools: () => [
      { name: 'say', description: 'Speak', tags: [], parameters: { type: 'object', properties: { text: { type: 'string' }, count: { type: 'number' } } }, handler: async args => { spoken.push(args.text); return 'spoken'; } },
      { name: 'end_turn', description: 'End', tags: [], parameters: { type: 'object', properties: {} }, endsTurn: true, barrierAfter: true, handler: async () => { ended++; return 'ended'; } },
    ],
  };
  const persona: Persona = {
    systemSegments: async () => [], memoryDir: provider.dir,
    blobs: { put: () => { throw new Error('unused'); }, get: () => null, list: () => [] },
    attach() {}, declareSessions: () => [decl], onIdle: () => loop.stop(),
  };
  const cfg = structuredClone(CORE_DEFAULTS);
  const session = new SessionLog(provider.dir);
  const state = new CoreState(provider.dir);
  state.load();
  const loop = new MainLoop({
    cfg, llm: provider.client, persona, decl, spec: () => provider.spec,
    context: { hardTokens: () => null, estimateTokens: estimateMessagesTokens, contextOverflow: () => false },
    blobs: { intern: () => undefined }, worlds: { all: () => [], visible: () => [] },
    bus: new WakeBus(cfg.batching), session, state,
    store: new JsonlEventStore({ dataDir: provider.dir, run: 'fixture' }), log: nullLogger(),
    resubmit: { maxConsecutive: 2, maxPerBatch: 4, backoffMs: [0, 0] },
  });
  const running = loop.run();
  try {
    loop.injectInternal('hello', 'notice');
    await running;
    return { spoken, ended, session };
  } finally { loop.stop(); await running; }
}

describe('endpoint Responses stream compatibility', () => {
  it('reproduces the strict failure and emits a stream accepted by the unchanged accumulator', () => {
    const events = fixture();
    const original = structuredClone(events);
    expect(() => assemble(events, new NativeResponseAssembly())).toThrow('Unknown Open Responses event type');
    const { response, checked } = assemble(events);
    const strict = new ResponseAccumulator();
    checked.forEach(event => strict.accept(event));
    expect(strict.finish()).toEqual(response);
    expect(response.output).toEqual(output);
    expect(events).toEqual(original);
  });

  it('preserves conformant streams', () => {
    const events = fixture(false);
    const native = assemble(events, new NativeResponseAssembly());
    expect(assemble(events)).toEqual(native);
  });

  it.each([false, true])('accepts the gateway fixture with namespaced calls: %s', async namespaced => {
    const provider = client();
    vi.stubGlobal('fetch', async () => new Response(namespaced ? sse(gatewayFixture(true)) : gatewaySse));
    const strict = new ResponseAccumulator();
    const result = await provider.client.respond({ model: 'fixture', input: [] }, { onEvent: event => strict.accept(event) });
    const calls = [say, end].map(item => ({ ...item, ...(namespaced ? { namespace: null } : {}) }));
    expect(result.response.output).toEqual([reasoning, { ...message, summary: [] }, ...calls]);
    expect(strict.finish()).toEqual(result.response);
  });

  it('retains streamed extension fields that the terminal item omits', () => {
    const events = fixture();
    at(events, 'response.output_item.done', 1).item.summary = [];
    at(events, 'response.output_item.done', 1).item.trace = { tokens: 3 };
    at(events, 'response.output_item.done', 1).item.namespace = 'display';
    const { response, checked } = assemble(events);
    expect(response.output[1]).toEqual({ ...message, summary: [], trace: { tokens: 3 }, namespace: 'display' });
    const strict = new ResponseAccumulator();
    checked.forEach(event => strict.accept(event));
    expect(strict.finish()).toEqual(response);
  });

  it.each([
    [0, 'type'], [0, 'content'], [0, 'summary'], [0, 'encrypted_content'], [0, 'status'],
    [1, 'type'], [1, 'role'], [1, 'content'], [1, 'status'],
    [2, 'type'], [2, 'name'], [2, 'arguments'], [2, 'status'],
  ] as const)('rejects a missing defined field on output %s: %s', (index, field) => {
    const events = fixture();
    delete final(events).output[index][field];
    expect(() => assemble(events)).toThrow(ResponseProtocolError);
  });

  it.each([[1, 'phase', 'final_answer'], [2, 'namespace', 'tools']] as const)('rejects omission of %s.%s once streamed', (index, field, value) => {
    const events = fixture();
    at(events, 'response.output_item.done', index).item[field] = value;
    expect(() => assemble(events)).toThrow(ResponseProtocolError);
  });

  it.each(['changed', 'added'])('rejects %s terminal extension fields', mode => {
    const events = fixture();
    if (mode === 'changed') at(events, 'response.output_item.done', 1).item.trace = 'before';
    final(events).output[1].trace = 'after';
    expect(() => assemble(events)).toThrow(ResponseProtocolError);
  });

  it.each([undefined, false])('leaves the strict path active when normalizeResponses is %s', async setting => {
    const provider = client(false);
    provider.entry.options = setting === undefined ? {} : { normalizeResponses: setting };
    const strict = COO.create('strict', provider.entry, {
      stateDir: provider.dir, secret: () => undefined, readBlob: () => null, keepThinking: () => true, log: nullLogger(),
    } as never).client;
    vi.stubGlobal('fetch', async () => new Response(sse(fixture())));
    await expect(strict.respond({ model: 'fixture', input: [] }, { diagnostic: true, onEvent() {} })).rejects.toThrow('Unknown Open Responses event type');
  });

  it('validates the endpoint switch before accepting its configuration', () => {
    const { entry } = client();
    expect(() => COO.validateEntry(entry, 'en')).not.toThrow();
    for (const value of ['true', 1, null]) {
      expect(() => COO.validateEntry({ ...entry, options: { normalizeResponses: value } }, 'en')).toThrow('boolean');
    }
  });

  it.each([
    ['changed tool arguments', (events: Event[]) => { final(events).output[2].arguments = '{"text":"changed","count":1}'; }],
    ['changed tool name', (events: Event[]) => { final(events).output[2].name = 'delete'; }],
    ['changed tool status', (events: Event[]) => { final(events).output[2].status = 'incomplete'; }],
    ['changed message text', (events: Event[]) => { final(events).output[1].content[0].text = 'Changed.'; }],
    ['changed reasoning text', (events: Event[]) => { final(events).output[0].content = [{ type: 'reasoning_text', text: 'Changed.' }]; }],
    ['changed reasoning status', (events: Event[]) => { final(events).output[0].status = 'incomplete'; }],
    ['reordered items with new IDs', (events: Event[]) => { const items = final(events).output; [items[2], items[3]] = [items[3], items[2]]; }],
    ['duplicate item IDs', (events: Event[]) => { final(events).output[3].id = final(events).output[2].id; }],
    ['duplicate call IDs', (events: Event[]) => { final(events).output[3].call_id = final(events).output[2].call_id; }],
    ['another streamed item ID', (events: Event[]) => { final(events).output[2].id = end.id; }],
    ['another streamed call ID', (events: Event[]) => { final(events).output[2].call_id = end.call_id; }],
    ['missing item ID', (events: Event[]) => { delete final(events).output[2].id; }],
    ['missing call ID', (events: Event[]) => { delete final(events).output[2].call_id; }],
    ['extra terminal item', (events: Event[]) => { final(events).output.push({ ...say, id: 'extra', call_id: 'extra-call' }); }],
    ['missing terminal item', (events: Event[]) => { final(events).output.pop(); }],
    ['changed response ID', (events: Event[]) => { final(events).id = 'another-response'; }],
    ['changed annotations', (events: Event[]) => { final(events).output[1].content[0].annotations = [{ type: 'url_citation', url: 'https://example.com' }]; }],
    ['nonempty logprobs', (events: Event[]) => { at(events, 'response.content_part.done', 1).part.logprobs = [{ token: 'Ready', logprob: -0.1 }]; }],
    ['changed arguments.done', (events: Event[]) => { at(events, 'response.function_call_arguments.done', 2).arguments = '{"text":"changed","count":1}'; }],
    ['changed arguments at item.done', (events: Event[]) => { at(events, 'response.output_item.done', 2).item.arguments = '{"text":"changed","count":1}'; }],
    ['changed call ID at item.done', (events: Event[]) => { at(events, 'response.output_item.done', 2).item.call_id = 'another-call'; }],
    ['duplicate streamed call ID', (events: Event[]) => {
      at(events, 'response.output_item.added', 3).item.call_id = say.call_id;
      at(events, 'response.output_item.done', 3).item.call_id = say.call_id;
    }],
    ['duplicate sequence number', (events: Event[]) => { events[4].sequence_number = events[3].sequence_number; }],
    ['event after terminal response', (events: Event[]) => { events.push({ ...events.at(-1), sequence_number: events.length }); }],
    ['missing terminal response', (events: Event[]) => { events.pop(); }],
    ['terminal revision of an unfinished call', (events: Event[]) => {
      events.splice(events.indexOf(at(events, 'response.output_item.done', 2)), 1);
      final(events).output[2] = { ...say, arguments: '{"text":"changed","count":1}' };
    }],
  ])('rejects %s without exposing output or tools', async (_name, mutate) => {
    const events = fixture();
    mutate(events);
    const provider = client();
    vi.stubGlobal('fetch', async () => new Response(sse(events)));
    const observed: StreamEvent[] = [];
    const error = await provider.client.respond({ model: 'fixture', input: [] }, { diagnostic: true, onEvent: event => observed.push(event) }).catch(error => error);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error.partial).toBeNull();
    expect(observed).toEqual([]);
  });

  it.each([
    ['{"text":"a b"}', '{"text":"ab"}'],
    ['{"value":9007199254740992}', '{"value":9007199254740993}'],
    ['{"value":1,"value":2}', '{"value":2}'],
    ['{"value":1}', '{"value":"1"}'],
    ['{"items":[1,2]}', '{"items":[2,1]}'],
  ])('rejects a semantic change from %s to %s', (streamed, completed) => {
    const events = fixture();
    const deltas = events.filter(event => event.type === 'response.function_call_arguments.delta' && event.output_index === 2);
    deltas[0].delta = streamed;
    deltas[1].delta = '';
    at(events, 'response.function_call_arguments.done', 2).arguments = completed;
    expect(() => assemble(events)).toThrow(ResponseProtocolError);
  });

  it('keeps identical calls distinct by output position and streamed identity', () => {
    const { response } = assemble(repeatedCalls());
    expect(response.output).toEqual([reasoning, message, say, { ...say, id: 'function-repeat', call_id: 'call-repeat' }, end]);
  });

  it('keeps partial output on the ordinary streaming path', async () => {
    const events = fixture(false);
    final(events).output[2].arguments = '{"text":"changed","count":1}';
    const provider = client(false);
    vi.stubGlobal('fetch', async () => new Response(sse(events)));
    const observed: StreamEvent[] = [];
    const error = await provider.client.respond({ model: 'fixture', input: [] }, { onEvent: event => observed.push(event) }).catch(error => error);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error.partial.output).toEqual(output);
    expect(observed.filter(event => event.type === 'response.output_item.done')).toHaveLength(output.length);
  });

  it('buffers output until terminal validation and retains usage and request context', async () => {
    const provider = client();
    const events = fixture();
    const observed: StreamEvent[] = [];
    const encoder = new TextEncoder();
    let waiting = false;
    let body: Record<string, unknown> | undefined;
    let finish!: () => void;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sse(events.slice(0, -1))));
          finish = () => { controller.enqueue(encoder.encode(sse(events.slice(-1)))); controller.close(); };
        },
        pull() { waiting = true; },
      }), { headers: { 'x-request-id': 'request-1' } });
    });
    const pending = provider.client.respond({ model: 'fixture', input: [] }, { sessionId: 'session-1', onEvent: event => observed.push(event) });
    await vi.waitFor(() => expect(waiting).toBe(true));
    expect(observed).toEqual([]);
    finish();
    const result = await pending;
    expect(body).toMatchObject({ stream: true, store: false, prompt_cache_key: 'session-1' });
    expect(result.response.output).toEqual(output);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ outcome: 'completed', requestId: 'request-1', serviceTier: 'standard', meters: { input: 12, output: 8, cachedInput: 4, reasoning: 2 } });
    const strict = new ResponseAccumulator();
    observed.forEach(event => strict.accept(event));
    expect(strict.finish()).toEqual(result.response);
  });

  it('discards buffered tools when the request is cancelled', async () => {
    const provider = client();
    const controller = new AbortController();
    const observed: StreamEvent[] = [];
    let waiting = false;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode(sse(fixture().slice(0, -1))));
        init.signal!.addEventListener('abort', () => stream.error(init.signal!.reason), { once: true });
      },
      pull() { waiting = true; },
    })));
    const pending = provider.client.respond({ model: 'fixture', input: [] }, { signal: controller.signal, onEvent: event => observed.push(event) });
    const rejected = pending.catch(error => error);
    await vi.waitFor(() => expect(waiting).toBe(true));
    controller.abort(new Error('cancelled'));
    expect(await rejected).toMatchObject({ name: 'GenerationError', message: expect.stringContaining('cancelled'), partial: null, attempts: [expect.objectContaining({ outcome: 'aborted' })] });
    expect(observed).toEqual([]);
  });

  it('keeps truncated calls incomplete after terminal normalization', async () => {
    const events = fixture();
    at(events, 'response.output_item.done', 3).item.status = 'incomplete';
    final(events).output[3].status = 'incomplete';
    final(events).status = 'incomplete';
    final(events).incomplete_details = { reason: 'max_output_tokens' };
    events.at(-1)!.type = 'response.incomplete';
    const provider = client();
    vi.stubGlobal('fetch', async () => new Response(sse(events)));
    const observed: StreamEvent[] = [];
    const result = await provider.client.respond({ model: 'fixture', input: [] }, { onEvent: event => observed.push(event) });
    expect(result.response).toMatchObject({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
    expect(result.response.output[3]).toEqual({ ...end, status: 'incomplete' });
    expect(observed.flatMap(event => event.type === 'response.output_item.done' && event.item?.type === 'function_call'
      ? [event.item.status] : [])).toEqual(['completed', 'incomplete']);
  });

  it.each([true, false])('omits partial output but retains failure diagnostics when streaming is %s', async streaming => {
    const events = fixture();
    final(events).status = 'failed';
    final(events).error = { code: 'server_error', message: 'Generation failed' };
    events.at(-1)!.type = 'response.failed';
    const provider = client();
    vi.stubGlobal('fetch', async () => new Response(streaming ? sse(events) : JSON.stringify(final(events)), { headers: { 'x-request-id': 'failed-request' } }));
    const observed: StreamEvent[] = [];
    const origin = { instance: 'endpoint', module: 'coo', model: 'fixture', compatibilityDomain: 'fixture' };
    const error = await provider.client.respond({ model: 'fixture', input: [] }, {
      origin, diagnostic: true, ...(streaming ? { onEvent: (event: StreamEvent) => observed.push(event) } : {}),
    }).catch(error => error);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error).toMatchObject({ message: expect.stringContaining('Generation failed'), origin, status: 0, partial: null,
      body: JSON.stringify(final(events).error), cause: expect.objectContaining({ message: 'Generation failed' }),
      attempts: [expect.objectContaining({ outcome: 'failed', requestId: 'failed-request', responseId: 'response-1',
        meters: expect.objectContaining({ input: 12, output: 8, cachedInput: 4, reasoning: 2 }) })],
    });
    expect(observed).toEqual([]);
  });

  it.each([false, true])('executes each tool once with one model request, including repeated content: %s', async repeated => {
    const provider = client();
    let requests = 0;
    vi.stubGlobal('fetch', async () => { requests++; return new Response(sse(repeated ? repeatedCalls() : fixture())); });
    const { spoken, ended, session } = await runCore(provider);
    expect(spoken).toEqual(repeated ? ['hello', 'hello'] : ['hello']);
    expect(ended).toBe(1);
    expect(requests).toBe(1);
    expect(session.records.filter(record => record.item.type === 'function_call_output').map(record => record.item)).toMatchObject([
      { call_id: say.call_id, output: 'spoken' },
      ...(repeated ? [{ call_id: 'call-repeat', output: 'spoken' }] : []),
      { call_id: end.call_id, output: 'ended' },
    ]);
  });

  it('keeps rejected buffered output out of the session and the retry context', async () => {
    const provider = client();
    const rejected = fixture();
    final(rejected).output[2].arguments = '{"text":"changed","count":1}';
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(sse(requests.length === 1 ? rejected : fixture()));
    });
    const { spoken, ended, session } = await runCore(provider);
    expect(requests).toHaveLength(2);
    const retryInput = JSON.stringify(requests[1].input);
    expect(retryInput).not.toContain('Check the request.');
    expect(retryInput).not.toContain('Ready.');
    expect(session.records.filter(record => record.item.type === 'reasoning')).toHaveLength(1);
    expect(session.records.filter(record => record.item.type === 'message' && record.item.role === 'assistant')).toHaveLength(1);
    expect(session.records.filter(record => record.item.type === 'function_call')).toHaveLength(2);
    expect(session.records.filter(record => record.item.type === 'function_call_output')).toHaveLength(2);
    expect(spoken).toEqual(['hello']);
    expect(ended).toBe(1);
  });
});
