import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '表情決策',
  enabled: '由決策模型挑選表情和動作',
  enabledHint: 'Coo 每個氣泡寫一句心情，由 OpenRouter 上的決策模型挑選表情和動作，系統提示詞裡不再放詞表。',
  privacy: '開啟後，每次決策會把氣泡的話、Coo 的心情，以及目前形象的名字、介紹、裝扮和表情動作列表傳送給 OpenRouter。',
  key: 'API Key',
  keySave: '儲存',
  keyHint: '儲存在部署目錄，只傳送給 OpenRouter。儲存 API Key 不會開啟表情決策。',
  keySaved: 'API Key 已儲存',
  status: '狀態',
  on: '正在使用決策模型。',
  off: '已關閉，表情和動作由 Coo 自己寫。',
  needKey: '已開啟，填寫 OpenRouter 的 API Key 後生效。',
  lastFailed: (why: string) => `上次決策失敗：${why}。`,
  saveFailed: (why: string) => `儲存失敗：${why}`,
};
