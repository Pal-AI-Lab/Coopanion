import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: "Trace d'exécution", model: 'Modèle', settings: 'Paramètres', advanced: 'Avancé',
  toAdvanced: 'Mode avancé', toAdvancedHint: 'Afficher tout Cortico : modèles, extensions, World, mémoire et diagnostic',
  toNormal: 'Revenir au mode normal', toNormalHint: 'Afficher seulement les pages du compagnon',
  featureLoadFailed: (label: string) => `Échec du chargement de « ${label} »`,
  running: 'En marche', paused: 'En pause',
};
