import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'コンピューター操作',
  enabled: 'Coo にこのコンピューターを使わせる',
  enabledHint: 'オフのときは、Coo は画面を見ることも、マウスやキーボードに触れることもできません。',
  control: 'マウスとキーボードを許可',
  controlHint: 'オフのときは、Coo はスクリーンショットを撮ることとウィンドウ一覧を見ることしかできません。',
  permission: 'いつ確認するか',
  levels: { 'ask-each-turn': '毎ターン', 'ask-before-acting': '操作の前', 'ask-once': '一度だけ', 'never-ask': '確認しない' },
  levelHints: {
    'ask-each-turn': '毎ターン、Coo は最初に画面を見る前、またはマウスとキーボードを使う前に、吹き出しで確認します。',
    'ask-before-acting': '画面を見るときは確認しません。毎ターン、Coo は最初にマウスとキーボードを使う前に確認します。',
    'ask-once': '画面を見るときは確認しません。マウスとキーボードを使う前に一度だけ確認し、許可したあとは下で設定した時間のあいだ確認しません。',
    'never-ask': 'Coo は画面を見るときも操作するときも確認しません。',
  },
  grant: '許可の有効時間',
  grantSuffix: '分',
  grantBad: (min: number, max: number) => `${min} から ${max} までの整数を入力してください`,
  more: 'あなたに譲る時間、スクリーンショットのサイズなどの設定は、詳細モードの「コンピューター操作」World ページにあります。',
  saved: '保存しました',
  turnedOn: 'コンピューター操作をオンにしました',
  turnedOff: 'コンピューター操作をオフにしました',
  saveFailed: (why: string) => `保存できませんでした：${why}`,
  enabledLabel: 'コンピューターの使用',
  controlLabel: 'マウスとキーボード',
};
