/**
 * Coo Pet Provider: one Cortico provider module for the model services Coo can talk through. Which
 * service and platform an endpoint is comes from its base URL (`locate`), and the platform decides
 * the protocol (`Site.protocol`): OpenAI-compatible Responses (stateless, past reasoning replayed as
 * plain text, or as the signed blocks for `encryptedReasoning` services) or Chat Completions,
 * Anthropic's Messages API, or the Gemini API. `options.protocol` overrides it; an endpoint on any
 * other URL uses Responses without it. An endpoint is plain Cortico config and nothing else is stored.
 *
 * Thinking is a four-step choice: off sends `reasoning.effort = none`, the others low / high /
 * max, each rewritten to the value a service documents where it takes other ones (`effortOf`); the
 * Messages and Gemini APIs get the levels in their own form. Images are sent only when the endpoint
 * is marked multimodal and, for a listed service, the service lists the model as reading them; tool
 * results may carry images too, which move to a user message after the results on Chat and for
 * `toolOutputText` services on Responses. Images go out only from the newest delivered batch of events on
 * (`sinceLastDelivery`). Prices are built in for DeepSeek, OpenAI, Anthropic, Gemini and xAI.
 * Streamed reasoning from services marked `lenientReasoning` is rewritten into standard events
 * (`LenientReasoningAssembly`). `nonStreamingResponses` services use a non-streaming fallback so
 * tools execute only after the complete response has been read and validated.
 */
import type { ProviderModule, ProviderInstance } from 'cortico/providers/base.ts';
import type { LLMProviderEntry, ReasoningTier } from 'cortico/core/types.ts';
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { Language } from 'cortico/core/language.ts';
import { isContextOverflow } from 'cortico/providers/transport/errors.ts';
import { ModelCatalog } from 'cortico/providers/openai-responses-compat/native.ts';
import { ClaudeProvider } from './anthropic/client.ts';
import { VendorChat } from './chat.ts';
import { GeminiProvider, listGeminiModels } from './gemini/client.ts';
import { vendorPrices } from './pricing.ts';
import { VendorResponses } from './responses.ts';
import { cooText } from './strings.ts';
import { PROTOCOLS, VENDORS, effortOf, locate, siteOf, vendorOf, vendorName, type Language as VendorLanguage, type Protocol } from './vendors.ts';

/** vendors.ts spells out Cortico's `Language`; this stops compiling when the two differ. */
const SAME_LANGUAGES: [Language, VendorLanguage] extends [VendorLanguage, Language] ? true : never = true;

type CooText = ReturnType<typeof cooText>;

/** The four thinking levels, labelled from `t`. */
const tiers = (t: CooText['tiers']): ReasoningTier[] => [
  { id: 'off', label: t.off, thinking: false },
  { id: 'low', label: t.low, thinking: true, effort: 'low' },
  { id: 'high', label: t.high, thinking: true, effort: 'high' },
  { id: 'max', label: t.max, thinking: true, effort: 'max' },
];

export interface CooOptions {
  /** Unset: the listed service's own protocol, Responses for any other URL. */
  protocol?: Protocol;
}

const cooOptions = (entry: LLMProviderEntry): CooOptions => (entry.options ?? {}) as CooOptions;

export const protocolOf = (entry: LLMProviderEntry): Protocol =>
  cooOptions(entry).protocol ?? locate(entry.baseUrl)?.site.protocol ?? 'responses';

/** A listed service reads images on the models it lists; any other URL on every model. */
function readsImages(entry: LLMProviderEntry, model: string | undefined): boolean {
  if (!model) return false;
  const vendor = vendorOf(entry.baseUrl);
  return vendor ? (vendor.vision ?? []).includes(model) : true;
}

/** The Messages API states an oversized prompt as `prompt is too long`, the Gemini API as a token count over the maximum. */
function contextOverflow(error: { status: number; body: string }): boolean {
  return isContextOverflow(error)
    || (error.status === 400 && /prompt is too long|exceeds? the (model's )?context|input token count.*exceeds the maximum/i.test(error.body));
}

function optionsGroup(name: string, t: CooText): ConfigGroup {
  return {
    id: `llm.coo.${name}`,
    owner: 'provider:coo',
    schema: {
      type: 'object', title: name,
      properties: {
        [`providers.${name}.options.protocol`]: {
          type: 'string', enum: [...PROTOCOLS], title: t.protocol, description: t.protocolHint,
        },
      },
    },
  };
}

function normalize(entry: LLMProviderEntry): LLMProviderEntry {
  const options: Record<string, unknown> = { ...entry.options };
  if (options.protocol === '') delete options.protocol;
  return { ...entry, options };
}

export const COO = {
  id: 'coo',
  title: 'Coo Pet Provider',
  description: 'DeepSeek, Qwen, Kimi, GLM, Doubao, MiniMax, StepFun, Baidu Qianfan, OpenRouter, OpenAI, Anthropic, Gemini and xAI.',
  localize: (language) => {
    const t = cooText(language);
    return { description: t.description(VENDORS.map((v) => vendorName(v, language))), reasoningTiers: tiers(t.tiers) };
  },
  defaultBaseUrl: siteOf(VENDORS[0]!, 'cn').baseUrl,
  baseUrlSuggestions: VENDORS.flatMap((v) => Object.values(v.sites).map((s) => s.baseUrl)),
  reasoningTiers: tiers(cooText('en').tiers),
  serviceTiers: [],
  normalize,
  config: (name, _entry, language) => [optionsGroup(name, cooText(language))],
  validateEntry: (entry, language) => {
    const { protocol } = cooOptions(entry);
    if (protocol !== undefined && !PROTOCOLS.includes(protocol))
      throw new Error(cooText(language).badProtocol(PROTOCOLS.join(' / ')));
  },
  accepts: (entry, spec, mime) => entry.multimodal === true && mime.startsWith('image/') && readsImages(entry, spec.model),
  prices: (entry, _request, at) => vendorPrices(vendorOf(entry.baseUrl)?.id, at.startedAt),
  contextOverflow,
  create(name: string, entry: LLMProviderEntry, host): ProviderInstance {
    const apiKey = entry.secret ? host.secret(entry.secret) : undefined;
    const current = () => host.currentEntry?.() ?? entry;
    const located = locate(entry.baseUrl);
    const vendor = located?.vendor ?? null;
    const protocol = protocolOf(entry);
    const media = { enabled: () => current().multimodal === true && readsImages(current(), current().spec?.model), read: host.readBlob };
    const compatibilityKey = () => [vendor?.id ?? 'coo', name, ...(protocol === 'responses' ? [] : [protocol])];
    const stated = (model: string) => vendor?.contextWindows?.[model];
    // the listing carries the windows the vendor table states, so the console fills them in instead of asking
    const withStated = <M extends { id: string; contextWindow?: number }>(models: M[]) =>
      models.map((model) => (stated(model.id) ? { ...model, contextWindow: stated(model.id) } : model));

    if (protocol === 'anthropic') {
      const client = new ClaudeProvider({ baseUrl: entry.baseUrl, apiKey, keepThinking: host.keepThinking, log: host.log, media });
      const windows = new Map<string, number | undefined>();
      return {
        client, compatibilityKey,
        contextWindow: (model) => stated(model) ?? windows.get(model),
        listModels: async () => {
          const models = [];
          for await (const model of client.client().models.list()) {
            const row = model as typeof model & { max_input_tokens?: number; max_tokens?: number };
            windows.set(model.id, row.max_input_tokens);
            models.push({ id: model.id, displayName: model.display_name,
              ...(row.max_input_tokens ? { contextWindow: row.max_input_tokens } : {}), ...(row.max_tokens ? { maxOutputTokens: row.max_tokens } : {}) });
          }
          return withStated(models);
        },
      };
    }
    if (protocol === 'gemini') {
      const windows = new Map<string, number | undefined>();
      return {
        client: new GeminiProvider({ baseUrl: entry.baseUrl, apiKey, media, keepThinking: host.keepThinking, log: host.log }),
        compatibilityKey,
        contextWindow: (model) => stated(model) ?? windows.get(model),
        listModels: async () => {
          const models = await listGeminiModels(entry.baseUrl, apiKey ?? '');
          for (const model of models) windows.set(model.id, model.contextWindow);
          return withStated(models);
        },
      };
    }
    const effort = (model: string) => (located ? effortOf(located.vendor, located.site, model) : undefined);
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const catalog = new ModelCatalog(() => ({ baseUrl: entry.baseUrl, headers }));
    return {
      listModels: async () => withStated(await catalog.list()),
      contextWindow: (model) => stated(model) ?? catalog.contextWindow(model),
      compatibilityKey,
      client: protocol === 'chat'
        ? new VendorChat({ baseUrl: entry.baseUrl, apiKey, media, keepThinking: host.keepThinking, log: host.log, effort })
        : new VendorResponses({
          baseUrl: entry.baseUrl,
          apiKey,
          log: host.log,
          media,
          keepThinking: host.keepThinking,
          reasoningReplay: vendor?.encryptedReasoning ? 'encrypted' : 'plaintext',
        }, { effort, lenientReasoning: vendor?.lenientReasoning, nonStreamingResponses: vendor?.nonStreamingResponses, toolOutputText: vendor?.toolOutputText }),
    };
  },
} satisfies ProviderModule;

export default COO;
export { anthropicPrices, deepseekPrices, vendorPrices, OFF_PEAK } from './pricing.ts';
export {
  VENDORS, defaultRegion, endpointName, firstVendor, localized, locate, regionsOf, siteOf, vendorById, vendorEntry, vendorName, vendorOf, vendorsFor,
  type Language, type Localized, type Protocol, type Region, type Site, type Vendor,
} from './vendors.ts';
export { VENDOR_ICONS } from './icons.ts';
