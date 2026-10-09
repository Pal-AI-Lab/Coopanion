/**
 * Streamed reasoning from services whose Responses events stray from the standard in ways the
 * standard parser rejects (#94):
 * - StepFun sends vLLM's retired `response.reasoning_part.added` / `.done` where the standard has
 *   `response.content_part.added` / `.done`;
 * - Qwen sends reasoning text deltas without first adding the part they write into;
 * - StepFun's documented stream closes the reasoning item with `content: null` and leaves it out of
 *   the terminal response, though its deltas wrote the text.
 * Each event is rewritten into the standard form before `NativeResponseAssembly` validates it.
 * The service's sequence number n becomes 2n + 1: 2n is free for a part added here, and the order
 * check still runs on the service's own numbers.
 */
import { NativeResponseAssembly, type ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import type { Response, StreamEvent } from 'cortico/protocol/open-responses/index.ts';

type Payload = Record<string, any>;

const RENAMED: Readonly<Record<string, string>> = {
  'response.reasoning_part.added': 'response.content_part.added',
  'response.reasoning_part.done': 'response.content_part.done',
};
const REASONING_DELTAS = new Set(['response.reasoning_text.delta', 'response.reasoning.delta']);
const TERMINAL = new Set(['response.completed', 'response.incomplete', 'response.failed']);

export class LenientReasoningAssembly implements ResponseAssembly {
  private readonly inner = new NativeResponseAssembly();
  /** `<item id>/<content index>` of every part already added. */
  private readonly parts = new Set<string>();

  feed(payload: unknown, emit: (event: StreamEvent) => void): void {
    if (!payload || typeof payload !== 'object') return this.inner.feed(payload, emit);
    const raw = payload as Payload;
    const sequence = Number.isInteger(raw.sequence_number) ? raw.sequence_number * 2 + 1 : raw.sequence_number;
    let event: Payload = { ...raw, type: RENAMED[raw.type] ?? raw.type, sequence_number: sequence };
    const part = `${event.item_id}/${event.content_index}`;
    if (event.type === 'response.content_part.added') this.parts.add(part);
    else if (REASONING_DELTAS.has(event.type) && !this.parts.has(part)) {
      this.parts.add(part);
      this.inner.feed({
        type: 'response.content_part.added', sequence_number: sequence - 1, output_index: event.output_index,
        item_id: event.item_id, content_index: event.content_index, part: { type: 'reasoning_text', text: '' },
      }, emit);
    } else if (event.type === 'response.output_item.done' && event.item?.type === 'reasoning') {
      event = { ...event, item: this.withContent(event.item) };
    } else if (TERMINAL.has(event.type) && Array.isArray(event.response?.output)) {
      event = { ...event, response: { ...event.response, output: this.withReasoning(event.response.output) } };
    }
    this.inner.feed(event, emit);
  }

  /** A reasoning item without content takes the content its deltas wrote. */
  private withContent(item: Payload): Payload {
    if (item.content?.length) return item;
    const seen = this.inner.snapshot()?.output.find((o) => o.id === item.id) as Payload | undefined;
    return seen?.content?.length ? { ...item, content: seen.content } : item;
  }

  /** Puts back the streamed reasoning items a terminal response left out, in stream order. */
  private withReasoning(output: Payload[]): Payload[] {
    const seen = (this.inner.snapshot()?.output ?? []) as unknown as Payload[];
    const final = new Map(output.map((item) => [item.id, item]));
    const kept = seen.some((item) => item.type === 'reasoning' && !final.has(item.id))
      ? [...seen.flatMap((item) => final.get(item.id) ?? (item.type === 'reasoning' ? [item] : [])),
        ...output.filter((item) => !seen.some((s) => s.id === item.id))]
      : output;
    return kept.map((item) => (item.type === 'reasoning' ? this.withContent(item) : item));
  }

  finish(): Response { return this.inner.finish(); }
  snapshot(): Response | null { return this.inner.snapshot(); }
  meters() { return this.inner.meters(); }
  serviceTier(): string | null { return this.inner.serviceTier(); }
}
