/**
 * Coo Pet Provider: one Cortico provider module for the model services Coo can talk through,
 * DeepSeek first. Every service here is reached through its OpenAI-compatible Responses endpoint
 * (`POST <baseUrl>/responses`), stateless, with past reasoning replayed as plain text, the way
 * DeepSeek wants it; the other services are assumed to take the same requests, which only DeepSeek's
 * have been tried with. Which service an endpoint is comes from its base URL (`vendorOf`), so an
 * endpoint is plain Cortico config and nothing else is stored.
 *
 * Thinking is a four-step choice: off sends `reasoning.effort = none`, the others low / high /
 * max, each rewritten to the value a service documents where it takes other ones (`Vendor.effort`).
 * Images are sent only when the endpoint is marked multimodal and the service lists the model as
 * reading them; tool results may carry images too. Prices are built in for DeepSeek only.
 */
import type { ProviderModule, ProviderInstance } from 'cortico/providers/base.ts';
import type { LLMProviderEntry, ReasoningTier } from 'cortico/core/types.ts';
import { isContextOverflow } from 'cortico/providers/transport/errors.ts';
import { ModelCatalog, ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { GenerateOptions } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { deepseekPrices } from './pricing.ts';
import { VENDORS, vendorOf, type Effort, type Vendor } from './vendors.ts';

const TIERS = {
  zh: [
    { id: 'off', label: '不思考', thinking: false },
    { id: 'low', label: '思考 · 快', thinking: true, effort: 'low' },
    { id: 'high', label: '思考 · 标准', thinking: true, effort: 'high' },
    { id: 'max', label: '思考 · 最深', thinking: true, effort: 'max' },
  ],
  en: [
    { id: 'off', label: 'No thinking', thinking: false },
    { id: 'low', label: 'Thinking · fast', thinking: true, effort: 'low' },
    { id: 'high', label: 'Thinking · standard', thinking: true, effort: 'high' },
    { id: 'max', label: 'Thinking · deepest', thinking: true, effort: 'max' },
  ],
} satisfies Record<string, ReasoningTier[]>;

const readsImages = (entry: LLMProviderEntry, model: string | undefined) => !!model && (vendorOf(entry.baseUrl)?.vision ?? []).includes(model);

/** The Responses client with the thinking level rewritten to the value the service takes (`Vendor.effort`). */
class VendorResponses extends ResponsesProvider {
  constructor(opts: ResponsesProviderOptions, private readonly effort: Vendor['effort']) {
    super(opts);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const body = super.buildResponseBody(request, options);
    const reasoning = body.reasoning as { effort?: string } | undefined;
    const level = reasoning?.effort as Effort | undefined;
    if (!this.effort || !level || !(level in this.effort)) return body;
    const to = this.effort[level];
    if (to === null || to === undefined) delete body.reasoning;
    else body.reasoning = { ...reasoning, effort: to };
    return body;
  }
}

export const COO = {
  id: 'coo',
  title: 'Coo Pet Provider',
  description: 'DeepSeek, Qwen, Kimi, GLM, Doubao, Baidu Qianfan, MiniMax, StepFun and OpenRouter through their Responses endpoints.',
  localize: (language) => ({
    description: language === 'zh'
      ? `一个模块接 ${VENDORS.map((v) => v.name).join('、')};按接口地址认是哪一家。思考可调四档。`
      : `One module for ${VENDORS.map((v) => v.nameEn).join(', ')}; the base URL tells which service it is. Thinking has four levels.`,
    reasoningTiers: TIERS[language],
  }),
  defaultBaseUrl: VENDORS[0]!.baseUrl,
  baseUrlSuggestions: VENDORS.map((v) => v.baseUrl),
  reasoningTiers: TIERS.en,
  serviceTiers: [],
  accepts: (entry, spec, mime) => entry.multimodal === true && mime.startsWith('image/') && readsImages(entry, spec.model),
  prices: (entry) => (vendorOf(entry.baseUrl)?.id === 'deepseek' ? deepseekPrices() : []),
  contextOverflow: isContextOverflow,
  create(name: string, entry: LLMProviderEntry, host): ProviderInstance {
    const apiKey = entry.secret ? host.secret(entry.secret) : undefined;
    const current = () => host.currentEntry?.() ?? entry;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const catalog = new ModelCatalog(() => ({ baseUrl: entry.baseUrl, headers }));
    const vendor = vendorOf(entry.baseUrl);
    return {
      listModels: () => catalog.list(),
      contextWindow: (model) => vendor?.contextWindows?.[model] ?? catalog.contextWindow(model),
      compatibilityKey: () => [vendor?.id ?? 'coo', name],
      client: new VendorResponses({
        baseUrl: entry.baseUrl,
        apiKey,
        log: host.log,
        media: { enabled: () => current().multimodal === true && readsImages(current(), current().spec?.model), read: host.readBlob },
        keepThinking: host.keepThinking,
        reasoningReplay: 'plaintext',
      }, vendor?.effort),
    };
  },
} satisfies ProviderModule;

export default COO;
export { deepseekPrices, OFF_PEAK } from './pricing.ts';
export { VENDORS, vendorById, vendorEntry, vendorOf, type Vendor } from './vendors.ts';
export { VENDOR_ICONS } from './icons.ts';
