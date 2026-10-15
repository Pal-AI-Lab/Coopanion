import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `1 つのモジュールで ${names.join('、')} に対応します。ベース URL からどのサービスか、どのプロトコルを使うかを判断します。思考は 4 段階で調整できます。`,
  tiers: { off: '思考なし', low: '思考 · 速い', high: '思考 · 標準', max: '思考 · 最も深い' },
  protocol: 'プロトコル',
  protocolHint: '未設定のとき、一覧にあるサービスはそれぞれのプロトコルを、それ以外の URL は responses を使います。responses：POST <URL>/responses、chat：POST <URL>/chat/completions、anthropic：Messages API（URL は /v1 より前の部分）、gemini：Gemini API（URL は /models より前の部分）。',
  badProtocol: (protocols: string) => `プロトコルは ${protocols} のいずれかにしてください`,
  chatgpt: {
    panel: 'ChatGPT アカウント',
    description: 'ChatGPT アカウントでサインインし、リクエストはそのアカウントの ChatGPT プランの利用量に含まれます。',
    signedOut: 'ChatGPT にサインインしていません',
    returnToApp: 'サインインの結果はアプリに表示されます。このタブは閉じてかまいません。',
    reasons: { access_denied: 'アクセスが許可されませんでした', plan_not_granted: 'このアカウントで ChatGPT プランの利用が許可されませんでした', invalid_token_response: 'サービスは応答しましたが、応答の形式に互換性がありません', unsupported_country_region_territory: 'お住まいの地域はこのサービスに対応していません。対応地域：https://developers.openai.com/api/docs/supported-countries', timeout: 'ブラウザでのサインインがタイムアウトしました' },
  },
};
