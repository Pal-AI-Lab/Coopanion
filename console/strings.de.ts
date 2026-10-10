import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: 'Ablaufprotokoll', model: 'Modell', settings: 'Einstellungen', advanced: 'Erweitert',
  toAdvanced: 'Erweiterter Modus', toAdvancedHint: 'Ganz Cortico zeigen: Modelle, Erweiterungen, Worlds, Gedächtnis und Diagnose',
  toNormal: 'Zurück zum normalen Modus', toNormalHint: 'Nur die Seiten zum Haustier zeigen',
  featureLoadFailed: (label: string) => `„${label}“ konnte nicht geladen werden`,
  running: 'Läuft', paused: 'Pausiert',
};
