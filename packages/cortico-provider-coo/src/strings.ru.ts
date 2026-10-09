import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Один модуль для ${names.join(', ')}; по базовому URL определяется, какой это сервис и какой протокол он использует. У рассуждения четыре уровня.`,
  tiers: { off: 'Без рассуждения', low: 'Рассуждение · быстро', high: 'Рассуждение · стандартно', max: 'Рассуждение · максимально' },
  protocol: 'Протокол',
  protocolHint: 'Если не задано, сервис из списка использует свой протокол, а любой другой URL использует responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: Messages API, URL до /v1; gemini: Gemini API, URL до /models.',
  badProtocol: (protocols: string) => `Протокол должен быть одним из: ${protocols}`,
};
