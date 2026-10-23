import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Sveglie',
  desc: 'Sveglie che Coo ha impostato. Coo viene avvisato quando ne elimini una qui.',
  head: ['Ora', 'Nota', 'Impostata il', ''],
  daily: 'Ogni giorno',
  empty: 'Coo non ha sveglie impostate.',
  remove: 'Elimina',
  confirmTitle: (when) => `Eliminare la sveglia delle ${when}?`,
  removed: 'Eliminata',
  failed: (msg) => `Impossibile eliminare: ${msg}`,
  loadFailed: (msg) => `Impossibile caricare: ${msg}`,
};
