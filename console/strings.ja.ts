import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: '実行トレース', model: 'モデル', settings: '設定', advanced: '詳細',
  toAdvanced: '詳細モード', toAdvancedHint: 'Cortico のすべての設定を表示：モデル、拡張機能、World、記憶、実行診断',
  toNormal: '通常モードに戻る', toNormalHint: 'ペットに関するページだけを表示',
  featureLoadFailed: (label: string) => `「${label}」を読み込めませんでした`,
};
