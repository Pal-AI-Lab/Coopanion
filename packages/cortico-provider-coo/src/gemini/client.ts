/**
 * Gemini API client on the framework transport, API key only:
 * `POST <baseUrl>/models/<model>:generateContent`, or `:streamGenerateContent?alt=sse` when
 * streaming, with the key in `x-goog-api-key`. Images are limited to the newest delivered batch
 * (`sinceLastDelivery`).
 */
import type { Logger } from 'cortico/core/types.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { GenerateOptions, Generation } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { OpenAIHttpClient } from 'cortico/providers/transport/chat.ts';
import { LLMError } from 'cortico/providers/transport/errors.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';
import type { ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import { sinceLastDelivery } from '../context.ts';
import { GeminiResponseAssembly, geminiRequest, parseGeminiResponse } from './wire.ts';

export interface GeminiProviderOptions {
  baseUrl: string;
  apiKey?: string;
  media?: CompatMediaOptions;
  keepThinking?: () => boolean;
  log?: Logger;
}

export class GeminiProvider extends OpenAIHttpClient {
  private readonly opts: GeminiProviderOptions;

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
    return super.respond(request, options);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const limited = options.context ? { ...options, context: sinceLastDelivery(options.context) } : options;
    return geminiRequest(request, limited, { media: this.opts.media, keepThinking: this.opts.keepThinking });
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

/** `GET /models`, all pages; the id drops the `models/` prefix and the window is `inputTokenLimit`. */
export async function listGeminiModels(baseUrl: string, apiKey: string): Promise<Array<{ id: string; contextWindow?: number; maxOutputTokens?: number }>> {
  const models: Array<{ id: string; contextWindow?: number; maxOutputTokens?: number }> = [];
  let page = '';
  do {
    const query = `pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models?${query}`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`GET /models ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as { models?: Array<{ name?: unknown; inputTokenLimit?: unknown; outputTokenLimit?: unknown }>; nextPageToken?: string };
    for (const row of data.models ?? []) {
      if (typeof row.name !== 'string') continue;
      const window = typeof row.inputTokenLimit === 'number' ? row.inputTokenLimit : undefined;
      const output = typeof row.outputTokenLimit === 'number' ? row.outputTokenLimit : undefined;
      models.push({ id: row.name.replace(/^models\//, ''), ...(window ? { contextWindow: window } : {}), ...(output ? { maxOutputTokens: output } : {}) });
    }
    page = data.nextPageToken ?? '';
  } while (page);
  return models;
}
