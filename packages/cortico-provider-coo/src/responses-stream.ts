/**
 * Opt-in fallback for gateways that rebuild Responses items at stream completion.
 * Only equivalent items at the same output index can recover their streamed identities.
 * NativeResponseAssembly validates every normalized event before it reaches the caller.
 */
import { isDeepStrictEqual } from 'node:util';
import { NativeResponseAssembly, type ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import { ResponseProtocolError } from 'cortico/protocol/open-responses/stream.ts';
import type { OutputItem, Response, StreamEvent } from 'cortico/protocol/open-responses/index.ts';

type Payload = Record<string, any>;

const RENAMED: Readonly<Record<string, string>> = {
  'response.reasoning_part.added': 'response.content_part.added',
  'response.reasoning_part.done': 'response.content_part.done',
};
const TERMINAL = new Set(['response.completed', 'response.incomplete', 'response.failed']);

/** Every field in the pinned output schemas participates in terminal comparison, including optional fields. */
const ITEM_FIELDS = {
  message: { type: true, id: true, status: true, role: true, content: true, phase: true },
  function_call: { type: true, id: true, call_id: true, name: true, arguments: true, status: true },
  function_call_output: { type: true, id: true, call_id: true, output: true, status: true },
  reasoning: { type: true, id: true, content: true, summary: true, encrypted_content: true },
  compaction: { type: true, id: true, encrypted_content: true, created_by: true },
} satisfies { [Kind in OutputItem['type']]: Record<keyof Extract<OutputItem, { type: Kind }>, true> };

/** Omitted extension fields retain their streamed values so the native accumulator can compare whole items. */
function withStreamedExtras(item: Payload, seen: OutputItem): Payload {
  const fields = ITEM_FIELDS[seen.type];
  if (!fields) return item;
  const extras = Object.entries(seen).filter(([key]) => !Object.hasOwn(item, key) && !Object.hasOwn(fields, key)
    // These extensions affect completion and tool routing even where the pinned schema omits them.
    && !(seen.type === 'reasoning' && key === 'status')
    && !(seen.type === 'function_call' && key === 'namespace'));
  return { ...Object.fromEntries(extras), ...item };
}

/** Whitespace outside JSON strings is insignificant; numbers, escapes and key order stay exact. */
function sameArguments(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (left === right) return true;
  try {
    JSON.parse(left);
    JSON.parse(right);
    const compact = (text: string) => text.replace(/"(?:\\.|[^"\\])*"|\s+/g, token => token.startsWith('"') ? token : '');
    return compact(left) === compact(right);
  } catch { return false; }
}

function normalizePart(part: Payload): Payload {
  return part?.type === 'output_text' && part.logprobs === null ? { ...part, logprobs: [] } : part;
}

function normalizeItem(item: Payload): Payload {
  return Array.isArray(item?.content) ? { ...item, content: item.content.map(normalizePart) } : item;
}

function withStreamedContent(item: Payload, seen: Payload): Payload {
  if (item.type === 'reasoning' && seen.type === 'reasoning'
    && (item.content === null || (Array.isArray(item.content) && item.content.length === 0))
    && Array.isArray(seen.content) && seen.content.length) item = { ...item, content: seen.content };
  if (item.type === 'function_call' && seen.type === 'function_call' && sameArguments(item.arguments, seen.arguments))
    item = { ...item, arguments: seen.arguments };
  return item;
}

function withStreamedIdentity(item: Payload, seen: Payload): Payload {
  item = { ...withStreamedContent(item, seen), id: seen.id };
  if (item.type === 'function_call' && seen.type === 'function_call') item.call_id = seen.call_id;
  if (item.type === 'reasoning' && seen.type === 'reasoning' && item.status === null && 'status' in seen)
    item.status = seen.status;
  return item;
}

export class CompatibleResponsesAssembly implements ResponseAssembly {
  private readonly inner = new NativeResponseAssembly();
  private readonly closed = new Map<number, OutputItem>();

  feed(payload: unknown, emit: (event: StreamEvent) => void): void {
    if (!payload || typeof payload !== 'object') return this.inner.feed(payload, emit);
    const raw = payload as Payload;
    let event: Payload = { ...raw, type: RENAMED[raw.type] ?? raw.type };
    if (event.type === 'response.content_part.added' || event.type === 'response.content_part.done')
      event.part = normalizePart(event.part);
    if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done')
      event.item = normalizeItem(event.item);
    if (event.type === 'response.output_item.done' && event.item) {
      const seen = this.inner.snapshot()?.output.find(item => item.id === event.item.id);
      if (seen) event.item = withStreamedContent(event.item, seen);
    }
    if (event.type === 'response.function_call_arguments.done') {
      const seen = this.inner.snapshot()?.output.find(item => item.id === event.item_id);
      if (seen?.type === 'function_call' && sameArguments(event.arguments, seen.arguments)) event.arguments = seen.arguments;
    }
    if (TERMINAL.has(event.type) && Array.isArray(event.response?.output)) {
      event = { ...event, response: { ...event.response, output: this.terminalOutput(event.response.output) } };
    }
    this.inner.feed(event, checked => {
      if (checked.type === 'response.output_item.done' && checked.item) {
        if (typeof checked.item.id !== 'string' || !checked.item.id)
          throw new ResponseProtocolError('Invalid streamed item ID');
        if (checked.item.type === 'function_call') {
          const call = checked.item;
          if (typeof call.call_id !== 'string' || !call.call_id
            || [...this.closed.values()].some(item => item.type === 'function_call' && item.call_id === call.call_id))
            throw new ResponseProtocolError('Invalid or duplicate streamed call ID');
        }
        this.closed.set(checked.output_index, structuredClone(checked.item));
      }
      emit(checked);
    });
  }

  private terminalOutput(output: Payload[]): Payload[] {
    const ids = new Set<string>();
    const calls = new Set<string>();
    return output.map((raw, index) => {
      const item = normalizeItem(raw);
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id))
        throw new ResponseProtocolError('Invalid or duplicate terminal item ID');
      ids.add(item.id);
      if (item.type === 'function_call') {
        if (typeof item.call_id !== 'string' || !item.call_id || calls.has(item.call_id))
          throw new ResponseProtocolError('Invalid or duplicate terminal call ID');
        calls.add(item.call_id);
      }
      const seen = this.closed.get(index);
      if (!seen) throw new ResponseProtocolError('Terminal response contains an unfinished output item');
      for (const [otherIndex, other] of this.closed) {
        if (otherIndex !== index && (item.id === other.id
          || (item.type === 'function_call' && other.type === 'function_call' && item.call_id === other.call_id)))
          throw new ResponseProtocolError('Terminal response changed output order');
      }
      const candidate = withStreamedExtras(withStreamedIdentity(item, seen), seen);
      if (!isDeepStrictEqual(candidate, seen)) throw new ResponseProtocolError('Terminal response changed a closed item');
      return candidate;
    });
  }

  finish(): Response { return this.inner.finish(); }
  snapshot(): Response | null { return this.inner.snapshot(); }
  meters() { return this.inner.meters(); }
  serviceTier(): string | null { return this.inner.serviceTier(); }
}
