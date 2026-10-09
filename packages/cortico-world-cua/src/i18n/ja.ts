import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const ja: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} がこのコンピューターを使いたがっています：画面を見て、マウスとキーボードを操作します。今回は許可しますか？`,
    once: (who: string, minutes: number) => `${who} がマウスとキーボードを使いたがっています。これから ${minutes} 分間許可しますか？`,
    acting: (who: string) => `${who} がマウスとキーボードを使いたがっています。今回は許可しますか？`,
    caption: 'コンピューター操作',
    yes: 'はい',
    no: 'いいえ',
  },

  preflight: {
    noDisplay: 'コンピューター操作 World は Linux では X11（Wayland では XWayland）が必要です：DISPLAY が設定されていません。',
    unsupported: 'コンピューター操作 World は Windows、macOS、Linux でのみ動作します。',
  },

  console: {
    label: 'コンピューター操作',
    engine: '入力エンジン',
    screen: (w: number, h: number) => `画面 ${w}×${h}`,
    onDemand: '必要なときに起動',
    exited: (code: number | null) => `エンジンのプロセスが終了しました（終了コード ${code}）`,
    control: '操作',
    allowed: '許可',
    viewOnly: '見るだけ',
    asking: '確認',
    levels: { 'ask-each-turn': '毎ターン', 'ask-before-acting': '操作の前', 'ask-once': (minutes: number) => `${minutes} 分ごとに 1 回`, 'never-ask': '確認しない' },
    envPrompt: { title: 'コンピューター操作の環境', description: 'スクリーンショットの座標、ユーザーの邪魔をしないためのルール、できる操作の範囲。' },
    vars: {
      'cua.os': 'このコンピューターのシステム：Windows または Mac',
      'cua.keys': 'このシステムでよく使うショートカット',
      'cua.shot': 'スクリーンショットのサイズ',
      'cua.control': 'マウスとキーボードを使ってよいか',
      'cua.idle': 'ユーザーに譲る時間（秒）',
      'cua.permission': 'いつ先にユーザーに確認するか（permission の設定による）',
    },
  },

  config: {
    group: 'コンピューター操作',
    control: { title: 'マウスとキーボードを許可', description: 'オフのときは、スクリーンショットとウィンドウ一覧だけです。' },
    permission: { title: 'いつ先に確認するか', description: 'ask-each-turn：毎ターン、画面を見る前や操作の前に確認します。ask-before-acting：画面を見るのは確認なし、毎ターンマウスとキーボードを使う前に確認します。ask-once：画面を見るのは確認なし、マウスとキーボードを使う前に一度だけ確認し、許可は「許可の有効時間」のあいだ続きます。never-ask：確認しません。' },
    grantMinutes: { title: '許可の有効時間', suffix: '分', description: 'ask-once のときだけ使われます。' },
    userIdleMs: { title: 'ユーザーに譲る時間', description: 'あなたがマウスやキーボードを使ったあと、操作がこの時間止まるまで待ちます。' },
    maxYieldWaitMs: { title: 'ユーザーを待つ最長時間' },
    maxWidth: { title: 'スクリーンショットの最大幅' },
    maxHeight: { title: 'スクリーンショットの最大高さ' },
    quality: { title: 'スクリーンショットの画質' },
    afterAction: { title: '操作のたびにスクリーンショット' },
    settleMs: { title: 'スクリーンショット前の待ち時間' },
  },
};

export default ja;
