import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'アラーム',
  desc: 'Coo が設定したアラームです。ここで削除すると Coo に通知されます。',
  setAt: '設定日時',
  daily: '毎日',
  empty: 'Coo が設定しているアラームはありません。',
  remove: '削除',
  confirmTitle: (when) => `${when} のアラームを削除しますか？`,
  removed: '削除しました',
  failed: (msg) => `削除できませんでした：${msg}`,
  loadFailed: (msg) => `読み込めませんでした：${msg}`,
  search: '内容や時刻で検索',
  noMatch: '一致するアラームはありません。',
  perPage: '1 ページの件数',
  shown: (from: number, to: number, total: number) => `${total} 件中 ${from}–${to} 件`,
  prevPage: '‹ 前へ',
  nextPage: '次へ ›',
};
