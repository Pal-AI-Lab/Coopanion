import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '鬧鐘',
  desc: 'Coo 設的鬧鐘。在這裡刪除後，Coo 會收到通知。',
  head: ['時間', '內容', '設定於', ''],
  daily: '每天',
  empty: 'Coo 現在沒有設鬧鐘。',
  remove: '刪除',
  confirmTitle: (when) => `刪除 ${when} 的鬧鐘？`,
  removed: '已刪除',
  failed: (msg) => `刪除失敗：${msg}`,
  loadFailed: (msg) => `讀取失敗：${msg}`,
};
