import { describe, expect, it } from 'vitest';
import { functionCall, functionResult, message, record, type ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { BYPASS_SIGNATURE, GeminiResponseAssembly, FILLER_USER_TEXT, geminiInput, geminiMeters, geminiRequest, thinkingConfig } from '../src/gemini/wire.ts';

const origin = { instance: 'g', module: 'gemini', model: 'gemini-x-flash', compatibilityDomain: 'account-1' };
const request = { model: origin.model };

function turn(responseId: string, signature: string | null, ...items: ContextRecord[]): ContextRecord[] {
  const reasoning = signature === null ? [] : [record({ type: 'reasoning', id: `rs_${responseId}`, summary: [], encrypted_content: signature })];
  return [...reasoning, ...items].map(entry => ({ ...entry, context: { ...entry.context, responseId, origin } }));
}

describe('geminiInput', () => {
  // Gemini rejects a request whose last turn is a model turn.
  it('replays one model turn per response with its signature on the first function call, and ends on a user turn', () => {
    const context = [
      message('system', 'sys'), message('user', 'hi'),
      ...turn('r1', 'SIG-1', message('assistant', 'looking'), functionCall('c1', 'look', '{"at":"sky"}'), functionCall('c2', 'say', '{}')),
      functionResult('c1', 'blue'), functionResult('c2', 'said'),
      ...turn('r2', 'SIG-2', message('assistant', 'done')),
    ];
    const { contents, systemInstruction } = geminiInput(request, { context, origin });
    expect(systemInstruction).toEqual({ role: 'user', parts: [{ text: 'sys' }] });
    expect(contents.map(content => content.role)).toEqual(['user', 'model', 'user', 'model', 'user']);
    expect(contents[1].parts).toEqual([
      { text: 'looking' },
      { functionCall: { name: 'look', args: { at: 'sky' }, id: 'c1' }, thoughtSignature: 'SIG-1' },
      { functionCall: { name: 'say', args: {}, id: 'c2' } },
    ]);
    expect(contents[2].parts.map(part => part.functionResponse)).toEqual([
      { name: 'look', id: 'c1', response: { output: 'blue' } }, { name: 'say', id: 'c2', response: { output: 'said' } }]);
    expect(contents[3].parts).toEqual([{ text: 'done', thoughtSignature: 'SIG-2' }]);
    expect(contents[4]).toEqual({ role: 'user', parts: [{ text: FILLER_USER_TEXT }] });
  });

  it('puts the documented bypass signature on calls whose signature is foreign, dropped or absent', () => {
    const foreign = turn('r1', 'OTHER', functionCall('c1', 'look', '{}'));
    foreign.forEach(entry => { entry.context.origin = { ...origin, compatibilityDomain: 'account-2' }; });
    const cases = [
      { context: foreign, options: {} },
      { context: turn('r1', 'SIG', functionCall('c1', 'look', '{}')), options: { keepThinking: () => false } },
      { context: [functionCall('c1', 'look', '{}')], options: {} },
    ];
    for (const { context, options } of cases) {
      const { contents } = geminiInput(request, { context: [message('user', 'go'), ...context, functionResult('c1', 'ok')], origin }, options);
      expect(contents[1].parts[0].thoughtSignature).toBe(BYPASS_SIGNATURE);
    }
  });

  it('opens with a user turn when the context starts on a model turn', () => {
    const { contents } = geminiInput(request, { context: [functionCall('c1', 'look', '{}'), functionResult('c1', 'ok')], origin });
    expect(contents[0]).toEqual({ role: 'user', parts: [{ text: FILLER_USER_TEXT }] });
    expect(contents.map(content => content.role)).toEqual(['user', 'model', 'user']);
  });

  it('attaches blob media as inline data when images are enabled, and merges adjacent user turns', () => {
    const shot = { ...message('user', 'look'), context: { blobs: [{ handle: 'h1', mime: 'image/png' }] } } as ContextRecord;
    const media = { enabled: () => true, read: (handle: string) => handle === 'h1' ? Buffer.from('png') : null };
    const { contents } = geminiInput(request, { context: [message('user', 'a'), shot], origin }, { media });
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'a' }, { text: 'look' }, { inlineData: { mimeType: 'image/png', data: Buffer.from('png').toString('base64') } }] }]);
    const off = geminiInput(request, { context: [shot], origin }, { media: { ...media, enabled: () => false } });
    expect(off.contents[0].parts).toEqual([{ text: 'look' }]);
  });

  it('rejects a function output with no preceding call', () => {
    expect(() => geminiInput(request, { context: [functionResult('lost', 'x')], origin })).toThrow(/no preceding call/);
  });
});

describe('geminiRequest', () => {
  it('maps tools, tool choice, sampling and thinking', () => {
    const body = geminiRequest({ model: origin.model, temperature: 1, max_output_tokens: 900, reasoning: { effort: 'high' }, tool_choice: 'required',
      tools: [{ type: 'function', name: 'look', description: 'd', parameters: { type: 'object', oneOf: [{ required: ['at'] }] } }] },
    { context: [message('user', 'hi')] });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 900, thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' } });
    expect(body.tools).toEqual([{ functionDeclarations: [{ name: 'look', description: 'd', parametersJsonSchema: { type: 'object', oneOf: [{ required: ['at'] }] } }] }]);
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
  });

  // Gemini 3 cannot turn thinking off, and only Flash-Lite takes minimal; the others reject it.
  it('sends the thinking floor for thinking off, and a budget on 2.5 models', () => {
    expect(thinkingConfig({ model: 'gemini-x', thinking: false })).toEqual({ includeThoughts: true, thinkingLevel: 'low' });
    expect(thinkingConfig({ model: 'gemini-x-flash-lite', thinking: false })).toEqual({ includeThoughts: true, thinkingLevel: 'minimal' });
    expect(thinkingConfig({ model: 'gemini-2.5-flash', thinking: false })).toEqual({ includeThoughts: false, thinkingBudget: 0 });
    expect(thinkingConfig({ model: 'gemini-2.5-flash', thinking: true })).toEqual({ includeThoughts: true, thinkingBudget: -1 });
  });
});

function assemble(chunks: unknown[]) {
  const assembly = new GeminiResponseAssembly(request);
  const events: StreamEvent[] = [];
  for (const chunk of chunks) assembly.feed(chunk, event => events.push(event));
  const response = assembly.finish(event => events.push(event));
  return { response, events, meters: assembly.meters() };
}

describe('GeminiResponseAssembly', () => {
  it('turns thoughts, text and signed calls into reasoning, message and function Items', () => {
    const { response, meters } = assemble([
      { responseId: 'R1', modelVersion: 'gemini-x-flash', candidates: [{ content: { role: 'model', parts: [{ text: 'plan', thought: true }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'on it' }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'look', args: { at: 'sky' } }, thoughtSignature: 'SIG' }, { functionCall: { name: 'say', args: {} } }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 800, candidatesTokenCount: 20, thoughtsTokenCount: 30, totalTokenCount: 1050 } },
    ]);
    expect(response).toMatchObject({ id: 'R1', status: 'completed', usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 800 }, output_tokens_details: { reasoning_tokens: 30 } } });
    expect(response.output.map(item => item.type)).toEqual(['reasoning', 'message', 'function_call', 'function_call']);
    expect(response.output[0]).toMatchObject({ encrypted_content: 'SIG', content: [{ type: 'reasoning_text', text: 'plan' }] });
    expect(response.output[2]).toMatchObject({ name: 'look', arguments: '{"at":"sky"}' });
    expect(meters).toMatchObject({ input: 1000, cachedInput: 800, uncachedInput: 200, output: 50, reasoning: 30 });
  });

  it('round-trips: the assembled output replays with the same signature on the same call', () => {
    const { response } = assemble([{ candidates: [{ content: { parts: [{ functionCall: { name: 'look', args: {}, id: 'c1' }, thoughtSignature: 'SIG' }] }, finishReason: 'STOP' }] }]);
    const replay = response.output.map(item => record(item, { responseId: response.id, origin }));
    const { contents } = geminiInput(request, { context: [message('user', 'go'), ...replay, functionResult('c1', 'ok')], origin });
    expect(contents[1].parts).toEqual([{ functionCall: { name: 'look', args: {}, id: 'c1' }, thoughtSignature: 'SIG' }]);
  });

  it('ends incomplete on MAX_TOKENS and failed on a malformed call', () => {
    const cut = assemble([{ candidates: [{ content: { parts: [{ text: 'half' }] }, finishReason: 'MAX_TOKENS' }] }]).response;
    expect(cut).toMatchObject({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
    expect(cut.output[0]).toMatchObject({ status: 'incomplete' });
    const bad = assemble([{ candidates: [{ content: { parts: [] }, finishReason: 'MALFORMED_FUNCTION_CALL', finishMessage: 'bad call' }] }]).response;
    expect(bad).toMatchObject({ status: 'failed', error: { code: 'MALFORMED_FUNCTION_CALL', message: 'bad call' } });
  });

  it('keeps the finish reason of an empty completion in the native meters', () => {
    const { response, meters } = assemble([{ candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, totalTokenCount: 100 } }]);
    expect(response).toMatchObject({ status: 'completed', output: [] });
    expect(meters).toMatchObject({ output: 0, native: { promptTokenCount: 100, finishReason: 'STOP' } });
    const bad = assemble([{ candidates: [{ content: { parts: [] }, finishReason: 'MALFORMED_FUNCTION_CALL', finishMessage: 'bad call' }] }]).meters;
    expect(bad.native).toEqual({ finishReason: 'MALFORMED_FUNCTION_CALL', finishMessage: 'bad call' });
  });

  it('rejects a stream that ends without a finish reason', () => {
    expect(() => assemble([{ candidates: [{ content: { parts: [{ text: 'x' }] } }] }])).toThrow(/finishReason/);
  });
});

describe('geminiMeters', () => {
  it('reads omitted cache and thought counts as zero only when the prompt count is present', () => {
    expect(geminiMeters({ promptTokenCount: 10, candidatesTokenCount: 2 })).toMatchObject({ input: 10, cachedInput: 0, uncachedInput: 10, output: 2, reasoning: 0, total: 12 });
    expect(geminiMeters({})).toMatchObject({ input: null, output: null });
  });
});
