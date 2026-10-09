/**
 * The model services Coo Pet Provider offers. `id` doubles as the name of the service's endpoint in
 * the app (`endpointName`), and `secret` as the name its key is stored under. A service either has
 * one platform for everyone, or a mainland China platform and an international one (`Region`), each
 * with its own accounts, keys and base URL. Base URLs, protocols, starting models, key pages, image
 * input, context windows and thinking levels are from each service's own documentation (Chinese
 * services' mainland platforms read 2026-09-24, everything else 2026-10-08); only DeepSeek and
 * Anthropic have been tried with a key.
 *
 * This file imports nothing, so the browser console and the app's first-run seed can use it.
 */

/** The four thinking levels the provider offers; see `TIERS` in index.ts. */
export type Effort = 'none' | 'low' | 'high' | 'max';

/** The effort value a service takes for each level where it differs; null leaves the effort out. */
export type EffortMap = Partial<Record<Effort, string | null>>;

/**
 * How requests are sent: `responses` is `POST <baseUrl>/responses`, `chat` is
 * `POST <baseUrl>/chat/completions`, `anthropic` is the Messages API at `<baseUrl>/v1/messages`,
 * `gemini` is the Gemini API at `<baseUrl>/models/<model>:generateContent`.
 */
export type Protocol = 'responses' | 'chat' | 'anthropic' | 'gemini';
export const PROTOCOLS: readonly Protocol[] = ['responses', 'chat', 'anthropic', 'gemini'];

/** A service's mainland China platform or its international one. */
export type Region = 'cn' | 'intl';
export const REGIONS: readonly Region[] = ['cn', 'intl'];

/** The languages the app's text comes in. */
export type Language = 'zh' | 'zh-Hant' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es-419' | 'pt-BR' | 'it' | 'ru';

/** Text in Chinese and English, and in other languages where it differs; see `localized`. */
export type Localized = { zh: string; en: string } & Partial<Record<Language, string>>;

/** `text` in `language`: traditional Chinese falls back to simplified, every other language to English. */
export function localized(text: Localized, language: Language): string {
  return text[language] ?? (language === 'zh-Hant' ? text.zh : text.en);
}

export interface Site {
  /** The URL the protocol's paths follow. */
  baseUrl: string;
  protocol: Protocol;
  /** Where a key is created. */
  keyUrl: string;
  /** Replaces `Vendor.effort` on this platform. */
  effort?: EffortMap;
}

export interface Vendor {
  id: string;
  /** Shown to the person. */
  names: Localized;
  /** Placeholder of the key box: how the service's keys start. */
  keyHint: Localized;
  secret: string;
  sites: { global: Site } | Record<Region, Site>;
  /** The model a new endpoint starts with: a fast, cheap current model that reads images. */
  model: string;
  /** Other model names offered next to `model` where one is typed; any name the service takes works. */
  models?: readonly string[];
  /** Models that read images. */
  vision?: readonly string[];
  /** Context windows the service states, where its model list does not report them. */
  contextWindows?: Readonly<Record<string, number>>;
  /** Responses and Chat: the `reasoning.effort` / `reasoning_effort` value for each level where the service takes another one. */
  effort?: EffortMap;
  /** Replaces `effort` and `Site.effort` for these models. */
  modelEffort?: Readonly<Record<string, EffortMap>>;
  /** The service streams reasoning in Responses events the standard parser rejects; see `LenientReasoningAssembly`. */
  lenientReasoning?: true;
  /** Responses: past reasoning goes back as the signed blocks the service returned, not as text. */
  encryptedReasoning?: true;
}

const PASTE_KEY: Localized = { zh: '粘贴 API Key', 'zh-Hant': '貼上 API Key', en: 'Paste the API key', ja: 'API キーを貼り付け', ko: 'API 키 붙여넣기' };
const brand = (name: string): Localized => ({ zh: name, en: name });
const hint = (prefix: string): Localized => brand(`${prefix}…`);

/** In the order the app lists them for Chinese; `vendorsFor` gives the order for each language. */
export const VENDORS: readonly Vendor[] = [
  {
    id: 'deepseek', names: brand('DeepSeek'), keyHint: hint('sk-'), secret: 'DEEPSEEK_API_KEY',
    sites: { global: { baseUrl: 'https://api.deepseek.com', protocol: 'responses', keyUrl: 'https://platform.deepseek.com/api_keys' } },
    model: 'deepseek-flash', models: ['deepseek-v4-pro'],
    vision: ['deepseek-flash'], contextWindows: { 'deepseek-flash': 1_000_000, 'deepseek-v4-pro': 1_000_000 },
  },
  {
    // Qwen3.8 takes none / low / medium / xhigh; qwen3.7-flash is cheaper up to 32K input. Both
    // platforms serve the same models; the international one is Singapore.
    id: 'qwen', names: { zh: '通义千问', 'zh-Hant': '通義千問', en: 'Qwen', ja: 'Qwen', ko: 'Qwen' }, keyHint: hint('sk-'), secret: 'QWEN_API_KEY',
    sites: {
      cn: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'responses', keyUrl: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key' },
      intl: { baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', protocol: 'responses', keyUrl: 'https://modelstudio.console.alibabacloud.com/ap-southeast-1/model/settings/api-key' },
    },
    model: 'qwen3.8-flash', models: ['qwen3.7-flash', 'qwen3.8-max'],
    vision: ['qwen3.8-flash', 'qwen3.7-flash', 'qwen3.8-max'], contextWindows: { 'qwen3.8-flash': 1_000_000 },
    effort: { high: 'medium', max: 'xhigh' },
    lenientReasoning: true,
  },
  {
    // the Responses endpoints serve kimi-k3 only, which takes low / high / max
    id: 'kimi', names: brand('Kimi'), keyHint: hint('sk-'), secret: 'KIMI_API_KEY',
    sites: {
      cn: { baseUrl: 'https://api.moonshot.cn/v1', protocol: 'responses', keyUrl: 'https://platform.kimi.com/console/api-keys' },
      intl: { baseUrl: 'https://api.moonshot.ai/v1', protocol: 'responses', keyUrl: 'https://platform.kimi.ai/console/api-keys' },
    },
    model: 'kimi-k3',
    vision: ['kimi-k3'], contextWindows: { 'kimi-k3': 1_048_576 },
    effort: { none: 'low' },
  },
  {
    // The mainland Responses endpoint is under /api/v1, not the chat path /api/paas/v4; its docs show
    // glm-5.3 only (text), so the flash models there are not confirmed. Z.ai documents Chat only, where
    // glm-5.3 and glm-5.3-flash cannot turn thinking off and take low / high / max.
    id: 'glm', names: { zh: '智谱 GLM', 'zh-Hant': '智譜 GLM', en: 'Zhipu GLM', ja: 'Zhipu GLM', ko: 'Zhipu GLM' }, keyHint: PASTE_KEY, secret: 'GLM_API_KEY',
    sites: {
      cn: { baseUrl: 'https://open.bigmodel.cn/api/v1', protocol: 'responses', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys' },
      intl: { baseUrl: 'https://api.z.ai/api/paas/v4', protocol: 'chat', keyUrl: 'https://z.ai/manage-apikey/apikey-list', effort: { none: 'low' } },
    },
    model: 'glm-5.3-flash', models: ['glm-5.3', 'glm-4.6v-flash'],
    vision: ['glm-5.3-flash', 'glm-4.6v-flash', 'glm-4.6v-flashx'], contextWindows: { 'glm-5.3': 1_000_000 },
  },
  {
    // the model is used by its id, after it is switched on under 开通管理 in the Ark console
    id: 'doubao', names: { zh: '豆包', 'zh-Hant': '豆包', en: 'Doubao', ja: 'Doubao', ko: 'Doubao' }, keyHint: PASTE_KEY, secret: 'DOUBAO_API_KEY',
    sites: { global: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', protocol: 'responses', keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey' } },
    model: 'doubao-seed-2-1-lite-260915', models: ['doubao-seed-2-0-mini-260428'],
    vision: ['doubao-seed-2-1-lite-260915', 'doubao-seed-2-0-mini-260428'],
  },
  {
    // takes none / minimal / low / medium / high; on MiniMax-M3 any level but none turns reasoning on without setting its depth
    id: 'minimax', names: brand('MiniMax'), keyHint: PASTE_KEY, secret: 'MINIMAX_API_KEY',
    sites: {
      cn: { baseUrl: 'https://api.minimax.cn/v1', protocol: 'responses', keyUrl: 'https://platform.minimax.cn/user-center/basic-information/interface-key' },
      intl: { baseUrl: 'https://api.minimax.io/v1', protocol: 'responses', keyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key' },
    },
    model: 'MiniMax-M3', models: ['MiniMax-M2.7'],
    vision: ['MiniMax-M3'], contextWindows: { 'MiniMax-M3': 1_000_000 },
    effort: { max: 'high' },
  },
  {
    // takes low / medium / high
    id: 'stepfun', names: { zh: '阶跃星辰', 'zh-Hant': '階躍星辰', en: 'StepFun', ja: 'StepFun', ko: 'StepFun' }, keyHint: PASTE_KEY, secret: 'STEPFUN_API_KEY',
    sites: { global: { baseUrl: 'https://api.stepfun.com/v1', protocol: 'responses', keyUrl: 'https://platform.stepfun.com/interface-key' } },
    model: 'step-3.7-flash', models: ['step-5-preview'],
    vision: ['step-3.7-flash', 'step-5-preview'],
    effort: { none: 'low', max: 'high' },
    lenientReasoning: true,
  },
  {
    // Qianfan's Responses endpoint lists no ERNIE model, none documented as reading images, and no effort
    id: 'qianfan', names: { zh: '百度千帆', 'zh-Hant': '百度千帆', en: 'Baidu Qianfan', ja: 'Baidu Qianfan', ko: 'Baidu Qianfan' }, keyHint: hint('bce-v3/'), secret: 'QIANFAN_API_KEY',
    sites: { global: { baseUrl: 'https://qianfan.baidubce.com/v2', protocol: 'responses', keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list' } },
    model: 'glm-5.1', models: ['glm-5', 'qwen3-235b-a22b-instruct-2507', 'deepseek-v4-pro'],
    effort: { none: null, low: null, high: null, max: null },
  },
  {
    id: 'openrouter', names: brand('OpenRouter'), keyHint: hint('sk-or-'), secret: 'OPENROUTER_API_KEY',
    sites: { global: { baseUrl: 'https://openrouter.ai/api/v1', protocol: 'responses', keyUrl: 'https://openrouter.ai/settings/keys' } },
    model: 'deepseek/deepseek-v4.1-flash',
    models: ['qwen/qwen3.7-flash', 'qwen/qwen3.8-flash', 'google/gemini-3.1-flash-lite', 'z-ai/glm-5.3-flash'],
    vision: ['deepseek/deepseek-v4.1-flash', 'qwen/qwen3.7-flash', 'qwen/qwen3.8-flash', 'google/gemini-3.1-flash-lite', 'z-ai/glm-5.3-flash'], contextWindows: { 'deepseek/deepseek-v4.1-flash': 1_048_576 },
  },
  {
    // gpt-6-luna takes none / low / medium / high / xhigh / max; the larger two have no none
    id: 'openai', names: brand('OpenAI'), keyHint: hint('sk-'), secret: 'OPENAI_API_KEY',
    sites: { global: { baseUrl: 'https://api.openai.com/v1', protocol: 'responses', keyUrl: 'https://platform.openai.com/settings/organization/api-keys' } },
    model: 'gpt-6-luna', models: ['gpt-6.1-sol', 'gpt-6-astra'],
    vision: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    contextWindows: { 'gpt-6-luna': 1_050_000, 'gpt-6.1-sol': 1_050_000, 'gpt-6-astra': 1_050_000 },
    modelEffort: { 'gpt-6.1-sol': { none: 'low' }, 'gpt-6-astra': { none: 'low' } },
    encryptedReasoning: true,
  },
  {
    // thinking and effort are sent in the Messages API's own form (`thinkingParams` in anthropic/wire.ts)
    id: 'anthropic', names: brand('Anthropic'), keyHint: hint('sk-ant-'), secret: 'ANTHROPIC_API_KEY',
    sites: { global: { baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', keyUrl: 'https://platform.claude.com/settings/keys' } },
    model: 'claude-haiku-5-5', models: ['claude-sonnet-5-5', 'claude-opus-5-5'],
    vision: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  },
  {
    // thinking is sent in the Gemini API's own form (`thinkingConfig` in gemini/wire.ts); the Pro model is a preview
    id: 'gemini', names: brand('Gemini'), keyHint: PASTE_KEY, secret: 'GEMINI_API_KEY',
    sites: { global: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', keyUrl: 'https://aistudio.google.com/apikey' } },
    model: 'gemini-3.5-flash-lite', models: ['gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    vision: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    contextWindows: { 'gemini-3.5-flash-lite': 1_048_576, 'gemini-3.8-flash': 1_048_576, 'gemini-3.1-pro-preview': 1_048_576 },
  },
  {
    // grok-4.3 takes none / low / medium / high / xhigh; grok-4.7 always reasons and takes low / medium / high / xhigh
    id: 'xai', names: brand('xAI'), keyHint: hint('xai-'), secret: 'XAI_API_KEY',
    sites: { global: { baseUrl: 'https://api.x.ai/v1', protocol: 'responses', keyUrl: 'https://console.x.ai/team/default/api-keys' } },
    model: 'grok-4.3', models: ['grok-4.7'],
    vision: ['grok-4.3', 'grok-4.7'], contextWindows: { 'grok-4.3': 1_000_000, 'grok-4.7': 500_000 },
    effort: { max: 'xhigh' },
    modelEffort: { 'grok-4.7': { none: 'low', max: 'xhigh' } },
    encryptedReasoning: true,
  },
];

export const vendorById = (id: string): Vendor | null => VENDORS.find((v) => v.id === id) ?? null;

/** The regions a service has separate platforms for; none for a service with one platform. */
export const regionsOf = (v: Vendor): Region[] => ('global' in v.sites ? [] : [...REGIONS]);

/** The platform of `v` that serves `region`. */
export const siteOf = (v: Vendor, region: Region): Site => ('global' in v.sites ? v.sites.global : v.sites[region]);

/** The name of the app's endpoint for `v` on `region`: the id, with `-intl` for an international platform. */
export const endpointName = (v: Vendor, region: Region): string => ('global' in v.sites || region === 'cn' ? v.id : `${v.id}-intl`);

/** The effort values `v` takes for `model` on `site`. */
export const effortOf = (v: Vendor, site: Site, model: string): EffortMap | undefined => v.modelEffort?.[model] ?? site.effort ?? v.effort;

export const vendorName = (v: Vendor, language: Language): string => localized(v.names, language);

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export interface Located {
  vendor: Vendor;
  /** Null for a service with one platform. */
  region: Region | null;
  site: Site;
}

/** The service and platform an endpoint's base URL points at, or null for any other URL. */
export function locate(baseUrl: string | undefined): Located | null {
  if (!baseUrl) return null;
  const url = trimSlash(baseUrl.trim());
  for (const vendor of VENDORS) {
    const sites: Array<[Region | null, Site]> = 'global' in vendor.sites ? [[null, vendor.sites.global]] : REGIONS.map((r) => [r, siteOf(vendor, r)]);
    for (const [region, site] of sites) if (url === site.baseUrl || url.startsWith(`${site.baseUrl}/`)) return { vendor, region, site };
  }
  return null;
}

/** The service an endpoint's base URL points at, or null for any other URL. */
export const vendorOf = (baseUrl: string | undefined): Vendor | null => locate(baseUrl)?.vendor ?? null;

/** Mainland China for Chinese, the international platforms for every other language. */
export const defaultRegion = (language: Language): Region => (language === 'zh' ? 'cn' : 'intl');

const ORDER_ZH = ['deepseek', 'qwen', 'kimi', 'glm', 'doubao', 'minimax', 'stepfun', 'qianfan', 'openrouter', 'openai', 'anthropic', 'gemini', 'xai'];
const ORDER_OTHER = ['openai', 'anthropic', 'gemini', 'xai', 'openrouter', 'deepseek', 'kimi', 'qwen', 'minimax', 'glm'];
/** Services that take mainland China accounts only. */
const MAINLAND_ONLY = ['doubao', 'qianfan', 'stepfun'];

/** The services in the order recommended for `language`; `more` are listed behind a toggle. */
export function vendorsFor(language: Language): { shown: Vendor[]; more: Vendor[] } {
  const pick = (ids: string[]) => ids.map((id) => vendorById(id)!);
  return language === 'zh' ? { shown: pick(ORDER_ZH), more: [] } : { shown: pick(ORDER_OTHER), more: pick(MAINLAND_ONLY) };
}

/** The service a new install for `language` starts on. */
export const firstVendor = (language: Language): Vendor => vendorsFor(language).shown[0]!;

/** A new endpoint's config for `v` on `region` (`kind: 'coo'`) with `model`; the key goes into its `.env` under `v.secret`. */
export function vendorEntry(v: Vendor, model = v.model, region: Region = 'cn') {
  return {
    kind: 'coo',
    baseUrl: siteOf(v, region).baseUrl,
    secret: v.secret,
    spec: { model, thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: (v.vision ?? []).includes(model),
    pricing: [],
    options: {},
  };
}
