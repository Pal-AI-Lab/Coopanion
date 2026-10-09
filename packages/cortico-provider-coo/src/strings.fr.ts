import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Un seul module pour ${names.join(', ')} ; l'URL de base indique de quel service il s'agit et quel protocole il utilise. Le raisonnement a quatre niveaux.`,
  tiers: { off: 'Sans raisonnement', low: 'Raisonnement · rapide', high: 'Raisonnement · standard', max: 'Raisonnement · maximal' },
  protocol: 'Protocole',
  protocolHint: "Non défini : un service listé utilise son propre protocole, toute autre URL utilise responses. responses : POST <URL>/responses ; chat : POST <URL>/chat/completions ; anthropic : la Messages API, avec l'URL avant /v1 ; gemini : la Gemini API, avec l'URL avant /models.",
  badProtocol: (protocols: string) => `Le protocole doit être l'un de ${protocols}`,
};
