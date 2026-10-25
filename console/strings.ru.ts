import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Свернуть боковую панель', expandSidebar: 'Развернуть боковую панель',
  goBack: 'Назад', goForward: 'Вперёд',
  trace: 'Консоль', integrations: 'Интеграции', personaMemory: 'Личность и память', diagnostics: 'Устранение неполадок',
  toAdvanced: 'Расширенный режим', toAdvancedHint: 'Показать всё в Cortico: модели, расширения, World, память и диагностику',
  toNormal: 'Вернуться в обычный режим', toNormalHint: 'Показывать только страницы о питомце',
  featureLoadFailed: (label: string) => `Не удалось загрузить «${label}»`,
  running: 'Работает', paused: 'На паузе',
};
