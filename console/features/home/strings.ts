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
  modelTitle: '连接模型',
  modelNeed: (first: string) => `选一家供应商，填入它的 API Key 就能开始。拿不准就选 ${first}。`,
  more: '更多',
  toIntl: '改用国际平台',
  toCn: '改用中国大陆平台',
  keyLabel: (name: string) => `${name} 的 API Key`,
  modelLabel: '模型',
  keepKey: '留空沿用已保存的 Key',
  getKey: (name: string) => `去 ${name} 申请 Key`,
  saveStart: '保存并开始',
  test: '测试连接',
  otherProvider: '没找到？手动设置其他模型',
  toAdvancedTitle: '是否切换为高级模式？',
  toAdvancedBody: '其他模型服务需在高级模式的「模型」页中设置。之后可在左下角切换回普通模式。',
  testing: '正在测试…',
  testOk: (ms: number | null) => `连接正常${ms !== null ? `，耗时 ${ms} ms` : ''}`,
  testFail: (why: string) => `连接失败：${why}`,
  started: '已连接，Coo 开始运行。',
  petTitle: '我的桌宠',
  petShown: '在桌面上',
  petHidden: '已隐藏',
  showPet: '在桌面上显示',
  dress: '装扮',
  guide: '使用向导',
  guideHint: '由 Coo 在屏幕底部重新演示一遍使用向导',
  hidePet: '在桌面上隐藏',
  connectedLabel: '已连接的模型：',
  choicesLabel: '可选择的模型：',
  notConnected: '暂未连接',
  schemeTitle: '配色方案',
};

export const en: typeof zh = {
  nav: 'Start',
  modelTitle: 'Connect a model',
  modelNeed: (first: string) => `Pick a provider and enter its API Key to start. ${first} if unsure.`,
  more: 'More',
  toIntl: 'Use the international platform',
  toCn: 'Use the mainland China platform',
  keyLabel: (name: string) => `${name} API Key`,
  modelLabel: 'Model',
  keepKey: 'Leave empty to keep the saved key',
  getKey: (name: string) => `Get an API Key from ${name}`,
  saveStart: 'Save and start',
  test: 'Test',
  otherProvider: 'Not listed? Set up another model by hand',
  toAdvancedTitle: 'Switch to advanced mode?',
  toAdvancedBody: 'Other model services are set up on the Model page of advanced mode. You can switch back to normal mode at the bottom left.',
  testing: 'Testing…',
  testOk: (ms: number | null) => `Connection works${ms !== null ? `, ${ms} ms` : ''}`,
  testFail: (why: string) => `Connection failed: ${why}`,
  started: 'Connected. Coo is running.',
  petTitle: 'My desktop pet',
  petShown: 'On the desktop',
  petHidden: 'Hidden',
  showPet: 'Show on the desktop',
  dress: 'Dress up',
  guide: 'Guide',
  guideHint: 'Coo runs the guide again at the bottom of the screen',
  hidePet: 'Hide from the desktop',
  connectedLabel: 'Connected model:',
  choicesLabel: 'Available models:',
  notConnected: 'Not connected',
  schemeTitle: 'Color scheme',
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
