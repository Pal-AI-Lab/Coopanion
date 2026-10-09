/**
 * Anthropic Messages API client on the official SDK. The SDK carries the HTTP and SSE; this class
 * keeps the framework's attempt contract: up to three retries with backoff (`Retry-After` when the
 * API sends one) on connection errors, 408, 409, 429, 5xx and 529, never after an irreversible
 * delta, and one `ProviderAttempt` with meters and charges for every request sent. The SDK's own
 * retries are off so each attempt is recorded. Images are limited to the newest delivered batch
 * (`sinceLastDelivery`).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from 'cortico/core/types.ts';
import { nullLogger } from 'cortico/core/util.ts';
import { BaseProvider } from 'cortico/providers/base.ts';
import { GenerationError, priceUsage, unknownMeters, type GenerateOptions, type Generation, type PriceSnapshot, type ProviderAttempt } from 'cortico/core/generation.ts';
import type { Request, Response, StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { ResponseProtocolError } from 'cortico/protocol/open-responses/stream.ts';
import { LLMError, abortError, parseRetryAfter, retryDelay, reqIdSuffix } from 'cortico/providers/transport/errors.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';
import { sinceLastDelivery } from '../context.ts';
import { ClaudeResponseAssembly, claudeRequest, parseClaudeMessage } from './wire.ts';

export const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Waits before the second, third and fourth attempt. */
const RETRY_DELAYS_MS = [1000, 4000, 10000];
/** Until response headers: streaming 300 s, unary 120 s (the framework's first-response limits). */
const HEADERS_TIMEOUT_MS = { streaming: 300_000, unary: 120_000 } as const;
/** A stream that sends no event for this long is cut; the API pings well inside it. */
const STREAM_IDLE_MS = 120_000;

function irreversible(event: StreamEvent): boolean {
  return event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta'
    || event.type === 'response.function_call_arguments.delta'
    || (event.type === 'response.output_item.added' && event.item?.type === 'function_call');
}

function retryable(status: number): boolean {
  return status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;
}

export interface ClaudeProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  media?: CompatMediaOptions;
  keepThinking?: () => boolean;
  log?: Logger;
}

export class ClaudeProvider extends BaseProvider {
  private readonly opts: ClaudeProviderOptions;
  private readonly log: Logger;
  private sdk: Anthropic | null = null;

  constructor(opts: ClaudeProviderOptions) {
    super();
    this.opts = opts;
    this.log = opts.log ?? nullLogger();
  }

  /** The SDK client; the key is checked when the first request needs it. */
  client(): Anthropic {
    if (!this.opts.apiKey) throw new LLMError('Claude 缺密钥(端点的密钥变量未设置)', 401, '');
    this.sdk ??= new Anthropic({ apiKey: this.opts.apiKey, baseURL: this.opts.baseUrl || DEFAULT_BASE_URL, maxRetries: 0 });
    return this.sdk;
  }

  async respond(request: Request, options: GenerateOptions = {}): Promise<Generation> {
    const origin = options.origin ?? { instance: 'coo', module: 'coo', model: request.model ?? '', compatibilityDomain: this.opts.baseUrl ?? DEFAULT_BASE_URL };
    const limited = options.context ? { ...options, context: sinceLastDelivery(options.context) } : options;
    const { params, betas } = claudeRequest(request, limited, { media: this.opts.media, keepThinking: this.opts.keepThinking });
    const streaming = Boolean(options.onEvent);
    const generationId = crypto.randomUUID();
    const attempts: ProviderAttempt[] = [];
    const delays = options.diagnostic ? [] : RETRY_DELAYS_MS;
    let partial: Response | null = null;
    let lastError: unknown;
    let retryAfterMs: number | null = null;
    const fail = (error: unknown): GenerationError => new GenerationError((error instanceof Error ? error.message : String(error)) + reqIdSuffix(attempts.at(-1)?.requestId),
      attempts, partial, origin, error instanceof LLMError ? error.status : 0, error instanceof LLMError ? error.body : '', { cause: error });

    for (let ordinal = 0; ordinal <= delays.length; ordinal++) {
      try {
        if (options.signal?.aborted) throw abortError(options.signal);
        if (ordinal) await retryDelay(retryAfterMs ?? delays[ordinal - 1], options.signal);
      } catch (error) { throw fail(error); }
      retryAfterMs = null;
      const attempt: ProviderAttempt = {
        id: crypto.randomUUID(), generationId, ordinal, origin: structuredClone(origin), startedAt: new Date().toISOString(), elapsedMs: 0,
        requestId: null, responseId: null, outcome: 'failed', status: null, serviceTier: null, requestedServiceTier: null,
        purpose: options.diagnostic ? 'diagnostic' : 'generation', meters: unknownMeters(), charges: [],
      };
      const started = Date.now();
      const quotes: readonly PriceSnapshot[] = structuredClone(options.quote?.({ startedAt: attempt.startedAt, requestedServiceTier: null }) ?? []);
      const controller = new AbortController();
      const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      const assembly = new ClaudeResponseAssembly(request);
      let idle: ReturnType<typeof setTimeout> | null = null;
      const touch = (): void => {
        if (idle) clearTimeout(idle);
        idle = setTimeout(() => controller.abort(new Error('Provider stream idle timeout')), STREAM_IDLE_MS);
      };
      let committed = false;
      let characters = 0;
      let runaway = false;
      const limit = (request.max_output_tokens ?? params.max_tokens) * 12;
      const forward = (event: StreamEvent): void => {
        if ('delta' in event && typeof event.delta === 'string') characters += event.delta.length;
        if (irreversible(event)) committed = true;
        if (!options.signal?.aborted) options.onEvent?.(event);
        if (characters > limit) {
          runaway = true;
          controller.abort();
          throw new LLMError('Provider exceeded the output character limit', 0, '');
        }
      };
      try {
        const body = { ...params, ...(betas.length ? { betas } : {}) };
        const requestOptions = { signal, timeout: streaming ? HEADERS_TIMEOUT_MS.streaming : HEADERS_TIMEOUT_MS.unary };
        if (streaming) {
          const { data: stream, response, request_id } = await this.client().beta.messages.create({ ...body, stream: true as const }, requestOptions).withResponse();
          attempt.status = response.status;
          attempt.requestId = request_id ?? null;
          touch();
          for await (const event of stream) {
            touch();
            assembly.feed(event, forward);
          }
          partial = assembly.finish(forward);
          attempt.meters = assembly.meters();
          attempt.serviceTier = assembly.serviceTier();
        } else {
          const { data: message, response, request_id } = await this.client().beta.messages.create({ ...body, stream: false as const }, requestOptions).withResponse();
          attempt.status = response.status;
          attempt.requestId = request_id ?? null;
          const parsed = parseClaudeMessage(message, request);
          partial = parsed.response;
          attempt.meters = parsed.meters;
          attempt.serviceTier = parsed.serviceTier;
        }
        attempt.responseId = partial.id;
        if (partial.status === 'failed') throw new LLMError(partial.error?.message ?? 'Response failed', 0, JSON.stringify(partial.error));
        attempt.outcome = options.signal?.aborted ? 'discarded' : partial.status === 'incomplete' ? 'incomplete' : 'completed';
        return { response: partial, origin, attempts };
      } catch (raw) {
        if (streaming) {
          partial = assembly.snapshot();
          attempt.meters = assembly.meters();
        }
        attempt.responseId = partial?.id ?? null;
        if (options.signal?.aborted) {
          attempt.outcome = 'aborted';
          lastError = abortError(options.signal);
          break;
        }
        const error = raw instanceof Anthropic.APIError && !(raw instanceof Anthropic.APIUserAbortError)
          ? new LLMError(`Claude API ${raw.status ?? 0}: ${raw.message}`, raw.status ?? 0, JSON.stringify(raw.error ?? raw.message))
          : raw instanceof Anthropic.APIUserAbortError && controller.signal.aborted
            ? new LLMError(String(controller.signal.reason ?? 'Provider aborted'), 0, '')
            : raw;
        if (raw instanceof Anthropic.APIError) {
          attempt.status = raw.status ?? attempt.status;
          attempt.requestId = raw.requestID ?? attempt.requestId;
          retryAfterMs = parseRetryAfter(raw.headers?.get('retry-after') ?? null);
        }
        lastError = error;
        const status = error instanceof LLMError ? error.status : 0;
        if (committed || runaway || error instanceof ResponseProtocolError || !retryable(status)) break;
        this.log.warn('Claude attempt failed; retrying', { ordinal, err: String(error) });
      } finally {
        if (idle) clearTimeout(idle);
        attempt.elapsedMs = Date.now() - started;
        attempt.charges = priceUsage(attempt.meters, quotes, attempt.serviceTier);
        attempts.push(attempt);
      }
    }
    throw fail(lastError);
  }
}
