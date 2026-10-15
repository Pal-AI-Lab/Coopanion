import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Ein Modul für ${names.join(', ')}; die Basis-URL bestimmt, welcher Dienst es ist und welches Protokoll er nutzt. Denken hat vier Stufen.`,
  tiers: { off: 'Kein Denken', low: 'Denken · schnell', high: 'Denken · Standard', max: 'Denken · maximal' },
  protocol: 'Protokoll',
  protocolHint: 'Nicht gesetzt: Ein aufgeführter Dienst nutzt sein eigenes Protokoll, jede andere URL nutzt responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: die Messages API, mit der URL vor /v1; gemini: die Gemini API, mit der URL vor /models.',
  badProtocol: (protocols: string) => `Das Protokoll muss eines von ${protocols} sein`,
  chatgpt: {
    panel: 'ChatGPT-Konto',
    description: 'Anmeldung mit einem ChatGPT-Konto; Anfragen zählen zum ChatGPT-Tarif dieses Kontos.',
    signedOut: 'Nicht bei ChatGPT angemeldet',
    returnToApp: 'Das Ergebnis der Anmeldung steht in der App. Dieser Tab kann geschlossen werden.',
    reasons: { access_denied: 'der Zugriff wurde nicht erlaubt', plan_not_granted: 'das Konto hat die Nutzung seines ChatGPT-Tarifs nicht erlaubt', invalid_token_response: 'der Dienst hat geantwortet, aber das Antwortformat ist nicht kompatibel', unsupported_country_region_territory: 'deine Region wird von diesem Dienst nicht unterstützt; unterstützte Regionen: https://developers.openai.com/api/docs/supported-countries', timeout: 'die Anmeldung im Browser ist abgelaufen' },
  },
};
