import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Um único módulo para ${names.join(', ')}; a URL base indica qual serviço é e qual protocolo ele usa. O raciocínio tem quatro níveis.`,
  tiers: { off: 'Sem raciocínio', low: 'Raciocínio · rápido', high: 'Raciocínio · padrão', max: 'Raciocínio · máximo' },
  protocol: 'Protocolo',
  protocolHint: 'Sem definir: um serviço da lista usa o próprio protocolo e qualquer outra URL usa responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: a Messages API, com a URL antes de /v1; gemini: a Gemini API, com a URL antes de /models.',
  badProtocol: (protocols: string) => `O protocolo deve ser um de ${protocols}`,
  chatgpt: {
    panel: 'Conta do ChatGPT',
    description: 'Entra com uma conta do ChatGPT; as solicitações contam no plano do ChatGPT dessa conta.',
    signedOut: 'Sem login no ChatGPT',
    returnToApp: 'O app mostra o resultado do login. Você pode fechar esta aba.',
    reasons: { access_denied: 'o acesso não foi concedido', plan_not_granted: 'a conta não permitiu usar o plano do ChatGPT', invalid_token_response: 'o serviço respondeu, mas o formato da resposta é incompatível', unsupported_country_region_territory: 'sua região não é atendida por este serviço; regiões atendidas: https://developers.openai.com/api/docs/supported-countries', timeout: 'o login no navegador expirou' },
  },
};
