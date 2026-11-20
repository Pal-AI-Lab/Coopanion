import type { ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { RESERVED_FRAME_NAMES } from 'cortico/core/loop.ts';

/**
 * The context with attachments of every type removed from every item before the newest
 * delivered batch (a user message, or the frame call Core writes for external events). Kept, each
 * past attachment would be re-sent on every request until handoff. Items after the model's last
 * output keep their attachments even when a batch is delivered after them: a tool result written
 * there has not been sent with a request yet. The text line Core writes for each attachment stays.
 */
export function sinceLastDelivery(context: readonly ContextRecord[]): readonly ContextRecord[] {
  let delivery = context.length - 1;
  for (; delivery >= 0; delivery--) {
    const { item } = context[delivery];
    if ((item.type === 'message' && item.role === 'user') || (item.type === 'function_call' && RESERVED_FRAME_NAMES.has(item.name))) break;
  }
  let output = context.length - 1;
  for (; output >= 0; output--) {
    const { item } = context[output];
    if (item.type === 'reasoning' || (item.type === 'message' && item.role === 'assistant') || (item.type === 'function_call' && !RESERVED_FRAME_NAMES.has(item.name))) break;
  }
  const from = Math.min(delivery, output + 1);
  return context.map((entry, index) => {
    if (index >= from || !entry.context.blobs?.length) return entry;
    return { ...entry, context: { ...entry.context, blobs: [] } };
  });
}
