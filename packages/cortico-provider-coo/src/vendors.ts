/**
 * The model services Coo Pet Provider offers, DeepSeek first. Each one is an OpenAI-compatible
 * Responses endpoint reachable from mainland China; `id` doubles as the name of the service's
 * endpoint in the app, and `secret` as the name its key is stored under. Base URLs, starting
 * models, key pages, image input, context windows and thinking levels are from each service's own
 * documentation (read 2026-09-24); none of the services but DeepSeek has been tried with a key.
 */

/** The four thinking levels the provider offers; see `TIERS` in index.ts. */
export type Effort = 'none' | 'low' | 'high' | 'max';

export interface Vendor {
  id: string;
  /** Shown to the person. */
  name: string;
  nameEn: string;
  /** The path before `/responses`. */
  baseUrl: string;
  /** Where a key is created. */
  keyUrl: string;
  /** Placeholder of the key box: how the service's keys start. */
  keyHint: string;
  secret: string;
  /** The model a new endpoint starts with. */
  model: string;
  /** Models that read images. */
  vision?: readonly string[];
  /** Context windows the service states, where `GET /models` does not report them. */
  contextWindows?: Readonly<Record<string, number>>;
  /**
   * `reasoning.effort` for each level where the service takes another value; null leaves
   * `reasoning` out, for a service that documents no effort.
   */
  effort?: Partial<Record<Effort, string | null>>;
}

export const VENDORS: readonly Vendor[] = [
  {
    id: 'deepseek', name: 'DeepSeek', nameEn: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com', keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'sk-…',
    secret: 'DEEPSEEK_API_KEY', model: 'deepseek-flash',
    vision: ['deepseek-flash'], contextWindows: { 'deepseek-flash': 1_000_000, 'deepseek-v4-pro': 1_000_000 },
  },
  {
    // Qwen3.8 takes none / low / medium / xhigh
    id: 'qwen', name: '通义千问', nameEn: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key', keyHint: 'sk-…',
    secret: 'QWEN_API_KEY', model: 'qwen3.8-flash',
    vision: ['qwen3.8-flash'], contextWindows: { 'qwen3.8-flash': 1_000_000 },
    effort: { high: 'medium', max: 'xhigh' },
  },
  {
    // the Responses endpoint serves kimi-k3 only, which takes low / high / max
    id: 'kimi', name: 'Kimi', nameEn: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.kimi.com/console/api-keys', keyHint: 'sk-…',
    secret: 'KIMI_API_KEY', model: 'kimi-k3',
    vision: ['kimi-k3'], contextWindows: { 'kimi-k3': 1_048_576 },
    effort: { none: 'low' },
  },
  {
    // the Responses endpoint is under /api/v1, not the chat path /api/paas/v4
    id: 'glm', name: '智谱 GLM', nameEn: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/v1', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', keyHint: '粘贴 API Key',
    secret: 'GLM_API_KEY', model: 'glm-5.3',
    contextWindows: { 'glm-5.3': 1_000_000 },
  },
  {
    // the model is used by its id, after it is switched on under 开通管理 in the Ark console
    id: 'doubao', name: '豆包', nameEn: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey', keyHint: '粘贴 API Key',
    secret: 'DOUBAO_API_KEY', model: 'doubao-seed-2-1-lite-260915',
    vision: ['doubao-seed-2-1-lite-260915'],
  },
  {
    // Qianfan's Responses endpoint lists no ERNIE model and documents no effort
    id: 'qianfan', name: '百度千帆', nameEn: 'Baidu Qianfan',
    baseUrl: 'https://qianfan.baidubce.com/v2', keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list', keyHint: 'bce-v3/…',
    secret: 'QIANFAN_API_KEY', model: 'glm-5.1',
    effort: { none: null, low: null, high: null, max: null },
  },
  {
    // takes none / minimal / low / medium / high
    id: 'minimax', name: 'MiniMax', nameEn: 'MiniMax',
    baseUrl: 'https://api.minimax.cn/v1', keyUrl: 'https://platform.minimax.cn/user-center/basic-information/interface-key', keyHint: '粘贴 API Key',
    secret: 'MINIMAX_API_KEY', model: 'MiniMax-M3',
    vision: ['MiniMax-M3'], contextWindows: { 'MiniMax-M3': 1_000_000 },
    effort: { max: 'high' },
  },
  {
    // takes low / medium / high
    id: 'stepfun', name: '阶跃星辰', nameEn: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1', keyUrl: 'https://platform.stepfun.com/interface-key', keyHint: '粘贴 API Key',
    secret: 'STEPFUN_API_KEY', model: 'step-3.7-flash',
    vision: ['step-3.7-flash'],
    effort: { none: 'low', max: 'high' },
  },
  {
    id: 'openrouter', name: 'OpenRouter', nameEn: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/settings/keys', keyHint: 'sk-or-…',
    secret: 'OPENROUTER_API_KEY', model: 'deepseek/deepseek-v4.1-flash',
    vision: ['deepseek/deepseek-v4.1-flash'], contextWindows: { 'deepseek/deepseek-v4.1-flash': 1_048_576 },
  },
];

export const vendorById = (id: string): Vendor | null => VENDORS.find((v) => v.id === id) ?? null;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** The service an endpoint's base URL points at, or null for any other URL. */
export function vendorOf(baseUrl: string | undefined): Vendor | null {
  if (!baseUrl) return null;
  const url = trimSlash(baseUrl.trim());
  return VENDORS.find((v) => url === v.baseUrl || url.startsWith(`${v.baseUrl}/`)) ?? null;
}

/** A new endpoint's config for `v` (`kind: 'coo'`); the key goes into its `.env` under `v.secret`. */
export function vendorEntry(v: Vendor) {
  return {
    kind: 'coo',
    baseUrl: v.baseUrl,
    secret: v.secret,
    spec: { model: v.model, thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: (v.vision ?? []).includes(v.model),
    pricing: [],
    options: {},
  };
}
