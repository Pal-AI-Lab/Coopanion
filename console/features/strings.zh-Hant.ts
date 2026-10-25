import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "清空對話並重開",
  title: "清空目前對話並重開？",
  body: "先儲存本頁修改，再清空 Coo 目前對話的上下文，使用更新後的系統提示詞重新開始。清空無法復原；Memory 和人設保留。",
  clearing: "正在開始新對話…",
  cleared: "已開始新對話",
  // release.ts
  updateShort: (version: string) => `v${version} 可更新`,
  updateDownloadingShort: (version: string) => `正在下載 v${version}`,
  updateReadyShort: (version: string) => `v${version} 已就緒`,
  updateFailedShort: (version: string) => `下載 v${version}`,
  repoHint: '在 GitHub 上開啟 Coopanion 專案',
  update: (latest: string) => `Coopanion ${latest} 已發布，點這裡下載更新`,
  updateDownloading: (version: string) => `Coopanion ${version} 正在背景下載`,
  updateReady: (version: string) => `Coopanion ${version} 已下載，結束時自動安裝`,
  updateFailed: (version: string) => `Coopanion ${version} 沒能自動下載，點這裡手動下載`,
};
