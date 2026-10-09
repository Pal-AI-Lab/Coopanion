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
  nav: '开始',
  title: 'Coo',
  running: '醒着',
  paused: '暂停中',
  noModel: '还没连上模型',
  modelTitle: '连接模型',
  modelNeed: (first: string) => `选一家模型服务,填入它的 API Key 就能开始。拿不准就选 ${first}。`,
  more: '更多',
  toIntl: '改用国际平台',
  toCn: '改用中国大陆平台',
  keyLabel: (name: string) => `${name} 的 API Key`,
  modelLabel: '模型',
  keepKey: '留空沿用已保存的 Key',
  getKey: (name: string) => `去${name}申请 Key`,
  saveStart: '保存并开始',
  connected: (model: string, title: string) => `已连接 ${title} · ${model}`,
  test: '测试连接',
  changeKey: '换一家、换模型或换 Key',
  otherProvider: '用别的模型服务',
  toAdvancedTitle: '是否切换为高级模式?',
  toAdvancedBody: '别的模型服务在高级模式的「模型」页里设置。之后可在左下角重新切换回普通模式。',
  testing: '正在测试…',
  testOk: (ms: number | null) => `连接正常${ms !== null ? `,耗时 ${ms} ms` : ''}`,
  testFail: (why: string) => `连接失败:${why}`,
  started: '好了,Coo 醒了。',
  petTitle: '桌宠',
  petShown: '在桌面上',
  petHidden: '没有显示',
  showPet: '显示桌宠',
  dress: '装扮',
  petNote: '鼠标停在桌宠身上会出现打字和麦克风两个按钮;右键打开菜单;按住可以拎起来。',
  guide: '使用引导',
  guideHint: '让 Coo 在屏幕底边再带你走一遍',
};

export const en: typeof zh = {
  nav: 'Start',
  title: 'Coo',
  running: 'Awake',
  paused: 'Paused',
  noModel: 'No model connected',
  modelTitle: 'Connect a model',
  modelNeed: (first: string) => `Pick a model service and enter its API Key to start. ${first} if unsure.`,
  more: 'More',
  toIntl: 'Use the international platform',
  toCn: 'Use the mainland China platform',
  keyLabel: (name: string) => `${name} API Key`,
  modelLabel: 'Model',
  keepKey: 'Leave empty to keep the saved key',
  getKey: (name: string) => `Get an API Key from ${name}`,
  saveStart: 'Save and start',
  connected: (model: string, title: string) => `Connected to ${title} · ${model}`,
  test: 'Test',
  changeKey: 'Change service, model or key',
  otherProvider: 'Use another model service',
  toAdvancedTitle: 'Switch to advanced mode?',
  toAdvancedBody: 'Other model services are set up on the Model page of advanced mode. You can switch back to normal mode at the bottom left.',
  testing: 'Testing…',
  testOk: (ms: number | null) => `Connection works${ms !== null ? `, ${ms} ms` : ''}`,
  testFail: (why: string) => `Connection failed: ${why}`,
  started: 'Done. Coo is awake.',
  petTitle: 'Desktop pet',
  petShown: 'On the desktop',
  petHidden: 'Not shown',
  showPet: 'Show pet',
  dress: 'Dress up',
  petNote: 'Hover the pet for the typing and microphone buttons; right-click for the menu; hold it to pick it up.',
  guide: 'Guide',
  guideHint: 'Coo walks you through it again at the bottom of the screen',
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
