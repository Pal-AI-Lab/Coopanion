import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const ja: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} がこのコンピューターを使いたがっています：画面を見て、マウスとキーボードを操作します。今回は許可しますか？`,
    once: (who: string, minutes: number) => `${who} がマウスとキーボードを使いたがっています。これから ${minutes} 分間許可しますか？`,
    acting: (who: string) => `${who} がマウスとキーボードを使いたがっています。今回は許可しますか？`,
    caption: 'コンピューター操作',
    yes: 'はい',
    no: '今回は許可しない',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} がターミナルウィンドウ「${window}」に次の内容を入力しようとしています：\n${text}\n入力した内容はコマンドとして実行される可能性があります。許可すると ${minutes} 分間は、ターミナルウィンドウでの入力・キー操作と win+r を確認しません。許可しますか？`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} がターミナルウィンドウ「${window}」で ${keys} を押そうとしています。許可すると ${minutes} 分間は、ターミナルウィンドウでの入力・キー操作と win+r を確認しません。許可しますか？`,
      runBox: (who: string, keys: string, minutes: number) => `${who} が ${keys} を押して「ファイル名を指定して実行」を開こうとしています。プログラムの起動やコマンドの実行ができます。許可すると ${minutes} 分間は、ターミナルウィンドウでの入力・キー操作と win+r を確認しません。許可しますか？`,
    },
  },

  preflight: {
    noDisplay: 'コンピューター操作は Linux では X11（Wayland では XWayland）が必要です：DISPLAY が設定されていません。',
    unsupported: 'コンピューター操作は Windows、macOS、Linux でのみ動作します。',
  },

  console: {
    engine: '入力エンジン',
    screen: (w: number, h: number) => `画面 ${w}×${h}`,
    onDemand: '必要なときに起動',
    exited: (code: number | null) => `エンジンのプロセスが終了しました（終了コード ${code}）`,
    allowed: '許可',
    viewOnly: '見るだけ',
    asking: '確認',
    levels: { 'ask-each-turn': '毎ターン', 'ask-before-acting': '操作の前', 'ask-once': (minutes: number) => `${minutes} 分ごとに 1 回`, 'never-ask': '確認しない' },
  },

  config: {
    group: 'コンピューター操作',
    enabled: { title: 'コンピューター操作を使う' },
    control: { title: 'マウスとキーボードを許可', description: 'オフのときは、スクリーンショットとウィンドウ一覧だけです。' },
    permission: { title: 'いつ確認するか', description: 'ask-each-turn：毎ターン、画面を見る前や操作の前に確認します。ask-before-acting：画面を見るのは確認なし、毎ターンマウスとキーボードを使う前に確認します。ask-once：画面を見るのは確認なし、マウスとキーボードを使う前に一度だけ確認し、許可は「許可の有効時間」のあいだ続きます。never-ask：確認しません。「ターミナルと『ファイル名を指定して実行』の前の確認をオフにする」がオフのときは、どの設定でも、ターミナルウィンドウでの入力・キー操作と win+r の前に一度だけ別に確認し、許可は「許可の有効時間」のあいだ続きます。' },
    grantMinutes: { title: '許可の有効時間', suffix: '分', description: 'ask-once と、ターミナルウィンドウについての個別の確認に使われます。' },
    skipTerminalAsk: { title: 'ターミナルと「ファイル名を指定して実行」の前の確認をオフにする', description: 'オンにすると、ターミナルウィンドウでの入力・キー操作と win+r の前に個別の確認をせず、ほかの操作と同じく「いつ確認するか」に従います。never-ask のときは、Coo が確認なしでコマンドを実行できます。' },
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
