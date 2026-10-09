import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

const pluralRules = new Intl.PluralRules('ru');
const plural = (n: number, one: string, few: string, many: string) => {
  const form = pluralRules.select(n);
  return form === 'one' ? one : form === 'many' ? many : few;
};

export const S: Partial<typeof en> = {
  nav: 'Чат',
  title: 'Чат',
  trace: 'Трассировка',
  traceHint: 'Полная трассировка в расширенном режиме: контекст, вызовы инструментов и исходные события',
  placeholder: (bot: string) => `Сообщение для ${bot}…`,
  connecting: 'Подключение…',
  empty: (bot: string) => `Разговоров с ${bot} пока нет.`,
  older: 'Ранее',
  voice: 'Голос',
  idle: 'Ожидание',
  thinking: (bot: string) => `${bot} думает…`,
  doing: (what: string) => `Сейчас: ${what}`,
  retry: (at: string) => `Модель не ответила; повтор в ${at}`,
  handoff: 'Прошлый разговор приводится в порядок',
  paused: 'На паузе · сообщения дойдут после продолжения',
  queued: (bot: string) => `В очереди; ${bot} прочитает после этого шага`,
  queuedPaused: 'На паузе; будет доставлено после продолжения',
  sendNow: 'Отправить сейчас',
  sendNowHint: (bot: string) => `Прервать то, что делает ${bot}, и доставить сейчас`,
  withdraw: 'Забрать',
  withdrawHint: 'Вернуть в поле ввода',
  discarded: 'Не доставлено: очередь очищена',
  imageCount: (n: number) => `[${n} ${plural(n, 'изображение', 'изображения', 'изображений')}]`,
  ownAnswer: 'Свой ответ…',
  send: 'Отправить',
  computer: 'Работа с компьютером',
  steps: (n: number) => `${n} ${plural(n, 'шаг', 'шага', 'шагов')}`,
  things: (n: number) => `Сделано ${n} ${plural(n, 'дело', 'дела', 'дел')}`,
  seconds: (s: number) => `${s} с`,
  imagesUnseen: (bot: string) => `Текущая модель не видит изображения; ${bot} узнает только, сколько вы их отправили.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, и ${b} ненадолго в отключке` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `Вы разбудили ${b} тычком` : t.count > 1 ? `Вы ткнули ${b} ${t.count} ${plural(t.count, 'раз', 'раза', 'раз')}` : `Вы ткнули ${b}`;
      case 'pet': return t.count > 1 ? `Вы погладили ${b} несколько раз` : `Вы погладили ${b}`;
      case 'throw': return `Вы подняли ${b} и бросили${out}`;
      case 'drop': return `Вы перенесли ${b} в другое место${out}`;
      default: return `Сильный удар о землю, ${b} ненадолго в отключке`;
    }
  },
};

export const STEP: Partial<typeof stepEn> = {
  cua_screenshot: 'Скриншот', cua_click: 'Щелчок', cua_move: 'Движение мыши', cua_drag: 'Перетаскивание', cua_scroll: 'Прокрутка', cua_type: 'Ввод текста',
  cua_key: 'Нажатие клавиш', cua_windows: 'Список окон', cua_focus: 'Переключение окна', cua_wait: 'Ожидание',
  pet_walk_to: 'Прогулка', pet_act: 'Движение', pet_set: 'Настройка себя', pet_quiet: 'Тишина',
};
