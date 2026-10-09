import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `一個模組連接 ${names.join('、')}；依 API 位址判斷是哪一家、走哪種協定。思考可調四檔。`,
  tiers: { off: '不思考', low: '思考 · 快', high: '思考 · 標準', max: '思考 · 最深' },
  protocol: '協定',
  protocolHint: '留空時，列出的服務使用它自己的協定，其他位址使用 responses。responses：POST <位址>/responses；chat：POST <位址>/chat/completions；anthropic：Messages API，位址填 /v1 之前的部分；gemini：Gemini API，位址填 /models 之前的部分。',
  badProtocol: (protocols: string) => `協定只能是 ${protocols}`,
};
