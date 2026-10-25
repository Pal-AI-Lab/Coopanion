import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "Effacer la conversation et recommencer",
  title: "Effacer la conversation actuelle et recommencer ?",
  body: "Enregistre les modifications de cette page, puis efface le contexte de la conversation actuelle de Coo et recommence avec le prompt système actualisé. L’effacement est irréversible. Memory et la persona sont conservés.",
  clearing: "Démarrage de la conversation…",
  cleared: "Nouvelle conversation démarrée",
  // release.ts
  updateShort: (version: string) => `v${version} disponible`,
  updateDownloadingShort: (version: string) => `Téléchargement de v${version}`,
  updateReadyShort: (version: string) => `v${version} prêt`,
  updateFailedShort: (version: string) => `Télécharger v${version}`,
  repoHint: 'Ouvrir le projet Coopanion sur GitHub',
  update: (latest: string) => `Coopanion ${latest} est disponible : téléchargez la mise à jour`,
  updateDownloading: (version: string) => `Coopanion ${version} se télécharge en arrière-plan`,
  updateReady: (version: string) => `Coopanion ${version} est téléchargé et s'installe à la fermeture`,
  updateFailed: (version: string) => `Coopanion ${version} n'a pas pu être téléchargé : le télécharger manuellement`,
};
