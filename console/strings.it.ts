import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Comprimi barra laterale', expandSidebar: 'Espandi barra laterale',
  goBack: 'Indietro', goForward: 'Avanti',
  trace: 'Console', integrations: 'Integrazioni', personaMemory: 'Personalità e memoria', diagnostics: 'Risoluzione dei problemi',
  toAdvanced: 'Modalità avanzata', toAdvancedHint: "Mostra fornitori di modelli, Persona, Memory e diagnostica",
  toNormal: 'Torna alla modalità normale', toNormalHint: "Mostra le pagine del pet e delle estensioni World",
  featureLoadFailed: (label: string) => `Impossibile caricare «${label}»`,
  running: 'In esecuzione', paused: 'In pausa',
};
