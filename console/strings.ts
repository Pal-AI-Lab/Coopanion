import { pick } from './core/language.ts';
import { L as zhHant } from './strings.zh-Hant.ts';
import { L as ja } from './strings.ja.ts';
import { L as ko } from './strings.ko.ts';
import { L as fr } from './strings.fr.ts';
import { L as de } from './strings.de.ts';
import { L as es419 } from './strings.es-419.ts';
import { L as ptBR } from './strings.pt-BR.ts';
import { L as it } from './strings.it.ts';
import { L as ru } from './strings.ru.ts';

const zh = {
  trace: '运行轨迹', model: '模型', settings: '设置', advanced: '高级',
  toAdvanced: '高级模式', toAdvancedHint: '显示 Cortico 的全部设置：模型、扩展、World、记忆与运行诊断',
  toNormal: '回到普通模式', toNormalHint: '只显示关于桌宠的页面',
  /** feature 挂载抛错时那张错误卡的标题 */
  featureLoadFailed: (label: string) => `「${label}」加载失败`,
  /** 左下角暂停/继续键左边的运行状态 */
  running: '运行中', paused: '已暂停',
};

export const en: typeof zh = {
  trace: 'Run trace', model: 'Model', settings: 'Settings', advanced: 'Advanced',
  toAdvanced: 'Advanced mode', toAdvancedHint: 'Show all of Cortico: models, extensions, Worlds, memory and diagnostics',
  toNormal: 'Back to normal mode', toNormalHint: 'Show only the pages about the pet',
  featureLoadFailed: (label: string) => `"${label}" failed to load`,
  running: 'Running', paused: 'Paused',
};

export const L = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
