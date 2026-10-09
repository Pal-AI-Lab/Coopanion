import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: '執行軌跡', model: '模型', settings: '設定', advanced: '進階',
  toAdvanced: '進階模式', toAdvancedHint: '顯示 Cortico 的全部設定：模型、擴充功能、World、記憶與執行診斷',
  toNormal: '回到一般模式', toNormalHint: '只顯示與桌寵相關的頁面',
  featureLoadFailed: (label: string) => `「${label}」未能載入`,
};
