/**
 * A provider module whose model is scripted: registered in Cortico's provider registry, it answers
 * each request with `reply(request)` and records what it was given. Everything around it (the
 * endpoint table, the endpoint `.env`, request building) is Cortico's own.
 */
import type { ProviderAttempt } from 'cortico/core/generation.ts';
import type { ProviderModule } from 'cortico/providers/base.ts';
import { createResponse, type Request } from 'cortico/protocol/open-responses/index.ts';

export const SCRIPTED_KIND = 'biliscript-scripted';

export interface ScriptedCall {
  request: Request;
  /** The key the module read through the endpoint's secret chain. */
  apiKey: string;
}

export function scriptedProvider(reply: (request: Request) => string): { module: ProviderModule; calls: ScriptedCall[] } {
  const calls: ScriptedCall[] = [];
  const module: ProviderModule = {
    id: SCRIPTED_KIND,
    title: 'Scripted',
    reasoningTiers: [],
    serviceTiers: [],
    create(_name, entry, host) {
      const apiKey = entry.secret ? host.secret(entry.secret) : '';
      return {
        client: {
          async respond(request) {
            calls.push({ request, apiKey });
            const response = createResponse(`resp_${calls.length}`, request);
            response.status = 'completed';
            response.output = [
              {
                type: 'message',
                id: `msg_${calls.length}`,
                status: 'completed',
                role: 'assistant',
                content: [{ type: 'output_text', text: reply(request), annotations: [] }],
              } as (typeof response.output)[number],
            ];
            const attempt = {
              meters: { input: 100, output: 20, total: 120, cachedInput: 0, uncachedInput: 100, reasoning: 0, native: null },
              charges: [],
            } as unknown as ProviderAttempt;
            return { response, origin: { instance: _name, module: SCRIPTED_KIND, model: request.model ?? '', compatibilityDomain: '' }, attempts: [attempt] };
          },
        },
      };
    },
  };
  return { module, calls };
}
