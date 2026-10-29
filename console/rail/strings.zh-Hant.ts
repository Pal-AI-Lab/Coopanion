import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: '設定導覽',
  groupWorlds: 'World',
  moduleInstancesAria: 'World 實例',

  runResume: '繼續執行',
  runPause: '暫停執行',
  shutdownAria: '關機',
  finishing: '正在關閉…',
  shutdownTitle: '關機',
  shutdownBody: '處理程序將結束，連線將中斷。',
  confirmShutdownTitle: '⚠ 關機',
  confirmShutdownAgainTitle: '⚠⚠ 確認關機？',
  confirmShutdownAgainBody: '停止執行並結束處理程序？',
  finishingToast: '正在關閉…',
  stepIncomplete: '未完成',
  doneShutdown: '已關機',
  resultLocalIncomplete: '本機關閉步驟未全部完成',
  resultExternalUnverified: '本機已關機，外部狀態未確認',
  resultUnverified: '關閉步驟已執行，狀態未確認',
  resultDefault: '關閉步驟已執行。',
  noReceipt: (msg: string) =>
    `未收到關閉結果（${msg}）；處理程序可能已結束。`,
  docTitle: (name: string) => `設定 · ${name}`,
  renameTitle: '點擊重新命名',
  renameSaved: '顯示名稱已儲存',
  renameFailed: (msg: string) => `顯示名稱未能儲存：${msg}`,
  // avatar.ts
  changeAvatar: '更換 Coo 的頭像',
  uploadAvatar: '上傳並裁剪 Coo 的頭像',
  unreadable: '無法讀取這張圖片',
  cropPreview: '頭像裁剪預覽',
  zoomAria: '頭像縮放',
  zoom: '縮放',
  note: '拖曳圖片調整位置，捲動滑鼠滾輪或使用滑桿縮放；儲存後寫入 Coo 資料目錄裡的 avatar.png。',
  cancel: '取消',
  save: '儲存頭像',
  cropTitle: '裁剪頭像',
  noCanvas: '瀏覽器無法建立圖片畫布',
  saved: '頭像已儲存',
};
