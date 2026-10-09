import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Ein Modul für ${names.join(', ')}; die Basis-URL bestimmt, welcher Dienst es ist und welches Protokoll er nutzt. Denken hat vier Stufen.`,
  tiers: { off: 'Kein Denken', low: 'Denken · schnell', high: 'Denken · Standard', max: 'Denken · maximal' },
  protocol: 'Protokoll',
  protocolHint: 'Nicht gesetzt: Ein aufgeführter Dienst nutzt sein eigenes Protokoll, jede andere URL nutzt responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: die Messages API, mit der URL vor /v1; gemini: die Gemini API, mit der URL vor /models.',
  badProtocol: (protocols: string) => `Das Protokoll muss eines von ${protocols} sein`,
};
