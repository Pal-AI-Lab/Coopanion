import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '鬧鐘',
  desc: 'Coo 設的鬧鐘。在這裡刪除後，Coo 會收到通知。',
  setAt: '設定於',
  daily: '每天',
  empty: 'Coo 現在沒有設鬧鐘。',
  remove: '刪除',
  confirmTitle: (when) => `刪除 ${when} 的鬧鐘？`,
  removed: '已刪除',
  failed: (msg) => `刪除失敗：${msg}`,
  loadFailed: (msg) => `讀取失敗：${msg}`,
  search: '搜尋內容或時間',
  noMatch: '沒有符合的鬧鐘。',
  perPage: '每頁顯示',
  shown: (from: number, to: number, total: number) => `顯示 ${from}–${to}，共 ${total} 筆`,
  prevPage: '‹ 上一頁',
  nextPage: '下一頁 ›',
};
