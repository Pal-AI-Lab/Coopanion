/**
 * Requests billed to a ChatGPT plan: the Responses client of `responses.ts` with the account's access
 * token, shaped for the plan's route (developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
 * Every request streams with `store: false` and replays the whole context; system text already goes
 * in `instructions`; the parameters the route rejects are left out; function and custom tools go
 * inside one namespace, and past calls of them carry its name. Success is `response.completed` only,
 * which the transport already requires of a stream.
 *
 * The plan's usage limit (`subscription_sharing_usage_limit_exceeded`, an HTTP 429 or a failed stream)
 * stays inside the client: it logs each pause, sends nothing for `USAGE_PAUSE_MS`, and sends the
 * request again after it, for as long as the limit lasts, so to Core the request is only slow and no
 * failure is counted. A new event that preempts the request ends the wait. Two cases still fail with
 * the 429: a request that had already streamed output, which cannot be taken back, and a diagnostic
 * request (the console's connection test), which reports it. A failed stream starts the pause as its
 * event arrives, and the transport's retries in the pause fail without a connection; an HTTP 429 is
 * seen after the transport's own retries of it.
 */
import { GenerationError, type GenerateOptions, type Generation } from 'cortico/core/generation.ts';
import type { Logger } from 'cortico/core/types.ts';
import type { ListedModel } from 'cortico/providers/base.ts';
import type { ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import { LLMError, retryDelay } from 'cortico/providers/transport/errors.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { VendorResponses, type VendorQuirks } from '../responses.ts';
import { ChatGPTAuthError, type ChatGPTAccount } from './auth.ts';

/** The error code of the plan's usage limit. */
export const USAGE_LIMIT = 'subscription_sharing_usage_limit_exceeded';
/** How long no request goes out after the usage limit is reached, between tries. The service states no reset time. */
export const USAGE_PAUSE_MS = 5 * 60_000;
/** Request fields the plan's route rejects. */
const UNSUPPORTED = [
  'background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata', 'moderation', 'multi_agent', 'prompt',
  'prompt_cache_retention', 'safety_identifier', 'service_tier', 'temperature', 'top_logprobs', 'top_p', 'truncation', 'user',
];
/** The namespace the route requires function tools to be grouped in. */
export const TOOL_NAMESPACE = { name: 'app', description: "The app's functions." };

type Item = Record<string, unknown>;

/** The request failed on the plan's usage limit, before the stream or inside it. */
export function usageLimited(err: unknown): boolean {
  return err instanceof GenerationError && (err.body.includes(USAGE_LIMIT) || err.message.includes(USAGE_LIMIT));
}

/** `body` with its function and custom tools in `TOOL_NAMESPACE`, and the replayed calls of them naming it. */
export function namespaced(body: Item): Item {
  const tools = Array.isArray(body.tools) ? (body.tools as Item[]) : [];
  const grouped = tools.filter((tool) => tool.type === 'function' || tool.type === 'custom');
  if (!grouped.length) return body;
  const names = new Set(grouped.map((tool) => tool.name));
  return {
    ...body,
    tools: [...tools.filter((tool) => !grouped.includes(tool)), { type: 'namespace', ...TOOL_NAMESPACE, tools: grouped }],
    input: (body.input as Item[]).map((item) =>
      (item.type === 'function_call' || item.type === 'custom_tool_call') && names.has(item.name) ? { ...item, namespace: TOOL_NAMESPACE.name } : item),
  };
}

/** The plan's models (`GET <baseUrl>/models`, `visibility: "list"`), in the order the service gives them. */
export async function listPlanModels(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch): Promise<ListedModel[]> {
  const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/models`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET /models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json() as { models?: Array<{ slug?: unknown; display_name?: unknown; visibility?: unknown }> };
  if (!Array.isArray(body.models)) throw new Error('GET /models returned no models array');
  return body.models.flatMap((m) => (m.visibility === 'list' && typeof m.slug === 'string' && m.slug
    ? [{ id: m.slug, ...(typeof m.display_name === 'string' && m.display_name ? { displayName: m.display_name } : {}) }] : []));
}

export class ChatGPTResponses extends VendorResponses {
  /** The access token of the request under way; the account refreshes it. */
  private token = '';

  constructor(opts: Omit<ResponsesProviderOptions, 'apiKey'>, quirks: VendorQuirks, private readonly account: ChatGPTAccount, private readonly logger: Logger) {
    super(opts, quirks);
  }

  override async respond(request: Request, options: GenerateOptions = {}): Promise<Generation> {
    for (;;) {
      if (!options.diagnostic) for (let left; (left = this.account.pausedUntil - Date.now()) > 0;) await retryDelay(Math.min(left, 1000), options.signal);
      try {
        this.token = await this.account.accessToken();
      } catch (err) {
        const origin = options.origin ?? { instance: 'chatgpt', module: 'chatgpt', model: request.model ?? '', compatibilityDomain: this.baseUrl };
        // a signed-out account or a refused refresh is 401 / 400 and ends the batch; an unreachable token endpoint is retried
        const status = err instanceof ChatGPTAuthError ? err.status : 0;
        throw new GenerationError(`ChatGPT sign-in: ${err instanceof Error ? err.message : String(err)}`, [], null, origin, status, '', { cause: err });
      }
      try {
        // the route answers streams only
        return await super.respond(request, { ...options, onEvent: options.onEvent ?? (() => {}) });
      } catch (err) {
        if (!usageLimited(err)) throw err;
        this.pause((err as GenerationError).attempts.at(-1)?.requestId ?? null);
        if (options.diagnostic || options.signal?.aborted || (err as GenerationError).partial?.output.length) throw err;
      }
    }
  }

  /** Starts the pause after the usage limit, unless one is under way. */
  private pause(requestId: string | null): void {
    if (Date.now() < this.account.pausedUntil) return;
    this.account.pausedUntil = Date.now() + USAGE_PAUSE_MS;
    this.logger.warn(`ChatGPT 套餐用量已达上限(${USAGE_LIMIT}),${USAGE_PAUSE_MS / 60_000} 分钟内不再发请求`, { code: USAGE_LIMIT, requestId });
  }

  /**
   * The standard assembly, which also starts the pause at a failure event of the usage limit. The route's
   * terminal response carries an empty `output`; it is filled from the `output_item.done` items, by output
   * index, before the event goes on. A completed or incomplete response is filled only when every announced
   * item is done; a failed one takes the unfinished items as streamed so far. Indices with a gap, or a
   * terminal `output` that is not empty, go on unchanged.
   */
  protected override responseAssembly(): ResponseAssembly {
    const inner = super.responseAssembly();
    const announced = new Set<number>();
    const done = new Map<number, unknown>();
    return {
      feed: (payload, emit) => {
        const event = payload as { type?: unknown; output_index?: number; item?: unknown; response?: { output?: unknown } } | null;
        const type = event?.type;
        if ((type === 'response.failed' || type === 'error') && JSON.stringify(payload).includes(USAGE_LIMIT)) this.pause(null);
        if ((type === 'response.completed' || type === 'response.incomplete' || type === 'response.failed')
          && Array.isArray(event!.response?.output) && !event!.response.output.length && announced.size) {
          const streamed = type === 'response.failed' ? inner.snapshot()?.output : undefined;
          const output = Array.from({ length: announced.size }, (_, i) => done.get(i) ?? (announced.has(i) ? streamed?.[i] : undefined));
          if (!output.includes(undefined)) payload = { ...event, response: { ...event!.response, output } };
        }
        inner.feed(payload, emit);
        if (type === 'response.output_item.added') announced.add(event!.output_index!);
        if (type === 'response.output_item.done') done.set(event!.output_index!, event!.item);
      },
      finish: (emit) => inner.finish(emit),
      snapshot: () => inner.snapshot(),
      meters: () => inner.meters(),
      serviceTier: () => inner.serviceTier(),
    };
  }

  protected override headers(): Record<string, string> {
    if (Date.now() < this.account.pausedUntil)
      throw new LLMError('ChatGPT plan usage limit reached; requests are paused', 429, JSON.stringify({ error: { code: USAGE_LIMIT } }));
    return { ...super.headers(), Authorization: `Bearer ${this.token}` };
  }

  /** Cortico calls this after a 401 or a 403 without the body, so a 403 such as `subscription_sharing_user_not_eligible` also costs one refresh. */
  protected override async onAuthError(): Promise<boolean> {
    try {
      this.token = await this.account.accessToken(this.token);
      return true;
    } catch {
      return false;
    }
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const body = super.buildResponseBody(request, options);
    for (const key of UNSUPPORTED) delete body[key];
    return namespaced(body);
  }
}
