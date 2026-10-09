import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'クリアして再開',
  title: 'この会話をクリアして、Coo を最初からやり直しますか？',
  body: 'Coo はこの会話のコンテキストを忘れ、現在のシステムプロンプトから再開します。元に戻せません。ワークスペースの記憶と Persona は残ります。',
  clearing: 'クリアしています…',
  cleared: 'クリアして再開しました',
  failed: (why: string) => `クリアできませんでした：${why}`,
  // release.ts
  repoHint: 'GitHub で Coopanion のプロジェクトを開く',
  update: (latest: string) => `Coopanion ${latest} が公開されました：更新をダウンロード`,
};
