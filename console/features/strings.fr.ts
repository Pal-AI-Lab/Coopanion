import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'Effacer et redémarrer',
  title: 'Effacer cette conversation et faire repartir Coo de zéro ?',
  body: "Coo oublie le contexte de cette conversation et repart du prompt système actuel. C'est irréversible. La mémoire et la persona de l'espace de travail sont conservées.",
  clearing: 'Effacement…',
  cleared: 'Effacé et redémarré',
  failed: (why: string) => `Non effacé : ${why}`,
  // release.ts
  repoHint: 'Ouvrir le projet Coopanion sur GitHub',
  update: (latest: string) => `Coopanion ${latest} est disponible : téléchargez la mise à jour`,
};
