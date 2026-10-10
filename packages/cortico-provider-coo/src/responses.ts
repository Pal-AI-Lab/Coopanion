import { ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import type { GenerateOptions, Generation } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
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
}

const RESPONSES_RESULTS: ResultFormat = {
  isResult: (item) => item.type === 'function_call_output', field: 'output', text: 'input_text', image: 'input_image', user: { type: 'message', role: 'user' },
};

/**
 * The Responses client with the thinking level rewritten to the value the service takes for the model
 * (`effort`) and images limited to the newest batch (`sinceLastDelivery`); a `lenientReasoning`
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
    const body = super.buildResponseBody(request, options.context ? { ...options, context: sinceLastDelivery(options.context) } : options);
    if (this.quirks.toolOutputText) body.input = imagesAfterResults(body.input as Message[], RESPONSES_RESULTS);
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
