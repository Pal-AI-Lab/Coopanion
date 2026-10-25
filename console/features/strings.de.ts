import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "Gespräch löschen und neu starten",
  title: "Aktuelles Gespräch löschen und neu starten?",
  body: "Speichert Änderungen dieser Seite, löscht dann Coos aktuellen Gesprächskontext und startet mit dem aktualisierten Systemprompt neu. Das Löschen lässt sich nicht rückgängig machen. Memory und Persona bleiben erhalten.",
  clearing: "Neues Gespräch wird gestartet…",
  cleared: "Neues Gespräch gestartet",
  // release.ts
  updateShort: (version: string) => `v${version} verfügbar`,
  updateDownloadingShort: (version: string) => `v${version} wird geladen`,
  updateReadyShort: (version: string) => `v${version} bereit`,
  updateFailedShort: (version: string) => `v${version} herunterladen`,
  repoHint: 'Das Coopanion-Projekt auf GitHub öffnen',
  update: (latest: string) => `Coopanion ${latest} ist da: Update herunterladen`,
  updateDownloading: (version: string) => `Coopanion ${version} wird im Hintergrund heruntergeladen`,
  updateReady: (version: string) => `Coopanion ${version} ist heruntergeladen und wird beim Beenden installiert`,
  updateFailed: (version: string) => `Coopanion ${version} wurde nicht heruntergeladen: manuell herunterladen`,
};
