import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: 'Navigazione delle impostazioni',
  groupWorlds: 'World',
  moduleInstancesAria: 'Istanze dei World',

  runResume: 'Riprendi',
  runPause: 'Metti in pausa',
  shutdownAria: 'Arresta',
  finishing: 'Arresto in corso…',
  shutdownTitle: 'Arresta',
  shutdownBody: 'Il processo terminerà e la connessione verrà chiusa.',
  confirmShutdownTitle: '⚠ Arresta',
  confirmShutdownAgainTitle: "⚠⚠ Confermare l'arresto?",
  confirmShutdownAgainBody: "Fermare l'esecuzione e uscire dal processo?",
  finishingToast: 'Arresto in corso…',
  stepIncomplete: 'incompleto',
  doneShutdown: 'Arrestato',
  resultLocalIncomplete: 'Passaggi di arresto locale incompleti',
  resultExternalUnverified: 'Arrestato in locale; stato esterno non verificato',
  resultUnverified: 'Passaggi di arresto eseguiti; stato non verificato',
  resultDefault: 'Passaggi di arresto eseguiti.',
  noReceipt: (msg: string) =>
    `Nessun risultato di arresto ricevuto (${msg}); il processo potrebbe essere terminato.`,
  docTitle: (name: string) => `Impostazioni · ${name}`,
  renameTitle: 'Clicca per rinominare',
  renameSaved: 'Nome visualizzato salvato',
  renameFailed: (msg: string) => `Nome visualizzato non salvato: ${msg}`,
  // avatar.ts
  changeAvatar: "Cambia l'avatar di Coo",
  uploadAvatar: "Carica e ritaglia l'avatar di Coo",
  unreadable: 'Impossibile leggere questa immagine',
  cropPreview: "Anteprima del ritaglio dell'avatar",
  zoomAria: "Zoom dell'avatar",
  zoom: 'Zoom',
  note: "Trascina l'immagine per riposizionarla; usa la rotella del mouse o il cursore per lo zoom. Il salvataggio scrive avatar.png nella directory dei dati di Coo.",
  cancel: 'Annulla',
  save: 'Salva avatar',
  cropTitle: 'Ritaglia avatar',
  noCanvas: 'Il browser non è riuscito a creare un canvas per immagini',
  saved: 'Avatar salvato',
};
