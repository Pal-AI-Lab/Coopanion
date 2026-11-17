/**
 * Gemini API client on the framework transport, API key only:
 * `POST <baseUrl>/models/<model>:generateContent`, or `:streamGenerateContent?alt=sse` when
 * streaming, with the key in `x-goog-api-key`. Recent accepted requests supply the attachment
 * selection for continued sessions.
 */
import type { BlobRef, Logger } from 'cortico/core/types.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { GenerateOptions, Generation } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import type { BaseProvider } from 'cortico/providers/base.ts';
import { OpenAIHttpClient } from 'cortico/providers/transport/chat.ts';
import { LLMError } from 'cortico/providers/transport/errors.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';
import { ImageFallback, type ImageFallbackOptions } from 'cortico/providers/transport/image-fallback.ts';
import type { ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import type { ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import { isModelOutput, lastSuccessfulOutputEnd } from '../context.ts';
import { GeminiResponseAssembly, geminiRequest, parseGeminiResponse, type InlineAttachmentReplay } from './wire.ts';

export interface GeminiProviderOptions {
  baseUrl: string;
  apiKey?: string;
  media?: CompatMediaOptions;
  keepThinking?: () => boolean;
  log?: Logger;
}

interface GeminiGenerateOptions extends GenerateOptions {
  attachmentReplay?: InlineAttachmentReplay;
}

/** Only recent accepted requests need attachment lookups. */
const ATTACHMENT_REPLAY_LIMIT = 32;

export class GeminiProvider extends OpenAIHttpClient {
  private readonly opts: GeminiProviderOptions;
  private readonly sentAttachments = new Map<string, ReadonlySet<string>>();
  private readonly rejectedImages = new WeakMap<readonly ContextRecord[], ReadonlySet<BlobRef>>();

  constructor(opts: GeminiProviderOptions) {
    super(opts.baseUrl, opts.log ?? nullLogger());
    this.opts = opts;
  }

  /**
   * The method depends on the model and on streaming, so the path is set per request.
   * `super.respond` reads `chatPath` and builds the body before its first await, so concurrent
   * requests cannot observe each other's path.
   */
  override respond(request: Request, options: GenerateOptions = {}): Promise<Generation> {
    const method = options.onEvent ? 'streamGenerateContent?alt=sse' : 'generateContent';
    this.chatPath = `/models/${encodeURIComponent(request.model ?? '')}:${method}`;
    const { sessionId, context, diagnostic } = options;
    const scope = sessionId && context && !diagnostic ? [sessionId, request.model] as const : undefined;
    const replay: InlineAttachmentReplay | undefined = context && !diagnostic
      ? { previous: scope && this.previousAttachments(scope, context) } : undefined;
    const call: GeminiGenerateOptions = { ...options, attachmentReplay: replay };
    const generation = super.respond(request, call);
    if (!context || !replay) return generation;
    return generation.then(result => {
      const { id, output } = result.response;
      const outcome = result.attempts.at(-1)?.outcome;
      if (scope && replay.sent && !options.signal?.aborted && (outcome === 'completed' || outcome === 'incomplete')) {
        if (output.some(isModelOutput)) this.rememberAttachments(JSON.stringify([...scope, id]), replay.sent.keys);
        else {
          const tailId = context.at(-1)?.item.id;
          const previousId = context[lastSuccessfulOutputEnd(context) - 1]?.context.responseId;
          if (tailId) this.rememberAttachments(JSON.stringify([...scope, previousId, tailId]), replay.sent.keys);
        }
      }
      return result;
    }, (error: unknown) => {
      if (replay.sent?.images.size) this.rejectedImages.set(context, replay.sent.images);
      throw error;
    });
  }

  withImageFallback(options: Omit<ImageFallbackOptions, 'attached'>): BaseProvider {
    const fallback = new ImageFallback(this, {
      ...options,
      attached: context => {
        const images = this.rejectedImages.get(context);
        if (!images) return [];
        return context.flatMap(entry => {
          const blobs = entry.context.blobs?.filter(ref => images.has(ref));
          return blobs?.length ? [{ ...entry, context: { ...entry.context, blobs } }] : [];
        });
      },
    });
    return {
      // Each call has its own context even when callers share an input array.
      respond: (request, opts) => opts?.context
        ? fallback.respond(request, { ...opts, context: opts.context.slice() }) : fallback.respond(request, opts),
    };
  }

  private previousAttachments(
    scope: readonly [string, Request['model']],
    context: readonly ContextRecord[],
  ): InlineAttachmentReplay['previous'] {
    const responseEnd = lastSuccessfulOutputEnd(context);
    const responseId = context[responseEnd - 1]?.context.responseId;
    // An accepted request with no model output leaves its last input as the available anchor.
    for (let index = context.length - 1; index >= Math.max(0, responseEnd - 1); index--) {
      const tailId = context[index].item.id;
      if (!tailId) continue;
      const keys = this.sentAttachments.get(JSON.stringify([...scope, responseId, tailId]));
      if (keys) return { pendingStart: index + 1, keys };
    }
    const keys = responseId ? this.sentAttachments.get(JSON.stringify([...scope, responseId])) : undefined;
    return keys ? { pendingStart: responseEnd, keys } : undefined;
  }

  private rememberAttachments(key: string, sent: ReadonlySet<string>): void {
    this.sentAttachments.delete(key);
    this.sentAttachments.set(key, sent);
    if (this.sentAttachments.size > ATTACHMENT_REPLAY_LIMIT)
      this.sentAttachments.delete(this.sentAttachments.keys().next().value!);
  }

  protected override buildResponseBody(request: Request, options: GeminiGenerateOptions): Record<string, unknown> {
    return geminiRequest(request, options, {
      media: this.opts.media, keepThinking: this.opts.keepThinking, attachmentReplay: options.attachmentReplay,
    });
  }

  /** The body is built whole in `buildResponseBody`. */
  protected buildBody(): never {
    throw new Error('GeminiProvider does not build Chat Completions bodies');
  }

  protected override responseAssembly(request: Request): ResponseAssembly { return new GeminiResponseAssembly(request); }

  protected override parseResponse(raw: unknown, request: Request): ReturnType<typeof parseGeminiResponse> {
    return parseGeminiResponse(raw, request);
  }

  protected headers(): Record<string, string> {
    if (!this.opts.apiKey) throw new LLMError('Gemini API 缺密钥(端点的密钥变量未设置)', 401, '');
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey };
  }
}

/** At most this many pages of the model list are read, within `MODEL_LIST_MS` in all. */
export const MODEL_PAGES_MAX = 20;
const MODEL_LIST_MS = 60_000;

/**
 * `GET /models`, page after page until there is no next page, a page token comes back again, or the limits
 * above are reached; a redirect fails it, since the key header would follow it. The id drops the
 * `models/` prefix and the window is `inputTokenLimit`.
 */
export async function listGeminiModels(baseUrl: string, apiKey: string): Promise<Array<{ id: string; contextWindow?: number; maxOutputTokens?: number }>> {
  const models: Array<{ id: string; contextWindow?: number; maxOutputTokens?: number }> = [];
  const deadline = AbortSignal.timeout(MODEL_LIST_MS);
  const seen = new Set<string>();
  let page = '';
  for (let pages = 0; pages < MODEL_PAGES_MAX; pages++) {
    const query = `pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models?${query}`, {
      headers: { 'x-goog-api-key': apiKey }, redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
    });
    if (!res.ok) throw new Error(`GET /models ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as { models?: Array<{ name?: unknown; inputTokenLimit?: unknown; outputTokenLimit?: unknown }>; nextPageToken?: string };
    for (const row of data.models ?? []) {
      if (typeof row.name !== 'string') continue;
      const window = typeof row.inputTokenLimit === 'number' ? row.inputTokenLimit : undefined;
      const output = typeof row.outputTokenLimit === 'number' ? row.outputTokenLimit : undefined;
      models.push({ id: row.name.replace(/^models\//, ''), ...(window ? { contextWindow: window } : {}), ...(output ? { maxOutputTokens: output } : {}) });
    }
    page = data.nextPageToken ?? '';
    if (!page || seen.has(page)) break;
    seen.add(page);
  }
  return models;
}
