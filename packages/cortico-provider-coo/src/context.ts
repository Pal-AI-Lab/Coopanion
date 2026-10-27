import type { ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { RESERVED_FRAME_NAMES } from 'cortico/core/loop.ts';

/** Attachment types sent as model input; items before the newest batch lose them. */
const MEDIA = /^(image|audio|video)\//;

/**
 * The context with image, audio and video attachments removed from every item before the newest
 * delivered batch (a user message, or the frame call Core writes for external events). Kept, each
 * past attachment would be re-sent on every request until handoff. The text line Core writes for
 * each attachment stays.
 */
export function sinceLastDelivery(context: readonly ContextRecord[]): readonly ContextRecord[] {
  let from = context.length - 1;
  for (; from >= 0; from--) {
    const { item } = context[from];
    if ((item.type === 'message' && item.role === 'user') || (item.type === 'function_call' && RESERVED_FRAME_NAMES.has(item.name))) break;
  }
  return context.map((entry, index) => {
    const blobs = entry.context.blobs;
    if (index >= from || !blobs?.some((b) => MEDIA.test(b.mime))) return entry;
    return { ...entry, context: { ...entry.context, blobs: blobs.filter((b) => !MEDIA.test(b.mime)) } };
  });
}
