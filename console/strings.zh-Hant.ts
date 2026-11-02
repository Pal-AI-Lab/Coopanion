import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: '收合側邊欄', expandSidebar: '展開側邊欄',
  goBack: '上一頁', goForward: '下一頁',
  trace: '控制台', integrations: '整合', personaMemory: '人格與記憶', diagnostics: '診斷',
  toAdvanced: '進階模式', toAdvancedHint: "顯示模型供應商、Persona、Memory 與診斷",
  toNormal: '回到一般模式', toNormalHint: "顯示桌寵與 World 擴充功能頁面",
  featureLoadFailed: (label: string) => `「${label}」未能載入`,
  running: '執行中', paused: '已暫停',
};
