import { pick } from '../base/language.ts';
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
  // advanced/features/prompts/index.ts
  button: "清空对话并重开",
  title: "清空当前对话并重开？",
  body: "将先保存本页修改，再清空 Coo 当前对话的上下文，使用更新后的系统提示词重新开始。清空无法撤销；Memory 和人设保留。",
  clearing: "正在开始新对话…",
  cleared: "已开始新对话",
  // release.ts
  updateShort: (version: string) => `v${version} 可更新`,
  updateDownloadingShort: (version: string) => `正在下载 v${version}`,
  updateReadyShort: (version: string) => `v${version} 已就绪`,
  updateFailedShort: (version: string) => `下载 v${version}`,
  repoHint: '在 GitHub 上打开 Coopanion 项目',
  update: (latest: string) => `Coopanion ${latest} 已发布，点击下载更新`,
  updateDownloading: (version: string) => `Coopanion ${version} 正在后台下载`,
  updateReady: (version: string) => `Coopanion ${version} 已下载，退出时自动安装`,
  updateFailed: (version: string) => `Coopanion ${version} 没能自动下载，点击手动下载`,
};

export const en: typeof zh = {
  // advanced/features/prompts/index.ts
  button: "Clear conversation and restart",
  title: "Clear the current conversation and restart?",
  body: "Save edits on this page, then clear Coo’s current conversation context and restart with the updated system prompt. Clearing cannot be undone. Memory and persona are kept.",
  clearing: "Starting a new conversation…",
  cleared: "New conversation started",
  // release.ts
  updateShort: (version: string) => `v${version} available`,
  updateDownloadingShort: (version: string) => `Downloading v${version}`,
  updateReadyShort: (version: string) => `v${version} ready`,
  updateFailedShort: (version: string) => `Download v${version}`,
  repoHint: 'Open the Coopanion project on GitHub',
  update: (latest: string) => `Coopanion ${latest} is out: download the update`,
  updateDownloading: (version: string) => `Coopanion ${version} is downloading in the background`,
  updateReady: (version: string) => `Coopanion ${version} is downloaded and installs when you quit`,
  updateFailed: (version: string) => `Coopanion ${version} did not download: download it by hand`,
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
