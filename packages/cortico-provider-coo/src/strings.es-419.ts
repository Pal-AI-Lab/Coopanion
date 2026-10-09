import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Un solo módulo para ${names.join(', ')}; la URL base indica qué servicio es y qué protocolo usa. El razonamiento tiene cuatro niveles.`,
  tiers: { off: 'Sin razonamiento', low: 'Razonamiento · rápido', high: 'Razonamiento · estándar', max: 'Razonamiento · máximo' },
  protocol: 'Protocolo',
  protocolHint: 'Sin definir: un servicio de la lista usa su propio protocolo y cualquier otra URL usa responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: la Messages API, con la URL anterior a /v1; gemini: la Gemini API, con la URL anterior a /models.',
  badProtocol: (protocols: string) => `El protocolo debe ser uno de ${protocols}`,
};
