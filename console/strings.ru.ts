import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Свернуть боковую панель', expandSidebar: 'Развернуть боковую панель',
  goBack: 'Назад', goForward: 'Вперёд',
  trace: 'Консоль', integrations: 'Интеграции', personaMemory: 'Личность и память', diagnostics: 'Устранение неполадок',
  toAdvanced: 'Расширенный режим', toAdvancedHint: "Показать поставщиков моделей, Persona, Memory и диагностику",
  toNormal: 'Вернуться в обычный режим', toNormalHint: "Показать страницы питомца и расширений World",
  featureLoadFailed: (label: string) => `Не удалось загрузить «${label}»`,
  running: 'Работает', paused: 'На паузе',
};
