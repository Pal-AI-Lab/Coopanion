import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Un solo modulo per ${names.join(', ')}; l'URL di base indica quale servizio è e quale protocollo usa. Il ragionamento ha quattro livelli.`,
  tiers: { off: 'Senza ragionamento', low: 'Ragionamento · veloce', high: 'Ragionamento · standard', max: 'Ragionamento · massimo' },
  protocol: 'Protocollo',
  protocolHint: "Non impostato: un servizio elencato usa il proprio protocollo, ogni altro URL usa responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: la Messages API, con l'URL prima di /v1; gemini: la Gemini API, con l'URL prima di /models.",
  badProtocol: (protocols: string) => `Il protocollo deve essere uno tra ${protocols}`,
};
