import { pick } from './base/language.ts';
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
  collapseSidebar: '折叠侧栏', expandSidebar: '展开侧栏',
  goBack: '后退', goForward: '前进',
  trace: '控制台', integrations: '接入', personaMemory: '人格与记忆', diagnostics: '诊断',
  toAdvanced: '高级模式', toAdvancedHint: "显示模型供应商、Persona、Memory 与诊断",
  toNormal: '回到普通模式', toNormalHint: "显示桌宠与 World 扩展页面",
  /** feature 挂载抛错时那张错误卡的标题 */
  featureLoadFailed: (label: string) => `「${label}」加载失败`,
  /** 左下角暂停/继续键右边的运行状态 */
  running: '运行中', paused: '已暂停',
};

export const en: typeof zh = {
  collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar',
  goBack: 'Back', goForward: 'Forward',
  trace: 'Console', integrations: 'Integrations', personaMemory: 'Persona & Memory', diagnostics: 'Troubleshooting',
  toAdvanced: 'Advanced mode', toAdvancedHint: "Show model providers, Persona, Memory and diagnostics",
  toNormal: 'Back to normal mode', toNormalHint: "Show pet and World extension pages",
  featureLoadFailed: (label: string) => `"${label}" failed to load`,
  running: 'Running', paused: 'Paused',
};

export const L = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
