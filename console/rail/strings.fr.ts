import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: 'Navigation des paramètres',
  groupWorlds: 'World',
  moduleInstancesAria: 'Instances de World',

  runResume: 'Reprendre',
  runPause: 'Mettre en pause',
  shutdownAria: 'Arrêter',
  finishing: 'Arrêt en cours…',
  shutdownTitle: 'Arrêter',
  shutdownBody: 'Le processus va se terminer et la connexion sera coupée.',
  confirmShutdownTitle: '⚠ Arrêter',
  confirmShutdownAgainTitle: "⚠⚠ Confirmer l'arrêt ?",
  confirmShutdownAgainBody: "Arrêter l'exécution et quitter le processus ?",
  stepIncomplete: 'incomplet',
  doneShutdown: 'Arrêté',
  resultLocalIncomplete: "Étapes d'arrêt local incomplètes",
  resultExternalUnverified: 'Arrêté localement ; état externe non vérifié',
  resultUnverified: "Étapes d'arrêt exécutées ; état non vérifié",
  resultDefault: "Étapes d'arrêt exécutées.",
  noReceipt: (msg: string) =>
    `Aucun résultat d'arrêt reçu (${msg}) ; le processus s'est peut-être terminé.`,
  docTitle: (name: string) => `Paramètres · ${name}`,
  renameTitle: 'Cliquer pour renommer',
  renameFailed: (msg: string) => `Nom affiché non enregistré : ${msg}`,
  // avatar.ts
  changeAvatar: "Changer l'avatar de Coo",
  uploadAvatar: "Importer et recadrer l'avatar de Coo",
  unreadable: 'Impossible de lire cette image',
  cropPreview: "Aperçu du recadrage de l'avatar",
  zoomAria: "Zoom de l'avatar",
  zoom: 'Zoom',
  note: "Déplacez l’image ; zoomez avec la molette ou le curseur.",
  cancel: 'Annuler',
  save: "Enregistrer l'avatar",
  cropTitle: "Recadrer l'avatar",
  noCanvas: "Le navigateur n'a pas pu créer de canevas d'image",
};
