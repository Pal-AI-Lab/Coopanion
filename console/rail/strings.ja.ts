import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: '設定のナビゲーション',
  groupWorlds: 'World',
  moduleInstancesAria: 'World インスタンス',

  runResume: '再開',
  runPause: '一時停止',
  shutdownAria: 'シャットダウン',
  finishing: 'シャットダウン中…',
  shutdownTitle: 'シャットダウン',
  shutdownBody: 'プロセスが終了し、接続が切断されます。',
  confirmShutdownTitle: '⚠ シャットダウン',
  confirmShutdownAgainTitle: '⚠⚠ シャットダウンしますか？',
  confirmShutdownAgainBody: '実行を停止してプロセスを終了しますか？',
  finishingToast: 'シャットダウン中…',
  stepIncomplete: '未完了',
  doneShutdown: 'シャットダウン完了',
  resultLocalIncomplete: 'ローカルのシャットダウン手順が一部完了していません',
  resultExternalUnverified: 'ローカルはシャットダウン済み、外部の状態は未確認',
  resultUnverified: 'シャットダウン手順を実行済み、状態は未確認',
  resultDefault: 'シャットダウン手順を実行しました。',
  noReceipt: (msg: string) =>
    `シャットダウンの結果を受信できませんでした（${msg}）。プロセスは既に終了している可能性があります。`,
  docTitle: (name: string) => `設定 · ${name}`,
  renameTitle: 'クリックして名前を変更',
  renameSaved: '表示名を保存しました',
  renameFailed: (msg: string) => `表示名を保存できませんでした：${msg}`,
  // avatar.ts
  changeAvatar: 'Coo のアバターを変更',
  uploadAvatar: 'Coo のアバターをアップロードして切り抜く',
  unreadable: 'この画像を読み込めません',
  cropPreview: 'アバターの切り抜きプレビュー',
  zoomAria: 'アバターの拡大縮小',
  zoom: '拡大縮小',
  note: '画像をドラッグして位置を調整し、マウスホイールかスライダーで拡大縮小します。保存すると Coo のデータディレクトリの avatar.png に書き込みます。',
  cancel: 'キャンセル',
  save: 'アバターを保存',
  cropTitle: 'アバターの切り抜き',
  noCanvas: 'ブラウザーで画像キャンバスを作成できません',
  saved: 'アバターを保存しました',
};
