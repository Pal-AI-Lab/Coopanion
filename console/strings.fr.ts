import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Réduire la barre latérale', expandSidebar: 'Développer la barre latérale',
  goBack: 'Précédent', goForward: 'Suivant',
  trace: 'Console', integrations: 'Intégrations', personaMemory: 'Personnalité et mémoire', diagnostics: 'Dépannage',
  toAdvanced: 'Mode avancé', toAdvancedHint: 'Afficher tout Cortico : modèles, extensions, World, mémoire et diagnostic',
  toNormal: 'Revenir au mode normal', toNormalHint: 'Afficher seulement les pages du compagnon',
  featureLoadFailed: (label: string) => `Échec du chargement de « ${label} »`,
  running: 'En marche', paused: 'En pause',
};
