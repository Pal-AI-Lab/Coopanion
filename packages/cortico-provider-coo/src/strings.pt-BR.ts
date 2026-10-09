import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Um único módulo para ${names.join(', ')}; a URL base indica qual serviço é e qual protocolo ele usa. O raciocínio tem quatro níveis.`,
  tiers: { off: 'Sem raciocínio', low: 'Raciocínio · rápido', high: 'Raciocínio · padrão', max: 'Raciocínio · máximo' },
  protocol: 'Protocolo',
  protocolHint: 'Sem definir: um serviço da lista usa o próprio protocolo e qualquer outra URL usa responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: a Messages API, com a URL antes de /v1; gemini: a Gemini API, com a URL antes de /models.',
  badProtocol: (protocols: string) => `O protocolo deve ser um de ${protocols}`,
};
