import { describe, expect, it } from 'vitest';
import { functionCall, functionResult, message, record, type ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { ClaudeResponseAssembly, MISSING_RESULT, claudeInput, claudeRequest } from '../src/anthropic/wire.ts';

const origin = { instance: 'c', module: 'claude', model: 'claude-haiku-5-5', compatibilityDomain: 'https://api.anthropic.com' };
const request = { model: origin.model };

function turn(responseId: string, ...items: ContextRecord[]): ContextRecord[] {
  return items.map(entry => ({ ...entry, context: { ...entry.context, responseId, origin } }));
}

describe('claudeInput', () => {
  // The API rejects a tool_use without a result in the next user message and a result without its call.
  it('answers every call in the next user turn, results first, and replays a stray result as text', () => {
    const context = [
      message('user', 'hi'),
      ...turn('r1', functionCall('c1', 'look', '{"at":"sky"}'), functionCall('c2', 'say', '{}')),
      message('user', 'event'), functionResult('c2', 'said'),
      functionResult('gone', 'old result'),
    ];
    const { messages } = claudeInput(request, { context, origin });
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    const content = messages[2].content as unknown as Array<Record<string, unknown>>;
    expect(content.map(block => block.type === 'tool_result' ? `result:${block.tool_use_id}` : `text:${block.text}`)).toEqual([
      'result:c1', 'result:c2', 'text:[tool result gone]\nold result', 'text:event',
    ]);
    expect(content[0]).toMatchObject({ content: MISSING_RESULT, is_error: true });
  });

  // A signature from another endpoint or model would be rejected; with thinking off the API takes none back.
  it('sends thinking back only to the endpoint and model that wrote it, and only with thinking on', () => {
    const thought = (signature: string, from = origin) => ({ ...record({ type: 'reasoning', id: 'rs', summary: [], content: [], encrypted_content: signature }), context: { responseId: signature, origin: from } });
    const context = [
      message('user', 'hi'),
      thought('MINE'), { ...message('assistant', 'a'), context: { responseId: 'MINE', origin } },
      message('user', 'next'),
      thought('FOREIGN', { ...origin, model: 'claude-opus-5-5' }), { ...message('assistant', 'b'), context: { responseId: 'FOREIGN', origin } },
      message('user', 'last'),
    ];
    const on = claudeRequest(request, { context, origin, nativeSpec: { model: origin.model, thinking: true } });
    const blocks = on.params.messages.filter(m => m.role === 'assistant').map(m => (m.content as Array<{ type: string }>).map(b => b.type));
    expect(blocks).toEqual([['thinking', 'text'], ['text']]);
    expect(on.betas).toContain('thinking-binding-controls-2026-08-01');
    const off = claudeRequest(request, { context, origin, nativeSpec: { model: origin.model, thinking: false } });
    expect(off.params.thinking).toEqual({ type: 'disabled' });
    expect(off.params.messages.flatMap(m => (m.content as Array<{ type: string }>)).some(b => b.type === 'thinking')).toBe(false);
  });
});

describe('ClaudeResponseAssembly', () => {
  // Core runs a function call as soon as its Item closes, so a cut-short input must never close completed.
  it('closes a tool call at its block stop once the input parses, and leaves a cut-short one incomplete', () => {
    const events: StreamEvent[] = [];
    const emit = (event: StreamEvent) => events.push(event);
    const assembly = new ClaudeResponseAssembly(request);
    assembly.feed({ type: 'message_start', message: { id: 'msg_1', model: origin.model, usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 1 } } }, emit);
    assembly.feed({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'say', input: {} } }, emit);
    assembly.feed({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"text":"hi"}' } }, emit);
    assembly.feed({ type: 'content_block_stop', index: 0 }, emit);
    const closedEarly = events.findIndex(event => event.type === 'response.output_item.done');
    assembly.feed({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_2', name: 'say', input: {} } }, emit);
    assembly.feed({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"text":"cu' } }, emit);
    assembly.feed({ type: 'content_block_stop', index: 1 }, emit);
    assembly.feed({ type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 40 } }, emit);
    const response = assembly.finish(emit);
    expect(closedEarly).toBeGreaterThan(-1);
    expect(response.status).toBe('incomplete');
    expect(response.output.map(item => (item as { status?: string }).status)).toEqual(['completed', 'incomplete']);
    expect(assembly.meters()).toMatchObject({ input: 100, cachedInput: 90, uncachedInput: 10, output: 40, reasoning: 0 });
  });
});
