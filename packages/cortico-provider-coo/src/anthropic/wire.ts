/**
 * Open Responses ↔ Claude Messages API.
 *
 * Request: system and developer messages before the first conversation Item become the top-level
 * `system`; later ones become user text, since a mid-conversation `system` message has placement
 * rules a replayed context cannot promise. Model-side Items with the same `responseId` form one
 * assistant message whose blocks keep the Item order. Every `tool_use` gets a `tool_result` in the
 * next user message, first in that message; a result whose call is not in the assistant message
 * right before it is replayed as text.
 *
 * Thinking: a thinking block is recorded as a reasoning Item whose `encrypted_content` is the
 * block's signature (a redacted block keeps its data behind `REDACTED_PREFIX`). It is sent back
 * only when the Item's origin matches this request, and with thinking on the request asks the API
 * to drop, not reject, a block whose conversation prefix changed (Core's handoff rewrites history).
 *
 * Stream: each content block is its own output Item. A block closes on `content_block_stop`, so
 * Core can run a finished tool call while the model is still writing; a tool input that is not
 * valid JSON at that point stays open and the response's stop reason settles it.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { createResponse, type OutputItem, type Request, type Response, type StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { ResponseAccumulator, ResponseProtocolError } from 'cortico/protocol/open-responses/stream.ts';
import { itemText, type ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { standardUsage, unknownMeters, type GenerateOptions, type TokenMeters } from 'cortico/core/generation.ts';
import type { ModelSpec } from 'cortico/core/types.ts';
import { requestContext, requestSpec } from 'cortico/providers/transport/native-input.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type ToolResultParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type StreamPayload = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;

/** Beta that lets a request set `thinking.block_binding`. */
export const THINKING_BINDING_BETA = 'thinking-binding-controls-2026-08-01';
/** `encrypted_content` of a reasoning Item that holds a `redacted_thinking` block's data. */
export const REDACTED_PREFIX = 'redacted_thinking:';
/** Text of a user turn the API requires where the context has none (first message, after a trailing assistant turn). */
export const FILLER_USER_TEXT = '-';
/** `max_tokens` when the profile leaves it unset; thinking counts against it. */
export const DEFAULT_MAX_TOKENS = 16000;
/** Tool result for a call the context carries no output for. */
export const MISSING_RESULT = '(no result recorded)';

type Item = Record<string, any>;

/** Models that reject `thinking: {type: "disabled"}` at every effort; thinking off sends the lowest effort instead. */
const ALWAYS_THINKS = /^claude-(opus-5-5|fable-|mythos-)/;
/** Claude Sonnet 5.5 turns thinking off with `between_tools`. */
const BETWEEN_TOOLS = /^claude-sonnet-5-5/;
/** Models that reject a forced `tool_choice` (`any` / `tool`). */
const NO_FORCED_TOOLS = /^claude-(opus-5-5|fable-5-1|mythos-5-1|sonnet-5-5)/;
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/** Tool use ids must match `^[a-zA-Z0-9_-]+$`; ids from other endpoints are mapped onto that alphabet. */
export function toolUseId(callId: string): string {
  const id = callId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return id || 'call';
}

function dataUrl(url: string): { media_type: string; data: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!match) throw new ResponseProtocolError('Claude inline media requires a base64 data URL');
  return { media_type: match[1], data: match[2] };
}

function mediaBlock(mime: string, data: string): ContentBlockParam {
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  if (!/^image\/(jpeg|png|gif|webp)$/.test(mime)) throw new ResponseProtocolError('Claude cannot take media of type ' + mime);
  return { type: 'image', source: { type: 'base64', media_type: mime as 'image/png', data } };
}

/** Content parts of a user message or function output. */
function userBlocks(content: unknown): ContentBlockParam[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  const blocks: ContentBlockParam[] = [];
  for (const part of (content ?? []) as Item[]) {
    if (typeof part.text === 'string') { if (part.text) blocks.push({ type: 'text', text: part.text }); }
    else if (part.type === 'refusal') { if (part.refusal) blocks.push({ type: 'text', text: part.refusal }); }
    else if (part.type === 'input_image') {
      if (!part.image_url) throw new ResponseProtocolError('Claude images require image_url');
      const { media_type, data } = dataUrl(part.image_url);
      blocks.push(mediaBlock(media_type, data));
    } else if (part.type === 'input_file') {
      if (!part.file_data) throw new ResponseProtocolError('Claude files require inline file_data');
      const { media_type, data } = String(part.file_data).startsWith('data:') ? dataUrl(part.file_data) : { media_type: 'application/pdf', data: part.file_data };
      blocks.push(mediaBlock(media_type, data));
    } else throw new ResponseProtocolError('Unsupported Claude content part: ' + part.type);
  }
  return blocks;
}

/** Arguments that do not parse (a call cut short) are replayed as a string field so the history stays sendable. */
function toolInput(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* fall through */ }
  return { arguments: text };
}

function sameOrigin(entry: ContextRecord, options: GenerateOptions, model: string): boolean {
  const owner = entry.context.origin;
  const current = options.origin;
  return Boolean(owner && current && owner.instance === current.instance && owner.module === current.module
    && owner.compatibilityDomain === current.compatibilityDomain && owner.model === model);
}

export interface ClaudeInput {
  system: string[];
  messages: MessageParam[];
}

/** The whole context as Claude `system` text and `messages`. */
export function claudeInput(request: Request, options: GenerateOptions, opts: { media?: CompatMediaOptions; keepThinking?: () => boolean; replayThinking?: boolean } = {}): ClaudeInput {
  const model = request.model ?? options.nativeSpec?.model ?? '';
  const system = request.instructions ? [request.instructions] : [];
  type Turn = { role: 'user' | 'assistant'; blocks: ContentBlockParam[]; results: ToolResultParam[]; group?: string };
  const turns: Turn[] = [];
  let conversationStarted = false;
  const last = (): Turn | undefined => turns.at(-1);
  const assistant = (entry: ContextRecord): Turn => {
    const group = entry.context.responseId;
    const tail = last();
    if (tail?.role === 'assistant' && (group === undefined || tail.group === undefined || tail.group === group)) {
      tail.group ??= group;
      return tail;
    }
    const turn: Turn = { role: 'assistant', blocks: [], results: [], group };
    turns.push(turn);
    return turn;
  };
  const user = (): Turn => {
    const tail = last();
    if (tail?.role === 'user') return tail;
    const turn: Turn = { role: 'user', blocks: [], results: [] };
    turns.push(turn);
    return turn;
  };
  const blobs = (entry: ContextRecord): ContentBlockParam[] => {
    if (!opts.media?.enabled() || !entry.context.blobs?.length) return [];
    const blocks: ContentBlockParam[] = [];
    for (const ref of entry.context.blobs) {
      const bytes = opts.media.read(ref.handle);
      if (bytes) blocks.push(mediaBlock(ref.mime, bytes.toString('base64')));
    }
    return blocks;
  };
  for (const entry of requestContext(request, options)) {
    const item = entry.item as Item;
    if (item.type === 'message' && (item.role === 'system' || item.role === 'developer')) {
      const text = typeof item.content === 'string' ? item.content : (item.content ?? []).map((part: Item) => part.text ?? '').join('');
      if (!text) continue;
      if (!conversationStarted) system.push(text);
      else user().blocks.push({ type: 'text', text: `[system]\n${text}` });
      continue;
    }
    conversationStarted = true;
    if (item.type === 'reasoning') {
      const turn = assistant(entry);
      const sealed = typeof item.encrypted_content === 'string' ? item.encrypted_content : '';
      // With thinking off the API takes no thinking blocks back, so none are sent.
      if (!sealed || opts.replayThinking === false || !sameOrigin(entry, options, model)) continue;
      if (!entry.context.head && opts.keepThinking?.() === false) continue;
      turn.blocks.push(sealed.startsWith(REDACTED_PREFIX)
        ? { type: 'redacted_thinking', data: sealed.slice(REDACTED_PREFIX.length) }
        : { type: 'thinking', thinking: itemText(item as any), signature: sealed });
    } else if (item.type === 'function_call') {
      assistant(entry).blocks.push({ type: 'tool_use', id: toolUseId(item.call_id), name: item.name, input: toolInput(item.arguments ?? '') });
    } else if (item.type === 'function_call_output') {
      const blocks = userBlocks(item.output);
      const text = blocks.filter(block => block.type === 'text');
      const media = blocks.filter(block => block.type !== 'text');
      const content = [...(text.length ? text : [{ type: 'text' as const, text: itemText(item as any) || MISSING_RESULT }]), ...media, ...blobs(entry)];
      user().results.push({ type: 'tool_result', tool_use_id: toolUseId(item.call_id), content: content as ToolResultParam['content'] });
    } else if (item.type === 'message') {
      if (item.role === 'assistant') {
        const text = itemText(item as any);
        if (text) assistant(entry).blocks.push({ type: 'text', text });
      } else user().blocks.push(...userBlocks(item.content), ...blobs(entry));
    } else throw new ResponseProtocolError(`Claude provider cannot replay ${item.type}`);
  }

  // Pair every tool_use with a result in the next user turn; results without a call right before become text.
  const messages: MessageParam[] = [];
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index];
    if (turn.role === 'assistant') {
      const blocks = turn.blocks.filter(block => block.type !== 'text' || block.text);
      // A turn of thinking alone carries nothing the API can place.
      if (!blocks.some(block => block.type !== 'thinking' && block.type !== 'redacted_thinking')) continue;
      messages.push({ role: 'assistant', content: blocks });
      const calls = blocks.filter((block): block is Anthropic.Beta.Messages.BetaToolUseBlockParam => block.type === 'tool_use').map(block => block.id);
      if (!calls.length) continue;
      let next = turns[index + 1];
      if (next?.role !== 'user') { next = { role: 'user', blocks: [], results: [] }; turns.splice(index + 1, 0, next); }
      const answered = new Set(next.results.map(result => result.tool_use_id));
      for (const id of calls) if (!answered.has(id)) next.results.push({ type: 'tool_result', tool_use_id: id, content: MISSING_RESULT, is_error: true });
      next.results.sort((a, b) => calls.indexOf(a.tool_use_id) - calls.indexOf(b.tool_use_id));
      const stray = next.results.filter(result => !calls.includes(result.tool_use_id));
      next.results = next.results.filter(result => calls.includes(result.tool_use_id));
      next.blocks.unshift(...stray.map(strayText));
    } else {
      const prior = messages.at(-1);
      const calls = new Set(prior?.role === 'assistant' && Array.isArray(prior.content)
        ? prior.content.filter(block => block.type === 'tool_use').map(block => (block as { id: string }).id) : []);
      const stray = turn.results.filter(result => !calls.has(result.tool_use_id));
      const results = turn.results.filter(result => calls.has(result.tool_use_id));
      const content = [...results, ...stray.map(strayText), ...turn.blocks];
      if (content.length) messages.push({ role: 'user', content });
    }
  }
  if (messages[0]?.role !== 'user') messages.unshift({ role: 'user', content: FILLER_USER_TEXT });
  if (messages.at(-1)?.role === 'assistant') messages.push({ role: 'user', content: FILLER_USER_TEXT });
  return { system, messages };
}

function strayText(result: ToolResultParam): ContentBlockParam {
  const content = typeof result.content === 'string' ? result.content
    : (result.content ?? []).map(block => (block.type === 'text' ? block.text : `[${block.type}]`)).join('\n');
  return { type: 'text', text: `[tool result ${result.tool_use_id}]\n${content}` };
}

/** `thinking` and `output_config.effort` for the profile; thinking off uses the cheapest form the model accepts. */
export function thinkingParams(spec: ModelSpec): { thinking?: Anthropic.Beta.Messages.BetaThinkingConfigParam; effort?: string; betas: string[] } {
  const effort = spec.reasoningEffort && EFFORTS.has(spec.reasoningEffort) ? spec.reasoningEffort : undefined;
  const adaptive = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } } as const;
  if (!spec.thinking) {
    if (ALWAYS_THINKS.test(spec.model)) return { thinking: adaptive, effort: 'low', betas: [THINKING_BINDING_BETA] };
    if (BETWEEN_TOOLS.test(spec.model)) return { thinking: { type: 'between_tools' } as never, ...(effort && effort !== 'xhigh' && effort !== 'max' ? { effort } : {}), betas: [] };
    return { thinking: { type: 'disabled' }, ...(effort && effort !== 'xhigh' && effort !== 'max' ? { effort } : {}), betas: [] };
  }
  return { thinking: adaptive, ...(effort ? { effort } : {}), betas: [THINKING_BINDING_BETA] };
}

function toolChoice(request: Request, model: string): Anthropic.Beta.Messages.BetaToolChoice | undefined {
  const choice = request.tool_choice;
  const parallel = request.parallel_tool_calls === false ? { disable_parallel_tool_use: true } : {};
  if (choice == null) return request.parallel_tool_calls === false ? { type: 'auto', ...parallel } : undefined;
  if (typeof choice === 'string') {
    if (choice === 'auto') return { type: 'auto', ...parallel };
    if (choice === 'none') return { type: 'none' };
    if (choice === 'required') return NO_FORCED_TOOLS.test(model) ? { type: 'auto', ...parallel } : { type: 'any', ...parallel };
    throw new ResponseProtocolError('Claude cannot map tool_choice ' + choice);
  }
  if (choice.type === 'function') return NO_FORCED_TOOLS.test(model) ? { type: 'auto', ...parallel } : { type: 'tool', name: choice.name, ...parallel };
  throw new ResponseProtocolError('Claude cannot map this tool_choice');
}

export interface ClaudeBody {
  params: Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, 'stream' | 'betas'> & { cache_control?: { type: 'ephemeral' } };
  betas: string[];
}

/**
 * The request body. The system prompt carries one cache breakpoint and the top-level automatic
 * breakpoint follows the conversation's last block, so each request reads the prefix the previous
 * one wrote. Sampling parameters are not sent: current models reject non-default values.
 */
export function claudeRequest(request: Request, options: GenerateOptions, opts: { media?: CompatMediaOptions; keepThinking?: () => boolean } = {}): ClaudeBody {
  const spec = requestSpec(request, options);
  const { thinking, effort, betas } = thinkingParams(spec);
  const { system, messages } = claudeInput(request, options, { ...opts, replayThinking: thinking?.type === 'adaptive' });
  const params: ClaudeBody['params'] = {
    model: spec.model,
    max_tokens: spec.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages,
    cache_control: { type: 'ephemeral' },
  };
  if (system.length) params.system = [{ type: 'text', text: system.join('\n\n'), cache_control: { type: 'ephemeral' } }];
  if (thinking) params.thinking = thinking;
  const format = request.text?.format;
  const outputConfig: Record<string, unknown> = {};
  if (effort) outputConfig.effort = effort;
  if (format?.type === 'json_schema') outputConfig.format = { type: 'json_schema', schema: format.schema };
  if (Object.keys(outputConfig).length) params.output_config = outputConfig as never;
  const tools = request.tools?.filter(tool => tool.type === 'function');
  if (tools?.length) params.tools = tools.map(tool => ({
    name: tool.name, description: tool.description ?? '',
    input_schema: (tool.parameters ?? { type: 'object', properties: {} }) as Anthropic.Beta.Messages.BetaTool['input_schema'],
    ...(options.onEvent ? { eager_input_streaming: true } : {}),
  }));
  const choice = toolChoice(request, spec.model);
  if (choice && tools?.length) params.tool_choice = choice;
  return { params, betas };
}

/** Usage: `input_tokens` is what came after the last cache breakpoint; the prompt is all three input counts. */
export function claudeMeters(raw: Partial<Anthropic.Beta.Messages.BetaUsage> | null | undefined, thought: boolean): TokenMeters {
  if (!raw || typeof raw.input_tokens !== 'number') return unknownMeters();
  const fresh = raw.input_tokens;
  const written = raw.cache_creation_input_tokens ?? 0;
  const read = raw.cache_read_input_tokens ?? 0;
  const input = fresh + written + read;
  const output = raw.output_tokens ?? 0;
  return {
    input, output, total: input + output, cachedInput: read, uncachedInput: fresh + written,
    // The API counts thinking inside output_tokens without a separate figure.
    reasoning: thought ? null : 0,
    details: { fresh_input: { quantity: fresh, unit: 'token' }, cache_write: { quantity: written, unit: 'token' } },
    native: structuredClone(raw) as Record<string, unknown>,
  };
}

type MutableOutput = { id: string; type: string; status?: string; content?: any[]; summary?: any[]; call_id?: string; name?: string; arguments?: string; role?: string; encrypted_content?: string };
type Slot = { index: number; kind: 'text' | 'thinking' | 'tool'; closed: boolean };

/** One Claude stream as an Open Responses stream; see the module comment for the Item layout. */
export class ClaudeResponseAssembly {
  private readonly response: Response;
  private readonly accumulator = new ResponseAccumulator();
  private sequence = 0;
  private started = false;
  private stopReason: string | null = null;
  private stopDetails: unknown = null;
  private usage: Partial<Anthropic.Beta.Messages.BetaUsage> | null = null;
  private thought = false;
  private tier: string | null = null;
  private readonly output: MutableOutput[] = [];
  private readonly slots = new Map<number, Slot>();
  private lastTouched: number | null = null;

  constructor(request: Request) { this.response = createResponse(`resp_${crypto.randomUUID()}`, request); }

  private send(event: Record<string, unknown>, emit: (event: StreamEvent) => void): void {
    const complete = structuredClone({ ...event, sequence_number: this.sequence++ }) as StreamEvent;
    this.accumulator.accept(complete);
    emit(complete);
  }
  private add(item: MutableOutput, emit: (event: StreamEvent) => void): number {
    const index = this.output.length;
    this.output.push(item);
    this.send({ type: 'response.output_item.added', output_index: index, item }, emit);
    return index;
  }
  private textDelta(slot: Slot, delta: string, emit: (event: StreamEvent) => void): void {
    if (!delta) return;
    const item = this.output[slot.index];
    this.send({ type: slot.kind === 'thinking' ? 'response.reasoning.delta' : 'response.output_text.delta',
      output_index: slot.index, item_id: item.id, content_index: 0, delta, ...(slot.kind === 'text' ? { logprobs: [] } : {}) }, emit);
    item.content![0].text += delta;
    this.lastTouched = slot.index;
  }
  private argumentsDelta(slot: Slot, delta: string, emit: (event: StreamEvent) => void): void {
    if (!delta) return;
    const item = this.output[slot.index];
    this.send({ type: 'response.function_call_arguments.delta', output_index: slot.index, item_id: item.id, delta }, emit);
    item.arguments += delta;
    this.lastTouched = slot.index;
  }
  /** Closes an Item; `incomplete` marks the one a length stop cut short. */
  private close(slot: Slot, status: 'completed' | 'incomplete', emit: (event: StreamEvent) => void): void {
    if (slot.closed) return;
    slot.closed = true;
    const index = slot.index;
    const item = this.output[index];
    if (slot.kind === 'tool') {
      this.send({ type: 'response.function_call_arguments.done', output_index: index, item_id: item.id, arguments: item.arguments }, emit);
    } else if (item.content?.length) {
      this.send({ type: 'response.content_part.done', output_index: index, item_id: item.id, content_index: 0, part: item.content[0] }, emit);
    }
    if (item.type !== 'reasoning') item.status = status;
    this.send({ type: 'response.output_item.done', output_index: index, item }, emit);
  }

  feed(payload: unknown, emit: (event: StreamEvent) => void): void {
    const event = payload as StreamPayload;
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') throw new ResponseProtocolError('Invalid Claude stream event');
    if (event.type === 'message_start') {
      if (this.started) throw new ResponseProtocolError('Claude stream started twice');
      this.response.id = event.message.id;
      this.response.model = event.message.model;
      this.usage = { ...event.message.usage };
      if (typeof event.message.usage?.service_tier === 'string') this.response.service_tier = this.tier = event.message.usage.service_tier;
      this.send({ type: 'response.created', response: this.response }, emit);
      this.started = true;
      return;
    }
    if (!this.started) throw new ResponseProtocolError('Claude stream event before message_start');
    if (event.type === 'content_block_start') {
      const block = event.content_block as Item;
      if (this.slots.has(event.index)) throw new ResponseProtocolError('Claude content block index reused');
      if (block.type === 'text') {
        const index = this.add({ type: 'message', id: `msg_${crypto.randomUUID()}`, role: 'assistant', status: 'in_progress', content: [] }, emit);
        const part = { type: 'output_text', text: '', annotations: [] };
        this.send({ type: 'response.content_part.added', output_index: index, item_id: this.output[index].id, content_index: 0, part }, emit);
        this.output[index].content = [part];
        const slot: Slot = { index, kind: 'text', closed: false };
        this.slots.set(event.index, slot);
        this.textDelta(slot, block.text ?? '', emit);
      } else if (block.type === 'thinking') {
        this.thought = true;
        const index = this.add({ type: 'reasoning', id: `rs_${crypto.randomUUID()}`, summary: [], content: [] }, emit);
        const part = { type: 'reasoning_text', text: '' };
        this.send({ type: 'response.content_part.added', output_index: index, item_id: this.output[index].id, content_index: 0, part }, emit);
        this.output[index].content = [part];
        if (block.signature) this.output[index].encrypted_content = block.signature;
        const slot: Slot = { index, kind: 'thinking', closed: false };
        this.slots.set(event.index, slot);
        this.textDelta(slot, block.thinking ?? '', emit);
      } else if (block.type === 'redacted_thinking') {
        this.thought = true;
        const index = this.add({ type: 'reasoning', id: `rs_${crypto.randomUUID()}`, summary: [], content: [], encrypted_content: REDACTED_PREFIX + block.data }, emit);
        this.slots.set(event.index, { index, kind: 'thinking', closed: false });
      } else if (block.type === 'tool_use') {
        const index = this.add({ type: 'function_call', id: `fc_${crypto.randomUUID()}`, call_id: block.id, name: block.name, arguments: '', status: 'in_progress' }, emit);
        this.slots.set(event.index, { index, kind: 'tool', closed: false });
        this.lastTouched = index;
      } else throw new ResponseProtocolError('Unsupported Claude content block: ' + block.type);
      return;
    }
    if (event.type === 'content_block_delta') {
      const slot = this.slots.get(event.index);
      if (!slot || slot.closed) throw new ResponseProtocolError('Claude delta for an unknown or closed block');
      const delta = event.delta as Item;
      if (delta.type === 'text_delta' && slot.kind === 'text') this.textDelta(slot, delta.text, emit);
      else if (delta.type === 'thinking_delta' && slot.kind === 'thinking') this.textDelta(slot, delta.thinking, emit);
      else if (delta.type === 'signature_delta' && slot.kind === 'thinking') this.output[slot.index].encrypted_content = delta.signature;
      else if (delta.type === 'input_json_delta' && slot.kind === 'tool') this.argumentsDelta(slot, delta.partial_json, emit);
      else if (delta.type === 'citations_delta') { /* citations are not carried */ }
      else throw new ResponseProtocolError(`Claude ${delta.type} on a ${slot.kind} block`);
      return;
    }
    if (event.type === 'content_block_stop') {
      const slot = this.slots.get(event.index);
      if (!slot) throw new ResponseProtocolError('Claude stop for an unknown block');
      if (slot.kind === 'tool') {
        const item = this.output[slot.index];
        if (!item.arguments) this.argumentsDelta(slot, '{}', emit);
        try { JSON.parse(item.arguments!); } catch { return; }
      }
      this.close(slot, 'completed', emit);
      return;
    }
    if (event.type === 'message_delta') {
      if (event.delta.stop_reason) this.stopReason = event.delta.stop_reason;
      const details = (event.delta as { stop_details?: unknown }).stop_details;
      if (details) this.stopDetails = details;
      this.usage = { ...this.usage, ...Object.fromEntries(Object.entries(event.usage ?? {}).filter(([, value]) => value !== null && value !== undefined)) };
      return;
    }
    if (event.type === 'message_stop') return;
    throw new ResponseProtocolError('Unsupported Claude stream event: ' + (event as { type: string }).type);
  }

  /**
   * `end_turn`, `tool_use`, `stop_sequence` and `pause_turn` complete. `max_tokens` and
   * `model_context_window_exceeded` end `incomplete` at the output limit; `refusal` ends
   * `incomplete` as a content filter. Any other reason fails with the reason as the code.
   */
  finish(emit: (event: StreamEvent) => void): Response {
    const reason = this.stopReason;
    if (!this.started || !reason) throw new ResponseProtocolError('Claude stream ended without stop_reason');
    const lengthStop = reason === 'max_tokens' || reason === 'model_context_window_exceeded';
    const incomplete = lengthStop || reason === 'refusal';
    const failed = !incomplete && !['end_turn', 'tool_use', 'stop_sequence', 'pause_turn'].includes(reason);
    for (const slot of this.slots.values()) {
      if (slot.closed) continue;
      // A tool input that never parsed was cut short whatever the stop reason says.
      const cut = (incomplete && slot.index === this.lastTouched) || slot.kind === 'tool';
      this.close(slot, cut ? 'incomplete' : 'completed', emit);
    }
    this.response.output = this.output as OutputItem[];
    this.response.usage = standardUsage(this.meters());
    this.response.status = failed ? 'failed' : incomplete ? 'incomplete' : 'completed';
    this.response.completed_at = Math.floor(Date.now() / 1000);
    this.response.incomplete_details = incomplete ? { reason: lengthStop ? 'max_output_tokens' : 'content_filter' } : null;
    if (failed) this.response.error = { code: reason, message: reason };
    this.send({ type: `response.${this.response.status}`, response: this.response }, emit);
    return this.accumulator.finish();
  }
  snapshot(): Response | null { return this.accumulator.snapshot(); }
  serviceTier(): string | null { return this.tier; }
  /** `native` is the API's usage object plus the stop reason (and a refusal's `stop_details`) once seen. */
  meters(): TokenMeters {
    const meters = claudeMeters(this.usage, this.thought);
    if (this.stopReason) meters.native = { ...meters.native, stop_reason: this.stopReason, ...(this.stopDetails ? { stop_details: this.stopDetails } : {}) };
    return meters;
  }
}

/** A unary message replayed as the stream it would have been. */
export function parseClaudeMessage(raw: unknown, request: Request): { response: Response; meters: TokenMeters; serviceTier: string | null } {
  const message = raw as Anthropic.Beta.Messages.BetaMessage;
  if (!message || !Array.isArray(message.content)) throw new ResponseProtocolError('Claude response lacks content');
  const assembly = new ClaudeResponseAssembly(request);
  const none = (): void => {};
  assembly.feed({ type: 'message_start', message: { ...message, content: [], stop_reason: null } }, none);
  message.content.forEach((block, index) => {
    const start = block.type === 'tool_use' ? { ...block, input: {} } : block;
    assembly.feed({ type: 'content_block_start', index, content_block: start }, none);
    if (block.type === 'tool_use') assembly.feed({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) } }, none);
    assembly.feed({ type: 'content_block_stop', index }, none);
  });
  assembly.feed({ type: 'message_delta', delta: { stop_reason: message.stop_reason }, usage: message.usage }, none);
  return { response: assembly.finish(none), meters: assembly.meters(), serviceTier: assembly.serviceTier() };
}
