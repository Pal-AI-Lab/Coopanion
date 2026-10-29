import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "I miei World",
  marketTab: "Estensioni World",
  extensionList: "Elenco estensioni",
  configure: "Configura",
  packageInfo: "Info installazione",
  modeOff: "Fermo",
  modeRunning: "Solo esecuzione",
  modeAttached: "Connesso",

  navLabel: 'Panoramica dei World',
  introTitle: 'World',
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
  declaredByPersona: 'Dichiarato dalla Persona',
  optionalAddon: 'Componente aggiuntivo opzionale',
  open: 'Apri',
  missingReasonDefault: 'Impossibile caricare questo World.',
  activateWorld: 'Attiva World',
  inactiveNoteManual: (id: string) => `Implementato in locale ma non assemblato. Per attivarlo, imposta worlds.${id}.enabled a true in config.json e riavvia.`,
  hideFromAgent: "Nascondi all'agente",
  showToAgent: "Mostra all'agente",
  restartWorld: 'Riavvia World',
  deactivateWorld: 'Disattiva World',
  prefixPending: 'Ricaricamento prefisso in attesa',
  kvTools: 'Strumenti',
  kvNone: '(nessuno)',
  kvWorkspace: 'Area di lavoro',
  listSep: ', ',
  driftNote: "La consegna degli eventi segue già il nuovo stato; il prompt dell'ambiente e le dichiarazioni degli strumenti si aggiornano dopo un ricaricamento del prefisso.",
  noWorlds: 'Nessun World',
  listLoadFailed: (msg: string) => `Caricamento dell'elenco dei World non riuscito: ${msg}`,
  loading: 'Caricamento…',
};
