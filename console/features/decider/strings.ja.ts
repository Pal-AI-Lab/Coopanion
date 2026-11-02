import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '表情の決定',
  enabled: '決定モデルに表情と動作を選ばせる',
  enabledHint: 'Coo は吹き出しごとに気持ちを一文書き、OpenRouter の決定モデルが表情と動作を選びます。システムプロンプトに単語表は入りません。',
  privacy: 'オンの間、決定のたびに、吹き出しの言葉、Coo の気持ち、今の姿の名前・説明・着せ替えと表情と動作の一覧を OpenRouter に送信します。',
  key: 'API Key',
  keySave: '保存',
  keyHint: 'デプロイのフォルダーに保存され、OpenRouter にだけ送られます。保存しても表情の決定はオンになりません。',
  keySaved: 'API Key を保存しました',
  status: '状態',
  on: '決定モデルを使用中です。',
  off: 'オフ：表情と動作は Coo が自分で書きます。',
  needKey: 'オン：OpenRouter の API Key を設定すると有効になります。',
  lastFailed: (why: string) => `前回の決定は失敗しました：${why}。`,
  saveFailed: (why: string) => `保存できませんでした：${why}`,
};
