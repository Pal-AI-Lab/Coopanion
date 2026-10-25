import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "会話を消去して再開",
  title: "現在の会話を消去して再開しますか？",
  body: "このページの編集を保存し、Coo の現在の会話の文脈を消去して、更新したシステムプロンプトで再開します。消去は取り消せません。Memory と人格は保持します。",
  clearing: "新しい会話を開始中…",
  cleared: "新しい会話を開始しました",
  // release.ts
  updateShort: (version: string) => `v${version} 更新あり`,
  updateDownloadingShort: (version: string) => `v${version} ダウンロード中`,
  updateReadyShort: (version: string) => `v${version} 準備完了`,
  updateFailedShort: (version: string) => `v${version} をダウンロード`,
  repoHint: 'GitHub で Coopanion のプロジェクトを開く',
  update: (latest: string) => `Coopanion ${latest} が公開されました：更新をダウンロード`,
  updateDownloading: (version: string) => `Coopanion ${version} をバックグラウンドでダウンロード中`,
  updateReady: (version: string) => `Coopanion ${version} をダウンロードしました。終了時に自動でインストールします`,
  updateFailed: (version: string) => `Coopanion ${version} を自動でダウンロードできませんでした：手動でダウンロード`,
};
