import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: 'Трассировка', model: 'Модель', settings: 'Настройки', advanced: 'Дополнительно',
  toAdvanced: 'Расширенный режим', toAdvancedHint: 'Показать всё в Cortico: модели, расширения, World, память и диагностику',
  toNormal: 'Вернуться в обычный режим', toNormalHint: 'Показывать только страницы о питомце',
  featureLoadFailed: (label: string) => `Не удалось загрузить «${label}»`,
};
