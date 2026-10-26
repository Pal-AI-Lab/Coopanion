import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const pluralRules = new Intl.PluralRules('ru');
const plural = (n: number, one: string, few: string, many: string) => {
  const form = pluralRules.select(n);
  return form === 'one' ? one : form === 'many' ? many : few;
};

const ru: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} хочет воспользоваться вашим компьютером: смотреть на экран и управлять мышью и клавиатурой. Можно в этот раз?`,
    once: (who: string, minutes: number) => `${who} хочет управлять вашей мышью и клавиатурой. Можно на ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}?`,
    acting: (who: string) => `${who} хочет управлять вашей мышью и клавиатурой. Можно в этот раз?`,
    caption: 'Управление компьютером',
    yes: 'Да',
    no: 'В этот раз нет',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} хочет ввести в окне терминала «${window}»:\n${text}\nВведённое может выполниться как команда. После согласия ввод и клавиши в окнах терминала и win+r не спрашиваются ${minutes} мин. Можно?`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} хочет нажать ${keys} в окне терминала «${window}». После согласия ввод и клавиши в окнах терминала и win+r не спрашиваются ${minutes} мин. Можно?`,
      runBox: (who: string, keys: string, minutes: number) => `${who} хочет нажать ${keys}, чтобы открыть окно «Выполнить»: оно может запускать программы и команды. После согласия ввод и клавиши в окнах терминала и win+r не спрашиваются ${minutes} мин. Можно?`,
    },
  },

  preflight: {
    noDisplay: 'Управление компьютером в Linux требует X11 (или XWayland под Wayland): переменная DISPLAY не задана.',
    unsupported: 'Управление компьютером работает только в Windows, macOS и Linux.',
  },

  console: {
    engine: 'Движок ввода',
    screen: (w: number, h: number) => `Экран ${w}×${h}`,
    onDemand: 'Запускается по необходимости',
    exited: (code: number | null) => `Процесс движка завершился (код выхода ${code})`,
    allowed: 'Разрешено',
    viewOnly: 'Только просмотр',
    asking: 'Спрашивает',
    levels: { 'ask-each-turn': 'Каждый ход', 'ask-before-acting': 'Перед действием', 'ask-once': (minutes: number) => `Раз в ${minutes} мин`, 'never-ask': 'Никогда' },
  },

  config: {
    group: 'Управление компьютером',
    enabled: { title: 'Включить управление компьютером' },
    control: { title: 'Разрешить мышь и клавиатуру', description: 'Если выключено, только скриншоты и список окон.' },
    permission: { title: 'Когда спрашивать вас', description: 'ask-each-turn: перед просмотром экрана или действием, каждый ход; ask-before-acting: смотреть можно свободно, спрашивает перед использованием мыши и клавиатуры каждый ход; ask-once: смотреть можно свободно, спрашивает один раз перед использованием мыши и клавиатуры, и после согласия не спрашивает в течение срока «Согласие действует»; never-ask: никогда не спрашивает. Пока параметр «Отключить вопрос перед терминалом и окном „Выполнить“» выключен, при любой настройке перед вводом или нажатием клавиш в окне терминала и перед win+r спрашивает отдельно один раз; согласие действует в течение срока «Согласие действует».' },
    grantMinutes: { title: 'Согласие действует', suffix: 'мин', description: 'Для ask-once и для отдельного вопроса об окнах терминала.' },
    skipTerminalAsk: { title: 'Отключить вопрос перед терминалом и окном «Выполнить»', description: 'Если включено, перед вводом или нажатием клавиш в окне терминала и перед win+r отдельного вопроса нет: действует «Когда спрашивать вас», как для любого другого ввода. При never-ask Coo может выполнять команды, не спрашивая вас.' },
    userIdleMs: { title: 'Не мешать в течение', description: 'После того как вы пользовались мышью или клавиатурой, ждёт, пока они пробудут в покое столько времени.' },
    maxYieldWaitMs: { title: 'Максимальное ожидание вас' },
    maxWidth: { title: 'Максимальная ширина скриншота' },
    maxHeight: { title: 'Максимальная высота скриншота' },
    quality: { title: 'Качество скриншота' },
    afterAction: { title: 'Скриншот после каждого действия' },
    settleMs: { title: 'Пауза перед скриншотом' },
  },
};

export default ru;
