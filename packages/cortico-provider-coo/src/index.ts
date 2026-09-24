/**
 * DeepSeek as a Cortico provider. Requests go to DeepSeek's Responses endpoint
 * (`POST https://api.deepseek.com/responses`), stateless, with past reasoning replayed as plain
 * text: DeepSeek returns readable reasoning and no encrypted blocks, and rejects tool-call turns
 * whose earlier reasoning is missing.
 *
 * Thinking is a four-step choice: off sends `reasoning.effort = none`, the others low / high /
 * max. Images are sent only when the endpoint is marked multimodal and the model reads them
 * (`deepseek-flash`); tool results may carry images too.
 */
import type { ProviderModule, ProviderInstance } from 'cortico/providers/base.ts';
import type { LLMProviderEntry, ReasoningTier } from 'cortico/core/types.ts';
import { isContextOverflow } from 'cortico/providers/transport/errors.ts';
import { ModelCatalog, ResponsesProvider } from 'cortico/providers/openai-responses-compat/native.ts';
import { deepseekPrices } from './pricing.ts';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

/** Models whose input accepts images. */
const VISION = new Set(['deepseek-flash']);
/** Context windows DeepSeek states; `GET /models` does not report them. */
const CONTEXT_WINDOWS: Record<string, number> = { 'deepseek-flash': 1_000_000, 'deepseek-v4-pro': 1_000_000 };

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

const readsImages = (model: string | undefined) => VISION.has(model ?? '');

export const DEEPSEEK = {
  id: 'deepseek',
  title: 'DeepSeek',
  description: 'DeepSeek API (Responses endpoint).',
  localize: (language) => ({
    description: language === 'zh' ? 'DeepSeek 官方 API。deepseek-flash 能看图,思考可调四档。' : 'The DeepSeek API. deepseek-flash reads images; thinking has four levels.',
    reasoningTiers: TIERS[language],
  }),
  defaultBaseUrl: DEEPSEEK_BASE_URL,
  baseUrlSuggestions: [DEEPSEEK_BASE_URL],
  reasoningTiers: TIERS.en,
  serviceTiers: [],
  accepts: (entry, spec, mime) => entry.multimodal === true && mime.startsWith('image/') && readsImages(spec.model),
  prices: () => deepseekPrices(),
  contextOverflow: isContextOverflow,
  create(name: string, entry: LLMProviderEntry, host): ProviderInstance {
    const apiKey = entry.secret ? host.secret(entry.secret) : undefined;
    const current = () => host.currentEntry?.() ?? entry;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const catalog = new ModelCatalog(() => ({ baseUrl: entry.baseUrl, headers }));
    return {
      listModels: () => catalog.list(),
      contextWindow: (model) => CONTEXT_WINDOWS[model] ?? catalog.contextWindow(model),
      compatibilityKey: () => ['deepseek', name],
      client: new ResponsesProvider({
        baseUrl: entry.baseUrl,
        apiKey,
        log: host.log,
        media: { enabled: () => current().multimodal === true && readsImages(current().spec?.model), read: host.readBlob },
        keepThinking: host.keepThinking,
        reasoningReplay: 'plaintext',
      }),
    };
  },
} satisfies ProviderModule;

export default DEEPSEEK;
export { deepseekPrices, OFF_PEAK } from './pricing.ts';
