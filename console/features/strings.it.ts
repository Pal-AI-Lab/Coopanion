import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "Cancella conversazione e ricomincia",
  title: "Cancellare la conversazione attuale e ricominciare?",
  body: "Salva le modifiche di questa pagina, cancella il contesto della conversazione attuale di Coo e ricomincia con il prompt di sistema aggiornato. La cancellazione è irreversibile. Memory e la personalità vengono mantenuti.",
  clearing: "Avvio della nuova conversazione…",
  cleared: "Nuova conversazione avviata",
  // release.ts
  updateShort: (version: string) => `v${version} disponibile`,
  updateDownloadingShort: (version: string) => `Download di v${version}`,
  updateReadyShort: (version: string) => `v${version} pronta`,
  updateFailedShort: (version: string) => `Scarica v${version}`,
  repoHint: 'Apri il progetto Coopanion su GitHub',
  update: (latest: string) => `È uscito Coopanion ${latest}: scarica l'aggiornamento`,
  updateDownloading: (version: string) => `Coopanion ${version} si sta scaricando in background`,
  updateReady: (version: string) => `Coopanion ${version} è scaricato e si installa all'uscita`,
  updateFailed: (version: string) => `Coopanion ${version} non si è scaricato: scaricalo a mano`,
};
