import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "I miei World",
  marketTab: "Mercato estensioni",
  extensionList: "Elenco estensioni",
  filterByName: "Filtra per nome",
  allStates: "Tutti gli stati",
  noMatches: "Nessuna estensione corrisponde al filtro.",
  newGroup: "Nuovo gruppo",
  groupDefaultName: "Nuovo gruppo",
  renameGroup: "Rinomina gruppo",
  deleteGroup: "Elimina gruppo (mantiene le estensioni)",
  pendingNote: "Le estensioni qui sopra hanno effetto dopo il riavvio del processo.",
  packageInfo: "Info estensione",
  updateAvailable: (from: string, to: string) => `Aggiornamento disponibile: ${from} → ${to}`,
  hideFromSidebar: "Nascondi dalla barra laterale",
  showInSidebar: "Mostra nella barra laterale",
  builtinAlwaysOn: "I World integrati restano sempre attivi.",
  modeOff: "Fermo",
  modeRunning: "Solo esecuzione",
  modeAttached: "Connesso",

  navLabel: 'Estensioni World',
  introTitle: 'Estensioni World',
  prefixReloadFailed: (msg: string) => `Ricaricamento del prefisso non riuscito: ${msg}`,
  toggleFailed: (msg: string) => `Cambio non riuscito: ${msg}`,
  reloadNowTitle: 'Ricaricare ora il prefisso di sistema?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `«${name}» è di nuovo visibile all'agente.` : `«${name}» è ora nascosto all'agente.`)
    + "\n\nLa consegna degli eventi segue già il nuovo stato. Il ricaricamento aggiorna il prompt dell'ambiente e le dichiarazioni degli strumenti e conserva i messaggi della conversazione esistenti. "
    + 'Se annulli, si aggiornano al prossimo passaggio di contesto o al prossimo riavvio.',
  deactivateTitle: (name: string) => `Disattivare «${name}»?`,
  deactivateBody: (id: string) =>
    'Il World si arresta subito (i processi esterni e le connessioni che gestisce vengono chiusi) e '
    + `worlds.${id}.enabled=false viene riscritto in config.json. Il prompt dell'ambiente e gli strumenti dell'agente vengono ritirati subito; una nuova attivazione lo ricostruisce dalla configurazione attuale.`,
  restartTitle: (name: string) => `Riavviare «${name}»?`,
  restartBody: 'Arresta e ricostruisce il World per applicare le impostazioni che richiedono il riavvio del World. I processi e le connessioni gestiti si arrestano e ripartono.',
  missingReasonDefault: 'Impossibile caricare questo World.',
  activateWorld: 'Attiva World',
  inactiveNoteManual: (id: string) => `Implementato in locale ma non assemblato. Per attivarlo, imposta worlds.${id}.enabled a true in config.json e riavvia.`,
  hideFromAgent: "Nascondi all'agente",
  showToAgent: "Mostra all'agente",
  restartWorld: 'Riavvia World',
  deactivateWorld: 'Disattiva World',
  prefixPending: 'Ricaricamento prefisso in attesa',
  noWorlds: 'Nessun World',
  listLoadFailed: (msg: string) => `Caricamento dell'elenco dei World non riuscito: ${msg}`,
  loading: 'Caricamento…',
};
