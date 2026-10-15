import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Un solo modulo per ${names.join(', ')}; l'URL di base indica quale servizio è e quale protocollo usa. Il ragionamento ha quattro livelli.`,
  tiers: { off: 'Senza ragionamento', low: 'Ragionamento · veloce', high: 'Ragionamento · standard', max: 'Ragionamento · massimo' },
  protocol: 'Protocollo',
  protocolHint: "Non impostato: un servizio elencato usa il proprio protocollo, ogni altro URL usa responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: la Messages API, con l'URL prima di /v1; gemini: la Gemini API, con l'URL prima di /models.",
  badProtocol: (protocols: string) => `Il protocollo deve essere uno tra ${protocols}`,
  chatgpt: {
    panel: 'Account ChatGPT',
    description: "Accesso con un account ChatGPT; le richieste rientrano nel piano ChatGPT di quell'account.",
    signedOut: 'Accesso a ChatGPT non effettuato',
    returnToApp: "L'app mostra l'esito dell'accesso. Puoi chiudere questa scheda.",
    reasons: { access_denied: "l'accesso non è stato concesso", plan_not_granted: "l'account non ha consentito l'uso del piano ChatGPT", invalid_token_response: 'il servizio ha risposto, ma il formato della risposta non è compatibile', unsupported_country_region_territory: 'la tua regione non è supportata da questo servizio; regioni supportate: https://developers.openai.com/api/docs/supported-countries', timeout: "l'accesso nel browser è scaduto" },
  },
};
