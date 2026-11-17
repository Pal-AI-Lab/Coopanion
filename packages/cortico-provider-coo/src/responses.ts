import { ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import type { GenerateOptions, Generation } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import type { ContextRecord } from 'cortico/protocol/open-responses/context.ts';
import type { CompatMediaOptions } from 'cortico/providers/transport/history.ts';
import { imagesAfterResults, type Message, type ResultFormat } from './chat.ts';
import { sinceLastDelivery } from './context.ts';
import { LenientReasoningAssembly } from './stream.ts';
import type { EffortMap } from './vendors.ts';

export interface VendorQuirks {
  /** The effort values the service takes for a model, where they differ from the levels. */
  effort?: (model: string) => EffortMap | undefined;
  lenientReasoning?: true;
  nonStreamingResponses?: true;
  toolOutputText?: true;
  /** Audio attachments go as `input_audio` parts; see `withAudio`. */
  audio?: CompatMediaOptions;
}

/** Audio types a Responses service with `audioInput` takes, keyed by the type an attachment may carry and mapped to the one it is sent as. */
const AUDIO_MIME: Readonly<Record<string, string>> = {
  'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav',
  'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg',
  'audio/aac': 'audio/aac', 'audio/x-m4a': 'audio/x-m4a', 'audio/m4a': 'audio/x-m4a',
};

/** The type an audio attachment goes out as, or null when it is not sent. */
export function responsesAudioMime(mime: string): string | null {
  return AUDIO_MIME[mime.toLowerCase()] ?? null;
}

type Part = Record<string, unknown>;

/**
 * Audio attachments as `input_audio` parts, the bytes inline in a data URL in `audio_url`
 * (Cortico's Responses input adds only images). A user message carries its own in its content; a
 * tool result's go in a user message after its run of results, keyed here by `call_id`.
 */
function withAudio(context: readonly ContextRecord[], media: CompatMediaOptions): { context: readonly ContextRecord[]; results: Map<string, Part[]> } {
  const results = new Map<string, Part[]>();
  if (!media.enabled()) return { context, results };
  const out = context.map((entry) => {
    const { item } = entry;
    if (item.type !== 'message' && item.type !== 'function_call_output') return entry;
    const parts: Part[] = [];
    for (const ref of entry.context.blobs ?? []) {
      const mime = responsesAudioMime(ref.mime);
      const bytes = mime ? media.read(ref.handle) : null;
      if (bytes) parts.push({ type: 'input_audio', audio_url: `data:${mime};base64,${bytes.toString('base64')}` });
    }
    if (!parts.length) return entry;
    if (item.type === 'function_call_output') {
      results.set(item.call_id, parts);
      return entry;
    }
    const text = typeof item.content === 'string' ? [{ type: 'input_text', text: item.content }] : [...item.content as Part[]];
    return { ...entry, item: { ...item, content: [...text, ...parts] } as typeof item };
  });
  return { context: out, results };
}

/** `input` with each run of tool results followed by a user message holding their audio. */
function audioAfterResults(input: readonly Part[], results: Map<string, Part[]>): Part[] {
  if (!results.size) return [...input];
  const out: Part[] = [];
  let audio: Part[] = [];
  const flush = () => {
    if (audio.length) out.push({ type: 'message', role: 'user', content: audio });
    audio = [];
  };
  for (const item of input) {
    if (item.type !== 'function_call_output') flush();
    out.push(item);
    if (item.type === 'function_call_output') audio.push(...results.get(String(item.call_id)) ?? []);
  }
  flush();
  return out;
}

const RESPONSES_RESULTS: ResultFormat = {
  isResult: (item) => item.type === 'function_call_output', field: 'output', text: 'input_text', image: 'input_image', user: { type: 'message', role: 'user' },
};

/**
 * The Responses client with the thinking level rewritten to the value the service takes for the model
 * (`effort`), images and audio limited to the newest batch (`sinceLastDelivery`) and, with `audio`, audio
 * attachments sent as `input_audio` (`withAudio`); a `lenientReasoning`
 * service's stream goes through `LenientReasoningAssembly`, and a `toolOutputText` service's tool
 * results send their images in a user message after them, as on Chat.
 */
export class VendorResponses extends ResponsesProvider {
  constructor(opts: ResponsesProviderOptions, private readonly quirks: VendorQuirks) {
    super(opts);
  }

  /** Fallback for premature item.done events and terminal item revisions: Core executes only the full response's tools. */
  override respond(request: Request, options: GenerateOptions = {}): Promise<Generation> {
    return super.respond(request, this.quirks.nonStreamingResponses ? { ...options, onEvent: undefined } : options);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const recent = options.context && sinceLastDelivery(options.context);
    const audio = recent && this.quirks.audio ? withAudio(recent, this.quirks.audio) : null;
    const body = super.buildResponseBody(request, recent ? { ...options, context: audio?.context ?? recent } : options);
    if (this.quirks.toolOutputText) body.input = imagesAfterResults(body.input as Message[], RESPONSES_RESULTS);
    if (audio) body.input = audioAfterResults(body.input as Part[], audio.results);
    const reasoning = body.reasoning as { effort?: string } | undefined;
    const level = reasoning?.effort;
    const effort = this.quirks.effort?.(request.model ?? '');
    if (!effort || !level || !(level in effort)) return body;
    const to = effort[level as keyof EffortMap];
    if (to === null || to === undefined) delete body.reasoning;
    else body.reasoning = { ...reasoning, effort: to };
    return body;
  }

  protected override responseAssembly(): ResponseAssembly {
    return this.quirks.lenientReasoning ? new LenientReasoningAssembly() : super.responseAssembly();
  }
}
