/**
 * Requests whose images the model service rejects. When the service refuses a request that carries
 * images (400, 413 or 422 that is not a context overflow), the same request is sent once more without
 * them. When that one is accepted, the images were the cause: their handles are remembered, and every
 * later request through this endpoint leaves them out too. Each image left out keeps the `[blob …]`
 * line Core wrote for it and gets the `imageLeftOut` line after it. The handles live in memory only,
 * so after a restart the first request carrying one of them is refused once more.
 */
import { BaseProvider } from 'cortico/providers/base.ts';
import { GenerationError, type GenerateOptions, type Generation } from 'cortico/core/generation.ts';
import type { ContextRecord, Item } from 'cortico/protocol/open-responses/context.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';
import type { Logger } from 'cortico/core/types.ts';
import { sinceLastDelivery } from './context.ts';
import { imageLeftOut } from './model-text.ts';

/** Statuses for a request the service will not take as written. */
const REFUSED: ReadonlySet<number> = new Set([400, 413, 422]);

const isImage = (mime: string): boolean => mime.startsWith('image/');

export class ImageFallback extends BaseProvider {
  /** Images whose request was accepted only without them. */
  private readonly refused = new Set<string>();

  constructor(
    private readonly inner: BaseProvider,
    private readonly media: CompatMediaOptions,
    private readonly contextOverflow: (error: { status: number; body: string }) => boolean,
    private readonly log: Logger,
  ) {
    super();
  }

  async respond(request: Request, options: GenerateOptions = {}): Promise<Generation> {
    const context = options.context && withoutImages(options.context, this.refused);
    try {
      return await this.inner.respond(request, context ? { ...options, context } : options);
    } catch (error) {
      if (!context || options.diagnostic || options.signal?.aborted || !(error instanceof GenerationError)
        || !REFUSED.has(error.status) || this.contextOverflow(error)) throw error;
      const sent = this.sentImages(context);
      if (!sent.size) throw error;
      let generation: Generation;
      try {
        generation = await this.inner.respond(request, { ...options, context: withoutImages(context, sent) });
      } catch (retry) {
        if (!(retry instanceof GenerationError)) throw retry;
        throw new GenerationError(retry.message, [...error.attempts, ...retry.attempts], retry.partial, retry.origin, retry.status, retry.body, { cause: retry.cause });
      }
      for (const handle of sent) this.refused.add(handle);
      this.log.warn('Model service rejected a request with images; sent again without them', { status: error.status, images: [...sent] });
      return { ...generation, attempts: [...error.attempts, ...generation.attempts] };
    }
  }

  /** The images the client attaches to a request built from `context`. */
  private sentImages(context: readonly ContextRecord[]): Set<string> {
    if (!this.media.enabled()) return new Set();
    return new Set(sinceLastDelivery(context).flatMap((entry) => (entry.context.blobs ?? [])
      .filter((ref) => isImage(ref.mime) && this.media.read(ref.handle))
      .map((ref) => ref.handle)));
  }
}

/** The context without the images in `handles`; each record that lost one gets an `imageLeftOut` line per image. */
export function withoutImages(context: readonly ContextRecord[], handles: ReadonlySet<string>): readonly ContextRecord[] {
  if (!handles.size) return context;
  return context.map((entry) => {
    const blobs = entry.context.blobs ?? [];
    const out = blobs.filter((ref) => isImage(ref.mime) && handles.has(ref.handle));
    if (!out.length) return entry;
    return {
      ...entry,
      item: withLine(entry.item, out.map((ref) => imageLeftOut(ref.handle)).join('\n')),
      context: { ...entry.context, blobs: blobs.filter((ref) => !out.includes(ref)) },
    };
  });
}

/** The item with `line` after its text; content parts other than text stay in place. */
function withLine(item: Item, line: string): Item {
  if (item.type === 'message')
    return { ...item, content: typeof item.content === 'string' ? `${item.content}\n${line}` : [...item.content, { type: 'input_text', text: line }] } as Item;
  if (item.type === 'function_call_output')
    return { ...item, output: typeof item.output === 'string' ? `${item.output}\n${line}` : [...item.output, { type: 'input_text', text: line }] } as Item;
  return item;
}
