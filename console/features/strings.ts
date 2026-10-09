import { pick } from '../core/language.ts';
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
  // clear-session.ts
  button: '清空重开',
  title: '清空当前对话,让 Coo 从头开始?',
  body: 'Coo 会忘掉这段对话的上下文,按现在的系统提示词重新开始,不能撤销。工作区里的记忆和人设都保留。',
  clearing: '正在清空…',
  cleared: '已清空重开',
  failed: (why: string) => `没清空:${why}`,
  // release.ts
  repoHint: '在 GitHub 上打开 Coopanion 项目',
  update: (latest: string) => `Coopanion ${latest} 已发布,点这里下载更新`,
};

export const en: typeof zh = {
  // clear-session.ts
  button: 'Clear and restart',
  title: 'Clear this conversation and start Coo afresh?',
  body: 'Coo forgets the context of this conversation and starts again from the current system prompt. This cannot be undone. Memory and persona in the workspace stay.',
  clearing: 'Clearing…',
  cleared: 'Cleared and restarted',
  failed: (why: string) => `Not cleared: ${why}`,
  // release.ts
  repoHint: 'Open the Coopanion project on GitHub',
  update: (latest: string) => `Coopanion ${latest} is out: download the update`,
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
