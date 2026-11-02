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
  title: '表情决策',
  enabled: '由决策模型挑选表情和动作',
  enabledHint: 'Coo 每个气泡写一句心情，由 OpenRouter 上的决策模型挑选表情和动作，系统提示词里不再放词表。',
  privacy: '开启后，每次决策会把气泡的话、Coo 的心情，以及当前形象的名字、介绍、装扮和表情动作列表发送给 OpenRouter。',
  key: 'API Key',
  keySave: '保存',
  keyHint: '保存在部署目录，只发送给 OpenRouter。保存 API Key 不会开启表情决策。',
  keySaved: 'API Key 已保存',
  status: '状态',
  on: '正在使用决策模型。',
  off: '已关闭，表情和动作由 Coo 自己写。',
  needKey: '已开启，填写 OpenRouter 的 API Key 后生效。',
  lastFailed: (why: string) => `上次决策失败：${why}。`,
  saveFailed: (why: string) => `保存失败：${why}`,
};

export const en: typeof zh = {
  title: 'Expression decisions',
  enabled: 'Let a decision model pick expressions and motions',
  enabledHint: 'Coo writes how it feels with each bubble, and a decision model on OpenRouter picks the expressions and motions; the system prompt no longer carries the word table.',
  privacy: 'While this is on, each decision sends OpenRouter the bubble’s text, Coo’s feeling, and the current figure’s name, description, dress and list of expressions and motions.',
  key: 'API Key',
  keySave: 'Save',
  keyHint: 'Kept in the deployment folder and sent only to OpenRouter. Saving it does not turn expression decisions on.',
  keySaved: 'API Key saved',
  status: 'Status',
  on: 'A decision model is in use.',
  off: 'Off; Coo writes its expressions and motions itself.',
  needKey: 'On; it takes effect once an OpenRouter API Key is set.',
  lastFailed: (why) => `The last decision failed: ${why}.`,
  saveFailed: (why) => `Not saved: ${why}`,
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
