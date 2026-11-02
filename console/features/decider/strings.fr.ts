import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Choix des expressions',
  enabled: 'Laisser un modèle de décision choisir les expressions et les mouvements',
  enabledHint: 'Coo écrit son ressenti à chaque bulle, et un modèle de décision sur OpenRouter choisit les expressions et les mouvements ; le prompt système ne contient plus la table des mots.',
  privacy: "Tant que c'est activé, chaque décision envoie à OpenRouter le texte de la bulle, le ressenti de Coo, ainsi que le nom, la description et l'habillage de l'apparence actuelle avec sa liste d'expressions et de mouvements.",
  key: 'API Key',
  keySave: 'Enregistrer',
  keyHint: "Conservée dans le dossier du déploiement et envoyée seulement à OpenRouter. L'enregistrer n'active pas le choix des expressions.",
  keySaved: 'API Key enregistrée',
  status: 'État',
  on: 'Un modèle de décision est utilisé.',
  off: 'Désactivé : Coo écrit lui-même ses expressions et mouvements.',
  needKey: "Activé : prend effet dès qu'une API Key OpenRouter est renseignée.",
  lastFailed: (why: string) => `La dernière décision a échoué : ${why}.`,
  saveFailed: (why: string) => `Non enregistré : ${why}`,
};
