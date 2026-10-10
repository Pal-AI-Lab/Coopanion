import { mkdtempSync, rmSync } from 'node:fs';
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
import type { Persona, SessionDecl } from 'cortico/core/types.ts';
import { estimateMessagesTokens, nullLogger } from 'cortico/core/util.ts';
import { createResponse, type Request, type StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import COO from '../src/index.ts';

const scratch: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function client(baseUrl = 'https://api.minimax.cn/v1', model = 'MiniMax-M3') {
  const dir = mkdtempSync(join(tmpdir(), 'coo-responses-'));
  scratch.push(dir);
  const spec = { model, thinking: true, reasoningEffort: 'high' };
  const instance = COO.create('fixture', { kind: 'coo', baseUrl, secret: 'KEY', spec }, {
    stateDir: dir, secret: () => 'test-key', readBlob: () => null,
    keepThinking: () => true, log: nullLogger(),
  } as never);
  return { client: instance.client, dir, spec };
}

const say = { type: 'function_call', id: 'f1', call_id: 'c1', name: 'say', arguments: '{"text":"hello"}', status: 'completed' } as const;
const end = { type: 'function_call', id: 'f2', call_id: 'c2', name: 'end_turn', arguments: '{}', status: 'completed' } as const;
const reply = {
  ...createResponse('r1', { model: 'fixture' }), status: 'completed', output: [say, end], service_tier: 'standard',
  usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 2 } },
};

/** The terminal resource has full arguments; the stream can close a call early or revise it later. */
function sse(fault: 'late-arguments' | 'terminal-revision' | 'none'): string {
  const events: object[] = [{ type: 'response.created', response: { ...reply, status: 'in_progress', output: [], usage: null } }];
  for (const [index, item] of [say, end].entries()) {
    const at = { output_index: index, item_id: item.id };
    const arguments_ = fault === 'late-arguments' && index === 0 ? '' : item.arguments;
    events.push(
      { type: 'response.output_item.added', output_index: index, item: { ...item, status: 'in_progress', arguments: '' } },
      { type: 'response.function_call_arguments.delta', ...at, delta: arguments_ },
      { type: 'response.function_call_arguments.done', ...at, arguments: arguments_ },
      { type: 'response.output_item.done', output_index: index, item: { ...item, arguments: arguments_ } },
    );
    if (fault === 'late-arguments' && index === 0) events.push({ type: 'response.function_call_arguments.delta', ...at, delta: item.arguments });
  }
  events.push({ type: 'response.completed', response: {
    ...reply, output: [fault === 'terminal-revision' ? { ...say, arguments: '{"text": "hello"}' } : say, end],
  } });
  return events.map((event, sequence_number) => `data: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join('');
}

describe('MiniMax Responses fallback', () => {
  it.each([
    ['https://api.minimax.cn/v1', 'MiniMax-M3', 'late-arguments'],
    ['https://api.minimax.io/v1', 'MiniMax-M2.7', 'terminal-revision'],
  ] as const)('executes one reply and ends the turn without resubmitting on %s / %s', async (baseUrl, model, fault) => {
    const provider = client(baseUrl, model);
    let requests = 0;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requests++;
      const streaming = JSON.parse(String(init.body)).stream;
      return new Response(streaming ? sse(fault) : JSON.stringify(reply), {
        headers: { 'content-type': streaming ? 'text/event-stream' : 'application/json' },
      });
    });
    const spoken: unknown[] = [];
    let ended = 0;
    const decl: SessionDecl = {
      id: 'main', label: 'main', persistent: true, receivesEvents: true,
      rounds: () => ({ soft: 4, hard: 6 }), outputTap: { onEvent() {}, externalizes: () => false },
      tools: () => [
        { name: 'say', description: 'Speak', tags: [], parameters: { type: 'object', properties: { text: { type: 'string' } } }, handler: async args => { spoken.push(args.text); return 'spoken'; } },
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
      expect(spoken).toEqual(['hello']);
      expect(ended).toBe(1);
      expect(requests).toBe(1);
      expect(session.records.filter(r => r.item.type === 'function_call_output').map(r => r.item)).toMatchObject([
        { call_id: say.call_id, output: 'spoken' }, { call_id: end.call_id, output: 'ended' },
      ]);
    } finally { loop.stop(); await running; }
  });

  it('retains usage and request options when a stream observer is supplied', async () => {
    const provider = client();
    const controller = new AbortController();
    const observed: StreamEvent[] = [];
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      expect(init.signal?.aborted).toBe(false);
      return new Response(JSON.stringify(reply), { headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' } });
    });
    const request = { model: provider.spec.model, input: [], reasoning: { effort: 'max' } } as unknown as Request;
    const options = { onEvent: (event: StreamEvent) => observed.push(event), signal: controller.signal, sessionId: 'session-1' };
    const result = await provider.client.respond(request, options);
    expect(result.response.output).toEqual([say, end]);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ outcome: 'completed', requestId: 'req-1', serviceTier: 'standard', meters: { input: 12, output: 8, cachedInput: 4, reasoning: 2 } });
    expect(bodies).toEqual([expect.objectContaining({ stream: false, store: false, reasoning: { effort: 'high' }, prompt_cache_key: 'session-1' })]);
    expect(observed).toEqual([]);
    expect(options.onEvent).toBeTypeOf('function');
    controller.abort(new Error('cancelled'));
    await expect(provider.client.respond(request, options)).rejects.toThrow('cancelled');
    expect(bodies).toHaveLength(1);
  });

  it('cancels an in-flight fallback request without exposing tools', async () => {
    const provider = client();
    const controller = new AbortController();
    const events: StreamEvent[] = [];
    let started = false;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      started = true;
    }));
    const pending = provider.client.respond({ model: provider.spec.model, input: [] }, {
      signal: controller.signal, onEvent: event => events.push(event),
    });
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(started).toBe(true));
    controller.abort(new Error('cancelled'));
    await rejected;
    expect(events).toEqual([]);
  });

  it('keeps incomplete tool calls incomplete and exposes no eager calls', async () => {
    const provider = client();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      ...reply, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ ...say, status: 'incomplete', arguments: '{"text":' }],
    })));
    const events: StreamEvent[] = [];
    const result = await provider.client.respond({ model: provider.spec.model, input: [] }, { onEvent: event => events.push(event) });
    expect(result.response).toMatchObject({ status: 'incomplete', output: [{ type: 'function_call', status: 'incomplete', arguments: '{"text":' }] });
    expect(events).toEqual([]);
  });

  it('keeps native streaming and strict validation for other Responses services', async () => {
    const provider = client('https://api.openai.com/v1', 'fixture');
    let fault: Parameters<typeof sse>[0] = 'none';
    vi.stubGlobal('fetch', async () => new Response(sse(fault), { headers: { 'content-type': 'text/event-stream' } }));
    const events: StreamEvent[] = [];
    const request = { model: provider.spec.model, input: [] };
    await provider.client.respond(request, { onEvent: event => events.push(event) });
    expect(events.filter(event => event.type === 'response.output_item.done')).toHaveLength(2);
    for (fault of ['late-arguments', 'terminal-revision'] as const) {
      await expect(provider.client.respond(request, { onEvent() {} })).rejects.toBeInstanceOf(GenerationError);
    }
  });
});
