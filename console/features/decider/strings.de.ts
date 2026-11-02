import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Ausdrucksauswahl',
  enabled: 'Ein Entscheidungsmodell Ausdrücke und Bewegungen wählen lassen',
  enabledHint: 'Coo schreibt zu jeder Sprechblase, wie es sich fühlt, und ein Entscheidungsmodell auf OpenRouter wählt Ausdrücke und Bewegungen; die Wortliste steht nicht mehr im System-Prompt.',
  privacy: 'Solange dies an ist, sendet jede Entscheidung an OpenRouter den Text der Sprechblase, Coos Gefühl sowie Name, Beschreibung und Outfit der aktuellen Figur samt ihrer Liste von Ausdrücken und Bewegungen.',
  key: 'API Key',
  keySave: 'Speichern',
  keyHint: 'Wird im Ordner der Bereitstellung gespeichert und nur an OpenRouter gesendet. Speichern schaltet die Ausdrucksauswahl nicht ein.',
  keySaved: 'API Key gespeichert',
  status: 'Status',
  on: 'Ein Entscheidungsmodell ist in Gebrauch.',
  off: 'Aus: Coo schreibt Ausdrücke und Bewegungen selbst.',
  needKey: 'An: wirkt, sobald ein OpenRouter-API Key gesetzt ist.',
  lastFailed: (why: string) => `Die letzte Entscheidung schlug fehl: ${why}.`,
  saveFailed: (why: string) => `Nicht gespeichert: ${why}`,
};
