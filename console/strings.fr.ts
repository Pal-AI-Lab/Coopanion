import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Réduire la barre latérale', expandSidebar: 'Développer la barre latérale',
  goBack: 'Précédent', goForward: 'Suivant',
  trace: 'Console', integrations: 'Intégrations', personaMemory: 'Personnalité et mémoire', diagnostics: 'Dépannage',
  toAdvanced: 'Mode avancé', toAdvancedHint: "Afficher les fournisseurs de modèles, Persona, Memory et le diagnostic",
  toNormal: 'Revenir au mode normal', toNormalHint: "Afficher les pages du compagnon et des extensions World",
  featureLoadFailed: (label: string) => `Échec du chargement de « ${label} »`,
  running: 'En marche', paused: 'En pause',
};
