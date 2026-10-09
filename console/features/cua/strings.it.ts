import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Controllo del computer',
  title: 'Controllo del computer',
  enabled: 'Lascia che Coo usi questo computer',
  enabledHint: 'Se disattivato, Coo non può né vedere lo schermo né toccare mouse e tastiera.',
  control: 'Consenti mouse e tastiera',
  controlHint: 'Se disattivato, Coo può solo fare screenshot ed elencare le finestre.',
  permission: 'Quando chiederti',
  levels: { 'ask-each-turn': 'Ogni turno', 'ask-before-acting': 'Prima di agire', 'ask-once': 'Una volta', 'never-ask': 'Mai' },
  levelHints: {
    'ask-each-turn': 'A ogni turno Coo chiede nel suo fumetto prima di guardare lo schermo o usare mouse e tastiera per la prima volta.',
    'ask-before-acting': 'Per guardare non chiede; a ogni turno Coo chiede prima di usare mouse e tastiera per la prima volta.',
    'ask-once': 'Per guardare non chiede; Coo chiede una volta prima di usare mouse e tastiera e, dopo un sì, non più per il tempo impostato qui sotto.',
    'never-ask': 'Coo non chiede mai, né per guardare né per agire.',
  },
  grant: 'Un sì vale',
  grantSuffix: 'minuti',
  grantBad: (min: number, max: number) => `Inserisci un numero intero da ${min} a ${max}`,
  more: 'Il tempo per lasciarti il passo, le dimensioni degli screenshot e le altre impostazioni sono nella pagina World Controllo del computer, in modalità avanzata.',
  saved: 'Salvato',
  turnedOn: 'Controllo del computer attivato',
  turnedOff: 'Controllo del computer disattivato',
  saveFailed: (why: string) => `Non salvato: ${why}`,
};
