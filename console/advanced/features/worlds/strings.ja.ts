import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "自分の World",
  marketTab: "World 拡張機能",
  extensionList: "拡張機能一覧",
  configure: "設定",
  packageInfo: "インストール情報",
  modeOff: "停止中",
  modeRunning: "実行のみ",
  modeAttached: "接続中",

  navLabel: 'World 一覧',
  introTitle: 'World',
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
  declaredByPersona: 'Persona で定義',
  optionalAddon: 'オプションのアドオン',
  open: '開く',
  missingReasonDefault: 'この World を読み込めません。',
  activateWorld: 'World を有効化',
  inactiveNoteManual: (id: string) => `ローカルに実装はありますが、構成に含まれていません。有効にするには config.json の worlds.${id}.enabled を true にして再起動してください。`,
  hideFromAgent: 'エージェントから隠す',
  showToAgent: 'エージェントに表示',
  restartWorld: 'World を再起動',
  deactivateWorld: 'World を無効化',
  prefixPending: 'プレフィックスの再読み込み待ち',
  kvTools: 'ツール',
  kvNone: '（なし）',
  kvWorkspace: 'ワークスペース',
  listSep: '、',
  driftNote: 'イベント配信は既に新しい状態に従っています。環境プロンプトとツール宣言はプレフィックスの再読み込み後に更新されます。',
  noWorlds: 'World がありません',
  listLoadFailed: (msg: string) => `World 一覧を読み込めませんでした：${msg}`,
  loading: '読み込み中…',
};
