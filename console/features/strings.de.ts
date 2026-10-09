import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'Leeren und neu starten',
  title: 'Dieses Gespräch leeren und Coo von vorn beginnen lassen?',
  body: 'Coo vergisst den Kontext dieses Gesprächs und beginnt wieder mit dem aktuellen System-Prompt. Das lässt sich nicht rückgängig machen. Gedächtnis und Persona im Arbeitsbereich bleiben erhalten.',
  clearing: 'Wird geleert…',
  cleared: 'Geleert und neu gestartet',
  failed: (why: string) => `Nicht geleert: ${why}`,
  // release.ts
  repoHint: 'Das Coopanion-Projekt auf GitHub öffnen',
  update: (latest: string) => `Coopanion ${latest} ist da: Update herunterladen`,
};
