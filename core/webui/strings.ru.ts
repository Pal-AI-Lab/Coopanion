import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Будильники',
  desc: 'Будильники, которые поставил Coo. Если удалить будильник здесь, Coo получит уведомление.',
  head: ['Время', 'Заметка', 'Поставлен', ''],
  daily: 'Каждый день',
  empty: 'У Coo нет будильников.',
  remove: 'Удалить',
  confirmTitle: (when) => `Удалить будильник на ${when}?`,
  removed: 'Удалён',
  failed: (msg) => `Не удалось удалить: ${msg}`,
  loadFailed: (msg) => `Не удалось загрузить: ${msg}`,
};
