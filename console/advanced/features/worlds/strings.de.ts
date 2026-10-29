import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "Meine Worlds",
  marketTab: "Erweiterungsmarkt",
  extensionList: "Erweiterungsliste",
  filterByName: "Nach Name filtern",
  allStates: "Alle Zustände",
  noMatches: "Keine Erweiterung passt zum Filter.",
  newGroup: "Neue Gruppe",
  groupDefaultName: "Neue Gruppe",
  renameGroup: "Gruppe umbenennen",
  deleteGroup: "Gruppe löschen (Erweiterungen bleiben)",
  pendingNote: "Die obigen Erweiterungen wirken erst nach dem Neustart des Prozesses.",
  packageInfo: "Erweiterungsinfo",
  updateAvailable: (from: string, to: string) => `Update verfügbar: ${from} → ${to}`,
  hideFromSidebar: "Aus der Seitenleiste ausblenden",
  showInSidebar: "In der Seitenleiste zeigen",
  builtinAlwaysOn: "Integrierte Worlds sind immer an.",
  modeOff: "Gestoppt",
  modeRunning: "Nur ausführen",
  modeAttached: "Verbunden",

  navLabel: 'World-Erweiterungen',
  introTitle: 'World-Erweiterungen',
  prefixReloadFailed: (msg: string) => `Neuladen des Präfixes fehlgeschlagen: ${msg}`,
  toggleFailed: (msg: string) => `Umschalten fehlgeschlagen: ${msg}`,
  reloadNowTitle: 'Systempräfix jetzt neu laden?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `„${name}“ ist für den Agenten wieder sichtbar.` : `„${name}“ ist jetzt vor dem Agenten verborgen.`)
    + '\n\nDie Ereigniszustellung folgt bereits dem neuen Zustand. Neuladen aktualisiert den Umgebungs-Prompt und die Tool-Deklarationen und behält bestehende Gesprächsnachrichten. '
    + 'Bei Abbruch werden sie bei der nächsten Kontextübergabe oder beim nächsten Neustart aktualisiert.',
  deactivateTitle: (name: string) => `„${name}“ deaktivieren?`,
  deactivateBody: (id: string) =>
    'Die World stoppt sofort (ihre verwalteten externen Prozesse und Verbindungen werden beendet), und '
    + `worlds.${id}.enabled=false wird in config.json zurückgeschrieben. Umgebungs-Prompt und Tools des Agenten werden sofort entfernt; eine erneute Aktivierung baut sie aus der aktuellen Konfiguration neu auf.`,
  restartTitle: (name: string) => `„${name}“ neu starten?`,
  restartBody: 'Stoppt die World und baut sie neu auf, um Einstellungen anzuwenden, die einen World-Neustart erfordern. Verwaltete Prozesse und Verbindungen werden gestoppt und neu gestartet.',
  missingReasonDefault: 'Diese World konnte nicht geladen werden.',
  activateWorld: 'World aktivieren',
  inactiveNoteManual: (id: string) => `Lokal implementiert, aber nicht assembliert. Zum Aktivieren setze worlds.${id}.enabled in config.json auf true und starte neu.`,
  hideFromAgent: 'Vor dem Agenten verbergen',
  showToAgent: 'Dem Agenten zeigen',
  restartWorld: 'World neu starten',
  deactivateWorld: 'World deaktivieren',
  prefixPending: 'Präfix-Neuladen ausstehend',
  noWorlds: 'Keine Worlds',
  listLoadFailed: (msg: string) => `World-Liste konnte nicht geladen werden: ${msg}`,
  loading: 'Lädt…',
};
