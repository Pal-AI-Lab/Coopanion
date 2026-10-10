import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '電腦操作',
  enabled: '讓 Coo 操作這台電腦',
  enabledHint: '關閉後 Coo 看不到螢幕，也碰不到滑鼠和鍵盤。',
  control: '允許動滑鼠和鍵盤',
  controlHint: '關閉後只能截圖和查看有哪些視窗。',
  permission: '詢問時機',
  levels: { 'ask-each-turn': '每輪都問', 'ask-before-acting': '動手前問', 'ask-once': '問一次', 'never-ask': '不問' },
  levelHints: {
    'ask-each-turn': '每一輪 Coo 第一次看螢幕或動滑鼠鍵盤之前，先在氣泡裡問你。',
    'ask-before-acting': '看螢幕不問；每一輪第一次動滑鼠鍵盤之前問你。',
    'ask-once': '看螢幕不問；動滑鼠鍵盤之前問一次，同意後在「同意有效期」之內不再問。',
    'never-ask': '看螢幕和動滑鼠鍵盤都不問。',
  },
  grant: '同意有效期',
  grantSuffix: '分鐘',
  grantBad: (min: number, max: number) => `請填 ${min} 到 ${max} 之間的整數`,
  more: '讓位時長、截圖尺寸等其餘參數在進階模式的「電腦操作」World 頁。',
  saveFailed: (why: string) => `沒有儲存：${why}`,
  enabledLabel: '使用電腦',
  controlLabel: '滑鼠與鍵盤',
};
