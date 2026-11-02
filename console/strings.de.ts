import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Seitenleiste einklappen', expandSidebar: 'Seitenleiste ausklappen',
  goBack: 'Zurück', goForward: 'Vorwärts',
  trace: 'Konsole', integrations: 'Integrationen', personaMemory: 'Persönlichkeit & Gedächtnis', diagnostics: 'Fehlersuche',
  toAdvanced: 'Erweiterter Modus', toAdvancedHint: "Modellanbieter, Persona, Memory und Diagnose anzeigen",
  toNormal: 'Zurück zum normalen Modus', toNormalHint: "Seiten zum Haustier und zu World-Erweiterungen anzeigen",
  featureLoadFailed: (label: string) => `„${label}“ konnte nicht geladen werden`,
  running: 'Läuft', paused: 'Pausiert',
};
