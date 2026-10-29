import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'サイドバーを折りたたむ', expandSidebar: 'サイドバーを展開',
  goBack: '戻る', goForward: '進む',
  trace: 'コンソール', integrations: '連携', personaMemory: '人格と記憶', diagnostics: '診断',
  toAdvanced: '詳細モード', toAdvancedHint: "モデルプロバイダー、Persona、Memory、診断を表示",
  toNormal: '通常モードに戻る', toNormalHint: "ペットと World 拡張機能のページを表示",
  featureLoadFailed: (label: string) => `「${label}」を読み込めませんでした`,
  running: '実行中', paused: '一時停止中',
};
