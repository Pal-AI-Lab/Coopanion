/**
 * Open Responses ↔ Gemini API `GenerateContentRequest` / `GenerateContentResponse`.
 *
 * Thought signatures: Gemini returns an opaque `thoughtSignature` on the first function call of a
 * step (and optionally on the last text part). It is recorded as the `encrypted_content` of the
 * response's reasoning Item and re-attached on replay to the first function call of that model turn,
 * else to its last text part. A model turn with a function call and no usable signature (history
 * from another endpoint or model, or dropped by `keepThinking`) carries `BYPASS_SIGNATURE`, the
 * value Gemini documents for history it did not generate.
 */
import { createResponse, type OutputItem, type Request, type Response, type StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { ResponseAccumulator, ResponseProtocolError } from 'cortico/protocol/open-responses/stream.ts';
import { itemText, type ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { standardUsage, unknownMeters, type GenerateOptions, type TokenMeters } from 'cortico/core/generation.ts';
import type { ModelSpec } from 'cortico/core/types.ts';
import { requestContext, requestSpec } from 'cortico/providers/transport/native-input.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
}
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Documented placeholder signature for function calls Gemini did not generate in this conversation. */
export const BYPASS_SIGNATURE = 'skip_thought_signature_validator';

/**
 * Text of the user turn inserted where the context opens or ends with a model turn. Gemini rejects
 * a function call turn that does not follow a user or function-response turn, a request whose last
 * turn is a model turn, and an empty part.
 */
export const FILLER_USER_TEXT = '-';

type Item = Record<string, any>;

function dataUrl(url: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!match) throw new ResponseProtocolError('Gemini inline media requires a base64 data URL');
  return { mimeType: match[1], data: match[2] };
}

/** Content parts of a user message or function output; text is joined into one part per run. */
function userParts(content: unknown): GeminiPart[] {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  const parts: GeminiPart[] = [];
  for (const part of (content ?? []) as Item[]) {
    if (typeof part.text === 'string') { if (part.text) parts.push({ text: part.text }); }
    else if (part.type === 'refusal') { if (part.refusal) parts.push({ text: part.refusal }); }
    else if (part.type === 'input_image') {
      if (!part.image_url) throw new ResponseProtocolError('Gemini images require image_url');
      parts.push({ inlineData: dataUrl(part.image_url) });
    } else if (part.type === 'input_file') {
      if (!part.file_data) throw new ResponseProtocolError('Gemini files require inline file_data');
      parts.push({ inlineData: String(part.file_data).startsWith('data:') ? dataUrl(part.file_data)
        : { mimeType: 'application/octet-stream', data: part.file_data } });
    } else throw new ResponseProtocolError('Unsupported Gemini content part: ' + part.type);
  }
  return parts;
}

function parseArgs(text: string): Record<string, unknown> {
  if (!text) return {};
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResponseProtocolError('Gemini function arguments must be a JSON object');
  return value as Record<string, unknown>;
}

interface ModelTurn { content: GeminiContent; signature?: string; group?: string }

function sealTurn(turn: ModelTurn): void {
  const parts = turn.content.parts;
  const call = parts.find(part => part.functionCall);
  if (call) { call.thoughtSignature = turn.signature ?? BYPASS_SIGNATURE; return; }
  const text = [...parts].reverse().find(part => part.text !== undefined);
  if (text && turn.signature) text.thoughtSignature = turn.signature;
}

export interface GeminiInput {
  contents: GeminiContent[];
  systemInstruction?: { role: 'user'; parts: [{ text: string }] };
}

/**
 * The whole context as Gemini contents. Model-side Items (reasoning, assistant text, function
 * calls) with the same `responseId` form one model turn; adjacent user-side Items merge into one
 * user turn. A reasoning Item contributes only its signature, and only when its recorded origin
 * matches this request.
 */
export function geminiInput(request: Request, options: GenerateOptions, opts: { media?: CompatMediaOptions; keepThinking?: () => boolean } = {}): GeminiInput {
  const systems = request.instructions ? [request.instructions] : [];
  const contents: GeminiContent[] = [];
  const names = new Map<string, string>();
  let turn: ModelTurn | null = null;
  const closeTurn = (): void => {
    if (!turn) return;
    sealTurn(turn);
    if (turn.content.parts.length) contents.push(turn.content);
    turn = null;
  };
  const modelTurn = (entry: ContextRecord): ModelTurn => {
    const group = entry.context.responseId;
    if (turn && group !== undefined && turn.group !== undefined && group !== turn.group) closeTurn();
    turn ??= { content: { role: 'model', parts: [] }, group };
    turn.group ??= group;
    return turn;
  };
  const userTurn = (parts: GeminiPart[]): void => {
    closeTurn();
    if (!parts.length) return;
    const last = contents.at(-1);
    if (last?.role === 'user') last.parts.push(...parts);
    else contents.push({ role: 'user', parts });
  };
  const blobs = (entry: ContextRecord): GeminiPart[] => {
    if (!opts.media?.enabled() || !entry.context.blobs?.length) return [];
    const parts: GeminiPart[] = [];
    for (const ref of entry.context.blobs) {
      const bytes = opts.media.read(ref.handle);
      if (bytes) parts.push({ inlineData: { mimeType: ref.mime, data: bytes.toString('base64') } });
    }
    return parts;
  };
  for (const entry of requestContext(request, options)) {
    const item = entry.item as Item;
    if (item.type === 'reasoning') {
      const target = modelTurn(entry);
      if (!item.encrypted_content) continue;
      if (!entry.context.head && opts.keepThinking?.() === false) continue;
      const owner = entry.context.origin;
      const current = options.origin;
      if (!owner || !current || owner.instance !== current.instance || owner.module !== current.module
        || owner.compatibilityDomain !== current.compatibilityDomain || owner.model !== request.model) continue;
      target.signature = item.encrypted_content;
    } else if (item.type === 'function_call') {
      names.set(item.call_id, item.name);
      modelTurn(entry).content.parts.push({ functionCall: { name: item.name, args: parseArgs(item.arguments), id: item.call_id } });
    } else if (item.type === 'function_call_output') {
      const name = names.get(item.call_id);
      if (!name) throw new ResponseProtocolError(`Gemini function output ${item.call_id} has no preceding call`);
      const media = userParts(item.output).filter(part => part.inlineData);
      userTurn([{ functionResponse: { name, id: item.call_id, response: { output: itemText(item as any) } } }, ...media, ...blobs(entry)]);
    } else if (item.type === 'message') {
      if (item.role === 'system' || item.role === 'developer') {
        systems.push(typeof item.content === 'string' ? item.content : item.content.map((part: Item) => part.text ?? '').join(''));
      } else if (item.role === 'assistant') {
        const text = itemText(item as any);
        const target = modelTurn(entry);
        if (text) target.content.parts.push({ text });
      } else userTurn([...userParts(item.content), ...blobs(entry)]);
    } else throw new ResponseProtocolError(`Gemini provider cannot replay ${item.type}`);
  }
  closeTurn();
  if (contents[0]?.role === 'model') contents.unshift({ role: 'user', parts: [{ text: FILLER_USER_TEXT }] });
  if (contents.at(-1)?.role === 'model') contents.push({ role: 'user', parts: [{ text: FILLER_USER_TEXT }] });
  return { contents, ...(systems.length ? { systemInstruction: { role: 'user', parts: [{ text: systems.join('\n') }] } } : {}) };
}

const legacy = (model: string): boolean => /^gemini-2\./.test(model);

/** Flash-Lite models take `minimal`, which the other Gemini 3 models reject. */
const MINIMAL = /flash-lite/;

/** Gemini 3 levels. Gemini 3 cannot turn thinking off: `thinking: false` sends the lowest level the model takes. */
export function thinkingConfig(spec: ModelSpec): Record<string, unknown> {
  if (legacy(spec.model)) {
    const budget = !spec.thinking ? 0 : spec.reasoningEffort === 'high' || spec.reasoningEffort === 'max' ? 24576
      : spec.reasoningEffort === 'medium' ? 8192 : spec.reasoningEffort === 'low' ? 1024 : -1;
    return { includeThoughts: budget !== 0, thinkingBudget: budget };
  }
  const level = !spec.thinking ? (MINIMAL.test(spec.model) ? 'minimal' : 'low') : spec.reasoningEffort === 'max' || spec.reasoningEffort === 'xhigh' ? 'high' : spec.reasoningEffort ?? 'low';
  return { includeThoughts: true, thinkingLevel: level };
}

function toolConfig(choice: Request['tool_choice']): Record<string, unknown> | undefined {
  if (choice == null) return undefined;
  if (typeof choice === 'string') {
    const mode = { auto: 'AUTO', none: 'NONE', required: 'ANY' }[choice];
    if (!mode) throw new ResponseProtocolError('Gemini cannot map tool_choice ' + choice);
    return { functionCallingConfig: { mode } };
  }
  if (choice.type === 'function') return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [choice.name] } };
  throw new ResponseProtocolError('Gemini cannot map this tool_choice');
}

/** The inner `GenerateContentRequest`; function parameters pass through as JSON Schema. */
export function geminiRequest(request: Request, options: GenerateOptions, opts: { media?: CompatMediaOptions; keepThinking?: () => boolean } = {}): Record<string, unknown> {
  const spec = requestSpec(request, options);
  const generationConfig: Record<string, unknown> = { thinkingConfig: thinkingConfig(spec) };
  // Gemini 3 deprecates the sampling parameters; only 2.x models receive them.
  if (legacy(spec.model)) {
    if (spec.temperature !== undefined) generationConfig.temperature = spec.temperature;
    if (request.top_p != null) generationConfig.topP = request.top_p;
  }
  if (spec.maxTokens !== undefined) generationConfig.maxOutputTokens = spec.maxTokens;
  const format = request.text?.format;
  if (format?.type === 'json_schema') Object.assign(generationConfig, { responseMimeType: 'application/json', responseJsonSchema: format.schema });
  const body: Record<string, unknown> = { ...geminiInput(request, options, opts), generationConfig };
  const tools = request.tools?.filter(tool => tool.type === 'function');
  if (tools?.length) body.tools = [{ functionDeclarations: tools.map(tool => ({
    name: tool.name, description: tool.description ?? '', parametersJsonSchema: tool.parameters ?? { type: 'object', properties: {} } })) }];
  const config = toolConfig(request.tool_choice);
  if (config) body.toolConfig = config;
  return body;
}

/** `usageMetadata` omits zero counts; a present prompt count makes an absent cache or thought count zero. */
export function geminiMeters(raw: Record<string, any> | null | undefined): TokenMeters {
  if (!raw || typeof raw.promptTokenCount !== 'number') return unknownMeters();
  const input = raw.promptTokenCount + (raw.toolUsePromptTokenCount ?? 0);
  const reasoning = raw.thoughtsTokenCount ?? 0;
  const output = (raw.candidatesTokenCount ?? 0) + reasoning;
  const cachedInput = raw.cachedContentTokenCount ?? 0;
  const details: TokenMeters['details'] = {};
  for (const row of raw.promptTokensDetails ?? []) {
    if (typeof row?.modality === 'string' && typeof row.tokenCount === 'number')
      details[`input_${row.modality.toLowerCase()}`] = { quantity: row.tokenCount, unit: 'token' };
  }
  return { input, output, total: raw.totalTokenCount ?? input + output, cachedInput, uncachedInput: input - cachedInput, reasoning,
    ...(Object.keys(details).length ? { details } : {}), native: structuredClone(raw) };
}

const FILTERED = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT']);

type MutableOutput = { id: string; type: string; status?: string; content?: any[]; summary?: any[]; call_id?: string; name?: string; arguments?: string; role?: string; encrypted_content?: string };

/**
 * One Gemini response as an Open Responses stream. Thought parts go to one reasoning Item, text to
 * one message Item, each function call to its own Item. `STOP` completes; `MAX_TOKENS` and the
 * filter reasons end `incomplete`; any other finish reason ends `failed` with the reason as the code.
 */
export class GeminiResponseAssembly {
  private readonly response: Response;
  private readonly accumulator = new ResponseAccumulator();
  private sequence = 0;
  private started = false;
  private finishReason: string | null = null;
  private finishMessage = '';
  private blockReason: string | null = null;
  private usage = unknownMeters();
  private readonly output: MutableOutput[] = [];
  private reasoningIndex: number | null = null;
  private messageIndex: number | null = null;
  private lastTouched: number | null = null;
  private callSignature: string | null = null;
  private textSignature: string | null = null;

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
  private reasoning(emit: (event: StreamEvent) => void): number {
    this.reasoningIndex ??= this.add({ type: 'reasoning', id: `rs_${crypto.randomUUID()}`, summary: [], content: [] }, emit);
    return this.reasoningIndex;
  }
  private text(kind: 'reasoning' | 'content', delta: string, emit: (event: StreamEvent) => void): void {
    let index = kind === 'reasoning' ? this.reasoningIndex : this.messageIndex;
    const fresh = index === null || !this.output[index].content?.length;
    if (kind === 'reasoning') index = this.reasoning(emit);
    else index ??= this.messageIndex = this.add({ type: 'message', id: `msg_${crypto.randomUUID()}`, role: 'assistant', status: 'in_progress', content: [] }, emit);
    const item = this.output[index];
    if (fresh) {
      const part = kind === 'reasoning' ? { type: 'reasoning_text', text: '' } : { type: 'output_text', text: '', annotations: [] };
      this.send({ type: 'response.content_part.added', output_index: index, item_id: item.id, content_index: 0, part }, emit);
      item.content = [part];
    }
    this.send({ type: kind === 'reasoning' ? 'response.reasoning.delta' : 'response.output_text.delta',
      output_index: index, item_id: item.id, content_index: 0, delta, ...(kind === 'content' ? { logprobs: [] } : {}) }, emit);
    item.content![0].text += delta;
    this.lastTouched = index;
  }

  feed(payload: unknown, emit: (event: StreamEvent) => void): void {
    if (!payload || typeof payload !== 'object') throw new ResponseProtocolError('Invalid Gemini response chunk');
    const chunk = payload as Item;
    if (!this.started) {
      if (typeof chunk.responseId === 'string') this.response.id = chunk.responseId;
      if (typeof chunk.modelVersion === 'string') this.response.model = chunk.modelVersion;
      this.send({ type: 'response.created', response: this.response }, emit);
      this.started = true;
    }
    if (chunk.usageMetadata) this.usage = geminiMeters(chunk.usageMetadata);
    if (chunk.promptFeedback?.blockReason) this.blockReason = chunk.promptFeedback.blockReason;
    const candidate = chunk.candidates?.[0];
    if (!candidate) return;
    if (candidate.index !== undefined && candidate.index !== 0) throw new ResponseProtocolError('Multiple Gemini candidates are unsupported');
    for (const part of (candidate.content?.parts ?? []) as GeminiPart[]) {
      if (part.functionCall) {
        if (!part.functionCall.name) throw new ResponseProtocolError('Gemini function call lacks a name');
        if (part.thoughtSignature && this.callSignature === null) {
          this.callSignature = part.thoughtSignature;
          this.reasoning(emit);
        }
        const args = JSON.stringify(part.functionCall.args ?? {});
        const item: MutableOutput = { type: 'function_call', id: `fc_${crypto.randomUUID()}`, call_id: part.functionCall.id || `call_${crypto.randomUUID()}`,
          name: part.functionCall.name, arguments: '', status: 'in_progress' };
        const index = this.add(item, emit);
        this.send({ type: 'response.function_call_arguments.delta', output_index: index, item_id: item.id, delta: args }, emit);
        item.arguments = args;
        this.lastTouched = index;
        continue;
      }
      if (part.thoughtSignature) this.textSignature = part.thoughtSignature;
      if (part.text) this.text(part.thought ? 'reasoning' : 'content', part.text, emit);
    }
    if (candidate.finishReason) {
      this.finishReason = candidate.finishReason;
      this.finishMessage = candidate.finishMessage ?? '';
    }
  }

  finish(emit: (event: StreamEvent) => void): Response {
    const reason = this.finishReason ?? (this.blockReason ? 'SAFETY' : null);
    if (!this.started || !reason) throw new ResponseProtocolError('Gemini stream ended without finishReason');
    const signature = this.callSignature ?? (this.reasoningIndex !== null ? this.textSignature : null);
    if (signature) this.output[this.reasoning(emit)].encrypted_content = signature;
    const incomplete = reason === 'MAX_TOKENS' || FILTERED.has(reason);
    const failed = !incomplete && reason !== 'STOP' && reason !== 'FINISH_REASON_UNSPECIFIED';
    for (let index = 0; index < this.output.length; index++) {
      const item = this.output[index];
      if (item.type === 'function_call') {
        this.send({ type: 'response.function_call_arguments.done', output_index: index, item_id: item.id, arguments: item.arguments }, emit);
      } else if (item.content?.length) {
        this.send({ type: 'response.content_part.done', output_index: index, item_id: item.id, content_index: 0, part: item.content[0] }, emit);
      }
      if (item.type !== 'reasoning') item.status = incomplete && index === this.lastTouched ? 'incomplete' : 'completed';
      this.send({ type: 'response.output_item.done', output_index: index, item }, emit);
    }
    this.response.output = this.output as OutputItem[];
    this.response.usage = standardUsage(this.usage);
    this.response.status = failed ? 'failed' : incomplete ? 'incomplete' : 'completed';
    this.response.completed_at = Math.floor(Date.now() / 1000);
    this.response.incomplete_details = incomplete ? { reason: reason === 'MAX_TOKENS' ? 'max_output_tokens' : 'content_filter' } : null;
    if (failed) this.response.error = { code: reason, message: this.finishMessage || this.blockReason || reason };
    this.send({ type: `response.${this.response.status}`, response: this.response }, emit);
    return this.accumulator.finish();
  }
  snapshot(): Response | null { return this.accumulator.snapshot(); }
  serviceTier(): string | null { return null; }
  /** `native` also carries the candidate's `finishReason`/`finishMessage` and the prompt's `blockReason` once seen. */
  meters(): TokenMeters {
    const meters = structuredClone(this.usage);
    const finish = { ...(this.finishReason ? { finishReason: this.finishReason } : {}), ...(this.finishMessage ? { finishMessage: this.finishMessage } : {}),
      ...(this.blockReason ? { blockReason: this.blockReason } : {}) };
    if (Object.keys(finish).length) meters.native = { ...meters.native, ...finish };
    return meters;
  }
}

/** A unary response is one chunk followed by the end of stream. */
export function parseGeminiResponse(raw: unknown, request: Request): { response: Response; meters: TokenMeters; serviceTier: string | null } {
  const assembly = new GeminiResponseAssembly(request);
  assembly.feed(raw, () => {});
  return { response: assembly.finish(() => {}), meters: assembly.meters(), serviceTier: null };
}
