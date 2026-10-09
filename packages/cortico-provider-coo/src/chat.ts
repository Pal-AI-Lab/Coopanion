/**
 * Chat Completions client (`POST <baseUrl>/chat/completions`) for the platforms whose Responses
 * endpoint is missing or takes no images, and for other URLs set to `chat`. The thinking level goes out as
 * `reasoning_effort`, rewritten where the platform takes other values; past reasoning goes back as
 * `reasoning_content` while thinking is on, past turns' only while `keepThinking` holds. Images are
 * limited to the newest delivered batch (`sinceLastDelivery`), and images in tool results move to a
 * user message right after the results, since Chat takes images in user messages only.
 */
import type { NativeChatMessage } from 'cortico/providers/transport/native-types.ts';
import type { Logger, ModelSpec, ToolSchema } from 'cortico/core/types.ts';
import type { GenerateOptions } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { nullLogger } from 'cortico/core/util.ts';
import { OpenAIHttpClient } from 'cortico/providers/transport/chat.ts';
import { dropPastThinking, mapTools, renderMessagesWithMedia, type CompatMediaOptions } from 'cortico/providers/transport/history.ts';
import { sinceLastDelivery } from './context.ts';
import type { Effort, EffortMap } from './vendors.ts';

export interface VendorChatOptions {
  baseUrl: string;
  apiKey?: string;
  media?: CompatMediaOptions;
  keepThinking?: () => boolean;
  log?: Logger;
  /** The effort values the platform takes for a model, where they differ from the levels. */
  effort?: (model: string) => EffortMap | undefined;
}

/** Text of a tool result that held images only, once they move to the next user message. */
export const IMAGE_RESULT = '[image]';

export type Message = Record<string, unknown>;

/** How a protocol writes tool results, their text and image parts, and a user message. */
export interface ResultFormat {
  isResult: (m: Message) => boolean;
  /** The field of a tool result that holds its parts. */
  field: string;
  text: string;
  image: string;
  /** A user message's fields besides `content`. */
  user: Message;
}

const CHAT_RESULTS: ResultFormat = { isResult: (m) => m.role === 'tool', field: 'content', text: 'text', image: 'image_url', user: { role: 'user' } };

/** Image parts of tool results moved into one user message after each run of tool results. */
export function imagesAfterResults(messages: readonly Message[], format: ResultFormat = CHAT_RESULTS): Message[] {
  const out: Message[] = [];
  let images: Message[] = [];
  const flush = () => {
    if (images.length) out.push({ ...format.user, content: images });
    images = [];
  };
  for (const m of messages) {
    const result = format.isResult(m);
    if (!result) flush();
    const parts = result && Array.isArray(m[format.field]) ? m[format.field] as Message[] : null;
    if (!parts?.some((p) => p.type === format.image)) { out.push(m); continue; }
    const text = parts.filter((p) => p.type === format.text).map((p) => String(p.text ?? '')).join('\n');
    out.push({ ...m, [format.field]: text || IMAGE_RESULT });
    images.push(...parts.filter((p) => p.type === format.image));
  }
  flush();
  return out;
}

/** `reasoning_effort` for `spec`: `none` with thinking off, else the level; `effort` rewrites a level, null leaves the field out. */
export function reasoningEffort(spec: ModelSpec, effort: EffortMap = {}): Record<string, unknown> {
  const level = spec.thinking ? spec.reasoningEffort : 'none';
  const value = level && level in effort ? effort[level as Effort] : level;
  return value ? { reasoning_effort: value } : {};
}

export class VendorChat extends OpenAIHttpClient {
  constructor(private readonly opts: VendorChatOptions) {
    super(opts.baseUrl, opts.log ?? nullLogger());
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    return super.buildResponseBody(request, options.context ? { ...options, context: sinceLastDelivery(options.context) } : options);
  }

  protected buildBody(spec: ModelSpec, messages: NativeChatMessage[], tools?: ToolSchema[]): Record<string, unknown> {
    const history = this.opts.keepThinking?.() === false ? dropPastThinking(messages) : messages;
    const body: Record<string, unknown> = {
      model: spec.model,
      messages: imagesAfterResults(renderMessagesWithMedia(history, this.opts.media, { keepReasoning: spec.thinking })),
      ...reasoningEffort(spec, this.opts.effort?.(spec.model)),
    };
    if (spec.temperature !== undefined) body.temperature = spec.temperature;
    if (spec.maxTokens !== undefined) body.max_tokens = spec.maxTokens;
    const mapped = mapTools(tools);
    if (mapped) body.tools = mapped;
    return body;
  }

  protected headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}) };
  }
}
