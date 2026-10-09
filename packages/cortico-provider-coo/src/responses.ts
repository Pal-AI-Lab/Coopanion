import { ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { ResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';
import type { GenerateOptions } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { sinceLastDelivery } from './context.ts';
import { LenientReasoningAssembly } from './stream.ts';
import type { EffortMap } from './vendors.ts';

export interface VendorQuirks {
  /** The effort values the service takes for a model, where they differ from the levels. */
  effort?: (model: string) => EffortMap | undefined;
  lenientReasoning?: true;
}

/**
 * The Responses client with the thinking level rewritten to the value the service takes for the model
 * (`effort`) and images limited to the newest batch (`sinceLastDelivery`); a `lenientReasoning`
 * service's stream goes through `LenientReasoningAssembly`.
 */
export class VendorResponses extends ResponsesProvider {
  constructor(opts: ResponsesProviderOptions, private readonly quirks: VendorQuirks) {
    super(opts);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const body = super.buildResponseBody(request, options.context ? { ...options, context: sinceLastDelivery(options.context) } : options);
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
