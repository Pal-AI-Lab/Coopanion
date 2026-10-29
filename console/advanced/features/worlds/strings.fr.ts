import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "Mes Worlds",
  marketTab: "Marché des extensions",
  extensionList: "Extensions",
  filterByName: "Filtrer par nom",
  allStates: "Tous les états",
  noMatches: "Aucune extension ne correspond au filtre.",
  newGroup: "Nouveau groupe",
  groupDefaultName: "Nouveau groupe",
  renameGroup: "Renommer le groupe",
  deleteGroup: "Supprimer le groupe (garde les extensions)",
  pendingNote: "Les extensions ci-dessus prennent effet après le redémarrage du processus.",
  packageInfo: "Infos sur l’extension",
  updateAvailable: (from: string, to: string) => `Mise à jour disponible : ${from} → ${to}`,
  hideFromSidebar: "Masquer de la barre latérale",
  showInSidebar: "Afficher dans la barre latérale",
  builtinAlwaysOn: "Les World intégrés restent toujours actifs.",
  modeOff: "Arrêté",
  modeRunning: "Exécution seule",
  modeAttached: "Connecté",

  navLabel: 'Extensions World',
  introTitle: 'Extensions World',
  prefixReloadFailed: (msg: string) => `Échec du rechargement du préfixe : ${msg}`,
  toggleFailed: (msg: string) => `Échec du basculement : ${msg}`,
  reloadNowTitle: 'Recharger le préfixe système maintenant ?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `« ${name} » est de nouveau visible pour l'agent.` : `« ${name} » est désormais masqué pour l'agent.`)
    + "\n\nLa livraison des événements suit déjà le nouvel état. Le rechargement met à jour le prompt d'environnement et les déclarations d'outils, et conserve les messages de conversation existants. "
    + "En cas d'annulation, ils sont mis à jour à la prochaine passation de contexte ou au prochain redémarrage.",
  deactivateTitle: (name: string) => `Désactiver « ${name} » ?`,
  deactivateBody: (id: string) =>
    "Le World s'arrête immédiatement (ses processus externes et connexions gérés sont clôturés), et "
    + `worlds.${id}.enabled=false est réécrit dans config.json. Le prompt d'environnement et les outils de l'agent sont retirés aussitôt ; une nouvelle activation le reconstruit à partir de la configuration actuelle.`,
  restartTitle: (name: string) => `Redémarrer « ${name} » ?`,
  restartBody: "Arrête et reconstruit le World pour appliquer les réglages marqués pour un redémarrage du World. Les processus et connexions gérés s'arrêtent puis redémarrent.",
  missingReasonDefault: 'Impossible de charger ce World.',
  activateWorld: 'Activer le World',
  inactiveNoteManual: (id: string) => `Implémenté localement mais non assemblé. Pour l'activer, mettez worlds.${id}.enabled à true dans config.json et redémarrez.`,
  hideFromAgent: "Masquer pour l'agent",
  showToAgent: "Afficher pour l'agent",
  restartWorld: 'Redémarrer le World',
  deactivateWorld: 'Désactiver le World',
  prefixPending: 'Rechargement du préfixe en attente',
  noWorlds: 'Aucun World',
  listLoadFailed: (msg: string) => `Échec du chargement de la liste des World : ${msg}`,
  loading: 'Chargement…',
};
