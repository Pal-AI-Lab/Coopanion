import { pick } from '../../base/language.ts';
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
  title: '电脑操作',
  enabled: '让 Coo 操作这台电脑',
  control: '允许操作鼠标和键盘',
  controlHint: '关闭时只能查看屏幕。',
  permission: '询问时机',
  levels: { 'ask-each-turn': '每轮询问', 'ask-before-acting': '操作前询问', 'ask-once': '询问一次', 'never-ask': '从不询问' },
  levelHints: {
    'ask-each-turn': '每轮首次查看屏幕或操作鼠标键盘前询问。',
    'ask-before-acting': '查看屏幕不询问；每轮首次操作鼠标键盘前询问。',
    'ask-once': '查看屏幕不询问；操作前询问一次，有效期内不再询问。',
    'never-ask': '查看屏幕和操作都不询问。',
  },
  grant: '同意有效期',
  grantSuffix: '分钟',
  grantBad: (min: number, max: number) => `请填写 ${min} 到 ${max} 之间的整数`,
  more: '更多配置在高级模式「桌宠」页的「配置」页签。',
  saveFailed: (why: string) => `保存失败：${why}`,
  enabledLabel: '使用电脑',
  controlLabel: '鼠标与键盘',
  /** The dialog before computer use is turned on: `riskDanger` is drawn bold between `riskLead` and `riskAfter`, `risks` in red. */
  riskTitle: '让 Coo 操作这台电脑？',
  riskLead: '打开后，Coo 将会观察你的屏幕，操作你的鼠标和键盘。',
  riskDanger: '这可能非常危险',
  riskAfter: '，请确认你理解以下内容：',
  risks: ['屏幕截图（可能包含你的隐私内容，如聊天记录）将会发给上游模型服务', 'Coo 可能会点错地方、打错字，或者进入错误的窗口。时刻确保你能随时观察并打断 Coo。', '付款、密码一类涉及敏感信息、现实操作或无法撤回的操作，请不要交给 Coo。'] as string[],
  riskNote: 'Coo 会在你操作鼠标或键盘时自动停止。你可以随时关闭这个功能。',
  riskOk: '打开',
};

export const en: typeof zh = {
  title: 'Computer use',
  enabled: 'Let Coo use this computer',
  control: 'Allow the mouse and keyboard',
  controlHint: 'When off, Coo can only look at the screen.',
  permission: 'When to ask you',
  levels: { 'ask-each-turn': 'Every turn', 'ask-before-acting': 'Before acting', 'ask-once': 'Once', 'never-ask': 'Never' },
  levelHints: {
    'ask-each-turn': 'Asks every turn before first looking at the screen or using the mouse and keyboard.',
    'ask-before-acting': 'Looking is not asked; asks every turn before first using the mouse and keyboard.',
    'ask-once': 'Looking is not asked; asks once before acting, then not again while the yes lasts.',
    'never-ask': 'Never asks.',
  },
  grant: 'A yes lasts',
  grantSuffix: 'minutes',
  grantBad: (min: number, max: number) => `Enter a whole number from ${min} to ${max}`,
  more: 'More settings are on the Config tab of the Desktop pet page in the advanced mode.',
  saveFailed: (why: string) => `Not saved: ${why}`,
  enabledLabel: 'Use the computer',
  controlLabel: 'Mouse and keyboard',
  riskTitle: 'Let Coo use this computer?',
  riskLead: 'Once this is on, Coo will watch your screen and use your mouse and keyboard. ',
  riskDanger: 'This can be very dangerous',
  riskAfter: '; make sure you understand the following:',
  risks: ['Screenshots, which may show private things such as your chats, are sent to the model service you use', 'Coo may click the wrong place, mistype, or end up in the wrong window. Always make sure you can watch and stop Coo at any time.', 'Do not hand Coo payments, passwords or anything else that involves sensitive information, real-world actions or cannot be undone.'],
  riskNote: 'Coo stops automatically when you use the mouse or keyboard. You can turn this off at any time.',
  riskOk: 'Turn on',
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
