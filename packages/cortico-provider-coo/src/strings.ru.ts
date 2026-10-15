import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Один модуль для ${names.join(', ')}; по базовому URL определяется, какой это сервис и какой протокол он использует. У рассуждения четыре уровня.`,
  tiers: { off: 'Без рассуждения', low: 'Рассуждение · быстро', high: 'Рассуждение · стандартно', max: 'Рассуждение · максимально' },
  protocol: 'Протокол',
  protocolHint: 'Если не задано, сервис из списка использует свой протокол, а любой другой URL использует responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: Messages API, URL до /v1; gemini: Gemini API, URL до /models.',
  badProtocol: (protocols: string) => `Протокол должен быть одним из: ${protocols}`,
  chatgpt: {
    panel: 'Аккаунт ChatGPT',
    description: 'Вход через аккаунт ChatGPT; запросы учитываются в тарифе ChatGPT этого аккаунта.',
    signedOut: 'Вход в ChatGPT не выполнен',
    returnToApp: 'Результат входа показан в приложении. Эту вкладку можно закрыть.',
    reasons: { access_denied: 'доступ не предоставлен', plan_not_granted: 'аккаунт не разрешил использовать тариф ChatGPT', invalid_token_response: 'сервис ответил, но формат ответа несовместим', unsupported_country_region_territory: 'ваш регион не поддерживается этим сервисом; поддерживаемые регионы: https://developers.openai.com/api/docs/supported-countries', timeout: 'время входа в браузере истекло' },
  },
};
