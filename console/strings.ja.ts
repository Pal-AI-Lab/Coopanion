import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'サイドバーを折りたたむ', expandSidebar: 'サイドバーを展開',
  goBack: '戻る', goForward: '進む',
  trace: 'コンソール', integrations: '連携', personaMemory: '人格と記憶', diagnostics: '診断',
  toAdvanced: '詳細モード', toAdvancedHint: 'Cortico のすべての設定を表示：モデル、拡張機能、World、記憶、実行診断',
  toNormal: '通常モードに戻る', toNormalHint: 'ペットに関するページだけを表示',
  featureLoadFailed: (label: string) => `「${label}」を読み込めませんでした`,
  running: '実行中', paused: '一時停止中',
};
