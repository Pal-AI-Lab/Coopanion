import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: 'Einstellungsnavigation',
  groupWorlds: 'World',
  moduleInstancesAria: 'World-Instanzen',

  runResume: 'Fortsetzen',
  runPause: 'Pausieren',
  shutdownAria: 'Herunterfahren',
  finishing: 'Wird heruntergefahren…',
  shutdownTitle: 'Herunterfahren',
  shutdownBody: 'Der Prozess wird beendet und die Verbindung getrennt.',
  confirmShutdownTitle: '⚠ Herunterfahren',
  confirmShutdownAgainTitle: '⚠⚠ Herunterfahren bestätigen?',
  confirmShutdownAgainBody: 'Lauf stoppen und Prozess beenden?',
  finishingToast: 'Wird heruntergefahren…',
  stepIncomplete: 'unvollständig',
  doneShutdown: 'Heruntergefahren',
  resultLocalIncomplete: 'Lokale Schritte zum Herunterfahren unvollständig',
  resultExternalUnverified: 'Lokal heruntergefahren; externer Zustand nicht geprüft',
  resultUnverified: 'Schritte zum Herunterfahren ausgeführt; Zustand nicht geprüft',
  resultDefault: 'Schritte zum Herunterfahren ausgeführt.',
  noReceipt: (msg: string) =>
    `Kein Ergebnis des Herunterfahrens erhalten (${msg}); der Prozess ist möglicherweise beendet.`,
  docTitle: (name: string) => `Einstellungen · ${name}`,
  renameTitle: 'Zum Umbenennen klicken',
  renameSaved: 'Anzeigename gespeichert',
  renameFailed: (msg: string) => `Anzeigename nicht gespeichert: ${msg}`,
  // avatar.ts
  changeAvatar: 'Avatar von Coo ändern',
  uploadAvatar: 'Avatar von Coo hochladen und zuschneiden',
  unreadable: 'Dieses Bild konnte nicht gelesen werden',
  cropPreview: 'Vorschau des Avatar-Zuschnitts',
  zoomAria: 'Avatar-Zoom',
  zoom: 'Zoom',
  note: 'Ziehe das Bild, um es zu verschieben; zoome mit dem Mausrad oder dem Schieberegler. Speichern schreibt avatar.png ins Datenverzeichnis von Coo.',
  cancel: 'Abbrechen',
  save: 'Avatar speichern',
  cropTitle: 'Avatar zuschneiden',
  noCanvas: 'Der Browser konnte keine Bild-Canvas erstellen',
  saved: 'Avatar gespeichert',
};
