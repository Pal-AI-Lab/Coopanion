import type { ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { RESERVED_FRAME_NAMES } from 'cortico/core/loop.ts';

/** Media types removed from deliveries the model has already received. */
const MEDIA = /^(image|audio|video)\//;

/** Starts of the latest delivery with pending tool results, and of input after the last model output. */
export function inputBoundaries(context: readonly ContextRecord[]): { currentStart: number; unsentStart: number } {
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
  const unsentStart = output + 1;
  return { currentStart: Math.max(0, Math.min(delivery, unsentStart)), unsentStart };
}

/**
 * Remove image, audio and video bytes before the newest delivery and unsent tool results.
 * The text line Core writes for each attachment stays.
 */
export function sinceLastDelivery(context: readonly ContextRecord[]): readonly ContextRecord[] {
  const { currentStart } = inputBoundaries(context);
  return context.map((entry, index) => {
    const blobs = entry.context.blobs;
    if (index >= currentStart || !blobs?.some((b) => MEDIA.test(b.mime))) return entry;
    return { ...entry, context: { ...entry.context, blobs: blobs.filter((b) => !MEDIA.test(b.mime)) } };
  });
}
