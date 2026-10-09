import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: '清空重來',
  title: '清空目前的對話，讓 Coo 從頭開始？',
  body: 'Coo 會忘掉這段對話的上下文，依現在的系統提示詞重新開始，無法復原。工作區裡的記憶和人設都會保留。',
  clearing: '正在清空…',
  cleared: '已清空重來',
  failed: (why: string) => `沒有清空：${why}`,
  // release.ts
  repoHint: '在 GitHub 上開啟 Coopanion 專案',
  update: (latest: string) => `Coopanion ${latest} 已發布，點這裡下載更新`,
};
