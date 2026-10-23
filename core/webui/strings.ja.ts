import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'アラーム',
  desc: 'Coo が設定したアラームです。ここで削除すると Coo に通知されます。',
  head: ['時刻', '内容', '設定日時', ''],
  daily: '毎日',
  empty: 'Coo が設定しているアラームはありません。',
  remove: '削除',
  confirmTitle: (when) => `${when} のアラームを削除しますか？`,
  removed: '削除しました',
  failed: (msg) => `削除できませんでした：${msg}`,
  loadFailed: (msg) => `読み込めませんでした：${msg}`,
};
