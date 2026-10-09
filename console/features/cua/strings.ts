import { pick } from '../../core/language.ts';
import { S as zhHant } from './strings.zh-Hant.ts';
import { S as ja } from './strings.ja.ts';
import { S as ko } from './strings.ko.ts';
import { S as fr } from './strings.fr.ts';
import { S as de } from './strings.de.ts';
import { S as es419 } from './strings.es-419.ts';
import { S as ptBR } from './strings.pt-BR.ts';
import { S as it } from './strings.it.ts';
import { S as ru } from './strings.ru.ts';

const zh = {
  nav: '电脑操作',
  title: '电脑操作',
  enabled: '让 Coo 操作这台电脑',
  enabledHint: '关掉后 Coo 看不到屏幕,也碰不到鼠标和键盘。',
  control: '允许动鼠标和键盘',
  controlHint: '关掉后只能截图和查看有哪些窗口。',
  permission: '什么时候先问你',
  levels: { 'ask-each-turn': '每轮都问', 'ask-before-acting': '动手前问', 'ask-once': '问一次', 'never-ask': '不问' },
  levelHints: {
    'ask-each-turn': '每一轮 Coo 第一次看屏幕或动鼠标键盘之前,先在气泡里问你。',
    'ask-before-acting': '看屏幕不问;每一轮第一次动鼠标键盘之前问你。',
    'ask-once': '看屏幕不问;动鼠标键盘之前问一次,同意后在「同意管多久」之内不再问。',
    'never-ask': '看屏幕和动鼠标键盘都不问。',
  },
  grant: '同意管多久',
  grantSuffix: '分钟',
  grantBad: (min: number, max: number) => `要填 ${min} 到 ${max} 之间的整数`,
  more: '让位时长、截图尺寸等其余参数在高级模式的「电脑操作」World 页。',
  saved: '已保存',
  turnedOn: '已打开电脑操作',
  turnedOff: '已关闭电脑操作',
  saveFailed: (why: string) => `没保存上:${why}`,
};

export const en: typeof zh = {
  nav: 'Computer use',
  title: 'Computer use',
  enabled: 'Let Coo use this computer',
  enabledHint: 'When off, Coo can neither see the screen nor touch the mouse and keyboard.',
  control: 'Allow the mouse and keyboard',
  controlHint: 'When off, Coo can only take screenshots and list windows.',
  permission: 'When to ask you',
  levels: { 'ask-each-turn': 'Every turn', 'ask-before-acting': 'Before acting', 'ask-once': 'Once', 'never-ask': 'Never' },
  levelHints: {
    'ask-each-turn': 'Every turn, Coo asks in its bubble before it first looks at the screen or uses the mouse and keyboard.',
    'ask-before-acting': 'Looking is not asked; every turn, Coo asks before it first uses the mouse and keyboard.',
    'ask-once': 'Looking is not asked; Coo asks once before using the mouse and keyboard, and after a yes not again for as long as set below.',
    'never-ask': 'Coo never asks, neither to look nor to act.',
  },
  grant: 'A yes lasts',
  grantSuffix: 'minutes',
  grantBad: (min: number, max: number) => `Enter a whole number from ${min} to ${max}`,
  more: 'Yielding to you, screenshot sizes and the other settings are on the Computer use World page in the advanced mode.',
  saved: 'Saved',
  turnedOn: 'Computer use is on',
  turnedOff: 'Computer use is off',
  saveFailed: (why: string) => `Not saved: ${why}`,
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
