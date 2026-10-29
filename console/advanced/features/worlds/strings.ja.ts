import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "自分の World",
  marketTab: "拡張マーケット",
  extensionList: "拡張機能一覧",
  filterByName: "名前で絞り込む",
  allStates: "すべての状態",
  noMatches: "フィルターに一致する拡張はありません。",
  newGroup: "グループを作成",
  groupDefaultName: "新しいグループ",
  renameGroup: "グループ名を変更",
  deleteGroup: "グループを削除（拡張は残ります）",
  pendingNote: "上の拡張はプロセスの再起動後に反映されます。",
  packageInfo: "拡張の情報",
  updateAvailable: (from: string, to: string) => `更新があります：${from} → ${to}`,
  hideFromSidebar: "サイドバーに表示しない",
  showInSidebar: "サイドバーに表示",
  builtinAlwaysOn: "内蔵の World は常にオンです。",
  modeOff: "停止中",
  modeRunning: "実行のみ",
  modeAttached: "接続中",

  navLabel: 'World 拡張',
  introTitle: 'World 拡張',
  prefixReloadFailed: (msg: string) => `プレフィックスの再読み込みに失敗しました：${msg}`,
  toggleFailed: (msg: string) => `切り替えに失敗しました：${msg}`,
  reloadNowTitle: '今すぐシステムプレフィックスを再読み込みしますか？',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `「${name}」はエージェントから再び見えるようになりました。` : `「${name}」をエージェントから隠しました。`)
    + '\n\nイベント配信は既に新しい状態に従っています。再読み込みすると環境プロンプトとツール宣言が更新され、既存の会話は保持されます。'
    + 'キャンセルした場合は、次のコンテキスト引き継ぎか再起動のときに更新されます。',
  deactivateTitle: (name: string) => `「${name}」を無効化しますか？`,
  deactivateBody: (id: string) =>
    'World は直ちに停止し（管理している外部プロセスと接続も終了処理されます）、config.json に '
    + `worlds.${id}.enabled=false を書き戻します。エージェントの環境プロンプトとツールはすぐに取り下げられ、再び有効化すると現在の設定から再構築されます。`,
  restartTitle: (name: string) => `「${name}」を再起動しますか？`,
  restartBody: 'World を停止して再構築し、「World の再起動後に反映」と表示された設定を適用します。管理しているプロセスと接続は停止した後に再起動します。',
  missingReasonDefault: 'この World を読み込めません。',
  activateWorld: 'World を有効化',
  inactiveNoteManual: (id: string) => `ローカルに実装はありますが、構成に含まれていません。有効にするには config.json の worlds.${id}.enabled を true にして再起動してください。`,
  hideFromAgent: 'エージェントから隠す',
  showToAgent: 'エージェントに表示',
  restartWorld: 'World を再起動',
  deactivateWorld: 'World を無効化',
  prefixPending: 'プレフィックスの再読み込み待ち',
  noWorlds: 'World がありません',
  listLoadFailed: (msg: string) => `World 一覧を読み込めませんでした：${msg}`,
  loading: '読み込み中…',
};
