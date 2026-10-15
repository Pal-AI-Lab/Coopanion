import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `Un seul module pour ${names.join(', ')} ; l'URL de base indique de quel service il s'agit et quel protocole il utilise. Le raisonnement a quatre niveaux.`,
  tiers: { off: 'Sans raisonnement', low: 'Raisonnement · rapide', high: 'Raisonnement · standard', max: 'Raisonnement · maximal' },
  protocol: 'Protocole',
  protocolHint: "Non défini : un service listé utilise son propre protocole, toute autre URL utilise responses. responses : POST <URL>/responses ; chat : POST <URL>/chat/completions ; anthropic : la Messages API, avec l'URL avant /v1 ; gemini : la Gemini API, avec l'URL avant /models.",
  badProtocol: (protocols: string) => `Le protocole doit être l'un de ${protocols}`,
  chatgpt: {
    panel: 'Compte ChatGPT',
    description: "Connexion avec un compte ChatGPT ; les requêtes sont décomptées de l'offre ChatGPT de ce compte.",
    signedOut: 'Non connecté à ChatGPT',
    returnToApp: "L'application affiche le résultat de la connexion. Vous pouvez fermer cet onglet.",
    reasons: { access_denied: "l'accès n'a pas été accordé", plan_not_granted: "le compte n'a pas autorisé l'usage de son offre ChatGPT", invalid_token_response: 'le service a répondu, mais le format de la réponse est incompatible', unsupported_country_region_territory: "votre région n'est pas prise en charge par ce service ; régions prises en charge : https://developers.openai.com/api/docs/supported-countries", timeout: 'la connexion dans le navigateur a expiré' },
  },
};
