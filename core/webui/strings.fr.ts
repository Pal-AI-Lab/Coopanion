import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Alarmes',
  desc: "Les alarmes que Coo a fixées. Coo est prévenu quand vous en supprimez une ici.",
  setAt: 'Créée le',
  daily: 'Tous les jours',
  empty: "Coo n'a aucune alarme.",
  remove: 'Supprimer',
  confirmTitle: (when) => `Supprimer l'alarme de ${when} ?`,
  removed: 'Supprimée',
  failed: (msg) => `Suppression impossible : ${msg}`,
  loadFailed: (msg) => `Chargement impossible : ${msg}`,
  search: 'Rechercher une note ou une heure',
  noMatch: 'Aucune alarme ne correspond.',
  perPage: 'Par page',
  shown: (from: number, to: number, total: number) => `${from}–${to} sur ${total}`,
  prevPage: '‹ Précédente',
  nextPage: 'Suivante ›',
};
