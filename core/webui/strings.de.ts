import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Wecker',
  desc: 'Wecker, die Coo gestellt hat. Coo erfährt es, wenn du hier einen löschst.',
  head: ['Zeit', 'Notiz', 'Gestellt am', ''],
  daily: 'Täglich',
  empty: 'Coo hat keine Wecker gestellt.',
  remove: 'Löschen',
  confirmTitle: (when) => `Wecker für ${when} löschen?`,
  removed: 'Gelöscht',
  failed: (msg) => `Löschen fehlgeschlagen: ${msg}`,
  loadFailed: (msg) => `Laden fehlgeschlagen: ${msg}`,
};
