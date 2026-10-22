import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Alarmes',
  desc: "Les alarmes que Coo a fixées. Coo est prévenu quand vous en supprimez une ici.",
  head: ['Heure', 'Note', 'Créée le', ''],
  daily: 'Tous les jours',
  empty: "Coo n'a aucune alarme.",
  remove: 'Supprimer',
  confirmTitle: (when) => `Supprimer l'alarme de ${when} ?`,
  removed: 'Supprimée',
  failed: (msg) => `Suppression impossible : ${msg}`,
  loadFailed: (msg) => `Chargement impossible : ${msg}`,
};
