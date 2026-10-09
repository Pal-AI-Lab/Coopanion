import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Computersteuerung',
  title: 'Computersteuerung',
  enabled: 'Coo diesen Computer benutzen lassen',
  enabledHint: 'Wenn aus, kann Coo weder den Bildschirm sehen noch Maus und Tastatur anfassen.',
  control: 'Maus und Tastatur erlauben',
  controlHint: 'Wenn aus, kann Coo nur Screenshots machen und Fenster auflisten.',
  permission: 'Wann du gefragt wirst',
  levels: { 'ask-each-turn': 'Jede Runde', 'ask-before-acting': 'Vor dem Handeln', 'ask-once': 'Einmal', 'never-ask': 'Nie' },
  levelHints: {
    'ask-each-turn': 'Jede Runde fragt Coo in seiner Sprechblase, bevor es zum ersten Mal auf den Bildschirm schaut oder Maus und Tastatur benutzt.',
    'ask-before-acting': 'Schauen ohne Nachfrage; jede Runde fragt Coo, bevor es zum ersten Mal Maus und Tastatur benutzt.',
    'ask-once': 'Schauen ohne Nachfrage; Coo fragt einmal, bevor es Maus und Tastatur benutzt, und nach einem Ja so lange wie unten eingestellt nicht mehr.',
    'never-ask': 'Coo fragt nie, weder zum Schauen noch zum Handeln.',
  },
  grant: 'Ein Ja gilt',
  grantSuffix: 'Minuten',
  grantBad: (min: number, max: number) => `Gib eine ganze Zahl von ${min} bis ${max} ein`,
  more: 'Vortrittszeit, Screenshot-Größen und die übrigen Einstellungen sind im erweiterten Modus auf der World-Seite Computersteuerung.',
  saved: 'Gespeichert',
  turnedOn: 'Computersteuerung ist an',
  turnedOff: 'Computersteuerung ist aus',
  saveFailed: (why: string) => `Nicht gespeichert: ${why}`,
};
