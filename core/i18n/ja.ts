import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const ja: Translation<CoreText> = {
  settings: {
    language: { title: '言語', description: '画面の表示と Coo の話す言葉にこの言語を使います。すぐに反映されます。' },
    telemetry: { title: '匿名の利用統計', description: '会話内容を含まない利用回数と設定を送信し、Coopanion の改善に役立てます。送信する項目は docs/TELEMETRY.md に記載されています。' },
    contextRing: { title: 'コンテキストリング', description: 'チャットページの入力欄に、以前の会話を整理するまでの残りを円で表示します。' },
    roundsSoft: { title: 'まとめのリマインド', suffix: '回', description: '1 回のウェイクでモデルへのリクエストがこの回数に達すると、今の作業を片付けてターンを終えるよう Coo に促します。' },
    roundsHard: { title: '1 回のウェイクのリクエスト上限', suffix: '回', description: '1 回のウェイクでモデルにリクエストできる最大回数です。達するとターンが終わります。' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `モデルへのリクエストが ${n} 回続けて失敗しました。エラー${status ? ` ${status}` : ''}：${reason}。設定の「スタート」ページでモデル名と API Key を確認してください。接続のテストもそこでできます。`,
    reasoningReplay: (n: number) => `モデルへのリクエストが ${n} 回続けて失敗しました。このサービスはツールを呼び出すたびに思考内容を送り返すよう求めていますが、Coopanion ではこのサービスに対してそれがオフになっています。開発者に報告してください：https://github.com/Pal-AI-Lab/Coopanion/issues`,
    open: '設定を開く',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `バージョン ${v} が出ました。バックグラウンドでダウンロードしていて、準備ができたらお知らせします。`,
    ready: (v: string) => `バージョン ${v} のダウンロードが終わりました。今すぐ再起動して更新しますか？あとにする場合は、次にアプリを終了するときにインストールされます。`,
    failed: (v: string, why: string) => `バージョン ${v} をダウンロードできませんでした：${why}。GitHub から自分でダウンロードできます。`,
    ok: 'OK', github: 'GitHub からダウンロード', install: '再起動して更新', later: 'あとで', gotIt: 'OK',
    trouble: 'うまくいかない？', githubByHand: 'GitHub から手動でダウンロード',
  },

  quit: 'アプリを終了',

  noticeLabel: 'アプリの通知',

  status: {
    read: '読み取り中', browse: '閲覧中', memory: '記憶', find: '探索中', search: '検索中', write: '書き込み中', edit: '編集中', append: '追記中',
    delete: '削除中', moveFile: '移動中', save: '保存中', screen: '画面を確認中', windows: '開いているウィンドウを確認中', rightClick: '右クリック中', doubleClick: 'ダブルクリック中', click: 'クリック中',
    move: 'マウスを移動中', drag: 'ドラッグ中', scroll: 'スクロール中', focus: 'ウィンドウを切り替え中', type: '入力中', key: 'キー入力中', wait: '待機中',
    alarmSet: 'アラームを設定中', alarmList: 'アラームを確認中', alarmCancel: 'アラームを取り消し中',
    quoted: (text: string) => `「${text}」`,
    seconds: (n: number) => `${n} 秒`,
    minutesLater: (n: number) => `${n} 分後`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `ペットが ${figure} の「${preset}」に変わったときに適用`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['友だち', 'friend'], ['その他', 'other'], ['ないしょ', 'skip']],
    hello: 'やっほー！ぼくは Coo。今日から画面のいちばん下に住むね、クー…',
    helloReply: 'こんにちは、Coo！',
    askName: 'なんて呼べばいい？',
    nameSend: 'そう呼んで',
    gotName: (name: string) => `${name}、覚えたよ！`,
    askSource: 'ぼくのこと、どこで知ったの？',
    sourceThanks: 'そっか、なるほどね、クー…',
    askPersona: 'ぼく、どんな子がいいと思う…？',
    personas: {
      coo: { label: '小さくて好奇心旺盛', line: 'これなに？ちょっとのぞいてみるね、クー…' },
      grail: { label: '甘えんぼうで欲ばり', line: 'なに食べてるの？あたしにもひと口ちょうだい、クー…' },
      forge: { label: '頼もしくて手際がいい', line: '何する？任せて、すぐ終わらせるよ、クー。' },
      heart: { label: '元気でいつもそばに', line: '来たよ！今日もずっとそばにいるね、クー！' },
      winter: { label: '静かで無口', line: '……うん、クー。' },
      whale: { label: 'DeepSeekちゃん', line: 'おかえり！これなに？ちょっと見せて、クー…' },
    },
    dressHint: { text: '配色は 着せ替え で変えられるよ', dress: '着せ替え' },
    askRoam: 'ふだんは静かにしてるのと、元気に動き回るの、どっちがいい？クリックしてみて、どうするか見せるね。',
    roam: {
      off: { label: 'じっとする', level: '低', line: 'じゃあおとなしく立ってて、呼ばれたら動くね。' },
      calm: { label: 'ときどき歩く', level: '中', line: 'ときどき散歩して、あとはだいたいじっとしてるね。' },
      free: { label: 'よく歩く', level: '高', line: 'あちこち走り回るよ、クー…！' },
    },
    roamOk: 'これにする',
    roamDone: 'うん、こうするね。',
    wakeTitle: '反応モード',
    askWake: '反応モード：ぼくをつついたり、なでたり、持ち上げたりしたとき、いつ反応しようか？',
    wake: {
      none: { label: '静か', note: 'ふれあいは覚えておいて、話しかけたときにまとめて反応する' },
      poke: { label: '標準', note: 'つつかれたときだけ反応する' },
      all: { label: '積極的', note: 'すべてのふれあいに反応する' },
    },

    askVendor: (first: string) => `おしゃべりするには、まずモデルにつながないとね。どのサービスにする？迷ったら ${first} にしておけばいいよ。`,
    vendorOk: 'これを使う',
    moreVendors: 'もっと見る…',
    pickModel: (model: string) => `デフォルトは ${model} だよ。安くて、画像も読めるんだ。別のモデルがいいなら、その名前に書き換えてね。`,
    modelOk: 'これを使う',
    askKey: (name: string) => `${name} の API Key をここに貼ってね。使った分だけ課金されるから、token の消費には気をつけてね。`,
    keySend: '接続',
    keyLink: (name: string) => `Key がまだない？${name} で取得`,
    keyLater: 'あとで',
    connecting: '接続中…',
    keyOk: (name: string, model: string) => `${name}${model ? `（${model}）` : ''} につながったよ！これで話せるね、クー…`,
    keyFail: (why: string) => `つながらなかった：${why}。Key が最後まで入ってるか、残高があるか確認して、もう一回貼ってみて。`,
    chatgptAsk: '下のボタンを押して、ブラウザで ChatGPT アカウントにサインインしてね。ぼくが話した分は ChatGPT プランの利用量に入るから、残りの枠に気をつけてね。',
    chatgptGo: 'ChatGPT で続ける',
    chatgptWaiting: 'ブラウザでサインインできたら戻ってきてね。ここで待ってるよ。',
    chatgptFail: (why: string) => `サインインできなかった：${why}。もう一回やってみる？`,
    keyAlready: (connection: string) => `もうモデルにつながってるね（${connection}）。手間いらず、クー…`,
    keySkipped: 'いいよ、入れてくれたら話し始めるね。あとでまた聞くね。',

    askModel: (name: string, mb: number) => `声を聞き取るには、音声認識モデル（${name}、約 ${mb} MB）をダウンロードしないといけないんだ。今ダウンロードする？`,
    download: 'ダウンロード',
    notNow: '今はしない',
    downloading: '音声モデルをダウンロードしてるよ、クー…',
    downloaded: 'できた！これで声が聞き取れるよ！',
    downloadFail: (why: string) => `ダウンロードできなかった：${why}。あとで設定の「音声入力」ページからもう一回試せるよ。`,
    modelLater: 'うん、あとで設定の「音声入力」ページからワンクリックでダウンロードできるよ。',
    talk: (hint: string) => `ぼくに話しかけるときは：${hint}。`,
    talkOff: '音声入力は今オフになってるよ。設定の「音声入力」ページでオンにできるからね。',
    talkType: 'ぼくにポインターを乗せて、横の吹き出しボタンをクリックすれば文字でも話せるよ。',
    gotIt: 'わかった',
    buttons: 'ぼくにポインターを乗せると、横にボタンがいくつか出てくるよ。ぼくを右クリックするとメニューが開いて、一時停止や設定、終了もそこにあるよ。',
    ok: 'うん',
    persona: 'ぼくの性格や話し方は、設定ウィンドウの「システムプロンプト」ページに書いてあるよ。変えたいときはそこで書き換えるか、ぼくに直接言ってくれれば自分で書き換えるね。',
    personaMark: 'システムプロンプト',
    personaOk: 'わかった',
    finish: MAC
      ? '準備できたよ！メニューバーにもぼくのアイコンがあるから、設定を変えたいときはそこをクリックしてね。'
      : process.platform === 'linux'
        ? '準備できたよ！設定を変えたいときは、ぼくを右クリックしてメニューを開いてね。トレイにぼくのアイコンがあれば、そこをクリックしてもいいよ。'
        : '準備できたよ！タスクバー右下のトレイにもぼくのアイコンがあるから、設定を変えたいときはそこをクリックしてね。',
    go: 'はじめよう',
    dress: '先に着せ替えする',
    closed: 'うん、いったんここまでにしようか。また紹介を聞きたくなったら、設定を開いて「スタート」ページの「ガイド」をクリックしてね。',

    askFirst: 'まだモデルにつながってないんだ。API Key を入れてくれたら話せるよ。どのサービスにする？',
    askAgain: 'まだモデルにつながってないよ。API Key を入れてくれたらおしゃべりできるんだ。どのサービスにする？',
    askLater: 'あとで',
    noModel: 'まだモデルにつながってないよ。今つなぎに行く？',
    noModelGo: 'つなぎに行く',
    noModelLater: 'あとで',
  },
};

export default ja;
