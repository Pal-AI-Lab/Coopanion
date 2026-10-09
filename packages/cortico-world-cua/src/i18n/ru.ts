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
    no: 'Нет',
  },

  preflight: {
    noDisplay: 'World управления компьютером в Linux требует X11 (или XWayland под Wayland): переменная DISPLAY не задана.',
    unsupported: 'World управления компьютером работает только в Windows, macOS и Linux.',
  },

  console: {
    label: 'Управление компьютером',
    engine: 'Движок ввода',
    screen: (w: number, h: number) => `Экран ${w}×${h}`,
    onDemand: 'Запускается по необходимости',
    exited: (code: number | null) => `Процесс движка завершился (код выхода ${code})`,
    control: 'Управление',
    allowed: 'Разрешено',
    viewOnly: 'Только просмотр',
    asking: 'Спрашивает',
    levels: { 'ask-each-turn': 'Каждый ход', 'ask-before-acting': 'Перед действием', 'ask-once': (minutes: number) => `Раз в ${minutes} мин`, 'never-ask': 'Никогда' },
    envPrompt: { title: 'Окружение управления компьютером', description: 'Координаты скриншотов, правила, как не мешать человеку, и что можно делать.' },
    vars: {
      'cua.os': 'Система этого компьютера: Windows или Mac',
      'cua.keys': 'Распространённые сочетания клавиш в этой системе',
      'cua.shot': 'Размер скриншота',
      'cua.control': 'Можно ли управлять мышью и клавиатурой',
      'cua.idle': 'Сколько не мешать (секунды)',
      'cua.permission': 'Когда сначала спрашивать человека (по настройке permission)',
    },
  },

  config: {
    group: 'Управление компьютером',
    control: { title: 'Разрешить мышь и клавиатуру', description: 'Если выключено, только скриншоты и список окон.' },
    permission: { title: 'Когда сначала спрашивать вас', description: 'ask-each-turn: перед просмотром экрана или действием, каждый ход; ask-before-acting: смотреть можно свободно, спрашивает перед использованием мыши и клавиатуры каждый ход; ask-once: смотреть можно свободно, спрашивает один раз перед использованием мыши и клавиатуры, и согласие действует в течение «Сколько действует согласие»; never-ask: никогда не спрашивает.' },
    grantMinutes: { title: 'Сколько действует согласие', suffix: 'мин', description: 'Только для ask-once.' },
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
