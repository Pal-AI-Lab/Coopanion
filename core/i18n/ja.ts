import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const ja: Translation<CoreText> = {
  settings: {
    language: { title: '言語', description: '設定ウィンドウ、ペットの吹き出しとメニューがこの言語で表示され、Coo もこの言語で話します。すぐに反映されます。' },
    telemetry: { title: '匿名の利用統計', description: '会話内容を含まない利用回数と設定を送信し、Coopanion の改善に役立てます。送信する項目は docs/TELEMETRY.md に記載されています。' },
    roundsSoft: { title: 'まとめのリマインド', suffix: '回', description: '1 回のウェイクでモデルへのリクエストがこの回数に達すると、今の作業を片付けてターンを終えるよう Coo に促します。' },
    roundsHard: { title: '1 回のウェイクのリクエスト上限', suffix: '回', description: '1 回のウェイクでモデルにリクエストできる最大回数です。達するとターンが終わります。' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `モデルへのリクエストが ${n} 回続けて失敗しました。エラー${status ? ` ${status}` : ''}：${reason}。設定の「スタート」ページでモデル名と API Key を確認してください。接続のテストもそこでできます。`,
    open: '設定を開く',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `バージョン ${v} が出ました。バックグラウンドでダウンロードしていて、準備ができたらお知らせします。ダウンロードが止まったときは、GitHub から自分でダウンロードすることもできます。`,
    ready: (v: string) => `バージョン ${v} のダウンロードが終わりました。今すぐ再起動して更新しますか？あとにする場合は、次にアプリを終了するときにインストールされます。`,
    failed: (v: string, why: string) => `バージョン ${v} をダウンロードできませんでした：${why}。GitHub から自分でダウンロードできます。`,
    ok: 'OK', github: 'GitHub からダウンロード', install: '再起動して更新', later: 'あとで', gotIt: 'OK',
  },

  quit: 'アプリを終了',
  cuaYes: 'はい',
  cuaNo: '今回は許可しない',

  status: {
    read: '読み取り中', browse: '閲覧中', memory: '記憶', find: '探索中', search: '検索中', write: '書き込み中', edit: '編集中', append: '追記中',
    delete: '削除中', save: '保存中', screen: '画面を確認中', windows: '開いているウィンドウを確認中', rightClick: '右クリック中', doubleClick: 'ダブルクリック中', click: 'クリック中',
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
    hello: 'こんにちは！Coo です。今日から画面のいちばん下に住んでいます。クー…',
    helloReply: 'こんにちは、Coo！',
    askName: 'なんて呼べばいいですか？',
    nameSend: 'そう呼んで',
    gotName: (name: string) => `${name}、覚えました！`,
    askSource: 'Coo のことはどこで知りましたか？',
    sourceThanks: 'なるほど、そうなんですね。クー…',
    askRoam: 'ふだんは静かにしているのと、元気に動き回るの、どちらがいいですか？クリックすると、どうするか見せますね。',
    roam: {
      off: { label: 'じっとする', level: '低', line: 'じゃあ、じっと立っていて、呼ばれたら動きますね。' },
      calm: { label: 'ときどき歩く', level: '中', line: 'ときどき散歩して、ふだんはじっとしていますね。' },
      free: { label: 'よく歩く', level: '高', line: 'あちこち走り回りますよ。クー…！' },
    },
    roamOk: 'これにする',
    roamDone: 'わかりました、こうしますね。',
    wakeTitle: '反応モード',
    askWake: '反応モード：つついたり、なでたり、持ち上げたりしたとき、いつ反応しましょうか？',
    wake: {
      none: { label: '静か', note: 'ふれあいは覚えておき、話しかけたときにまとめて反応します' },
      poke: { label: '標準', note: 'つつかれたときだけ反応します' },
      all: { label: '積極的', note: 'すべてのふれあいに反応します' },
    },

    askVendor: (first: string) => `お話しするには、モデルにつなぐ必要があります。どのサービスを使いますか？迷ったら ${first} を選んでください。`,
    vendorOk: 'これを使う',
    moreVendors: 'もっと見る…',
    pickModel: (model: string) => `ふだんは ${model} を使います。安くて、画像も読めます。別のモデルを使うなら、その名前を入力してください。`,
    modelOk: 'これを使う',
    askKey: (name: string) => `${name} の API Key をここに貼り付けてください。使った分だけ課金されるので、token の消費に気をつけてくださいね。`,
    keySend: '接続',
    keyLink: (name: string) => `Key がまだない？${name} で取得`,
    keyLater: 'あとで',
    connecting: '接続しています…',
    keyOk: (name: string, model: string) => `${name}${model ? `（${model}）` : ''} につながりました！これでお話しできます。クー…`,
    keyFail: (why: string) => `接続できませんでした：${why}。Key は最後まで貼り付けられていますか？アカウントに残高はありますか？もう一度貼り付けてみてください。`,
    keyAlready: (connection: string) => `モデルはもう接続されています（${connection}）。話が早いですね。クー…`,
    keySkipped: '大丈夫です。追加してもらえたら話せるようになります。あとでまた聞きますね。',

    askModel: (name: string, mb: number) => `話を聞き取るには、音声認識モデル（${name}、約 ${mb} MB）をダウンロードする必要があります。今ダウンロードしますか？`,
    download: 'ダウンロード',
    notNow: '今はしない',
    downloading: '音声モデルをダウンロードしています。クー…',
    downloaded: 'できました！これで話を聞き取れます。',
    downloadFail: (why: string) => `ダウンロードに失敗しました：${why}。設定の「音声入力」ページでもう一度試せます。`,
    modelLater: 'わかりました。あとで設定の「音声入力」ページからワンクリックでダウンロードできます。',
    talk: (hint: string) => `話しかけるには：${hint}。`,
    talkOff: '音声入力は今オフです。設定の「音声入力」ページでオンにできます。',
    talkType: 'ポインターを Coo に乗せて、横の吹き出しボタンをクリックすれば文字でも話せます。',
    gotIt: 'わかりました',
    buttons: 'ポインターを Coo に乗せると、横にボタンがいくつか出てきます。Coo を右クリックするとメニューが開き、一時停止、設定、終了があります。',
    ok: 'OK',
    persona: 'Coo の性格や話し方は、設定ウィンドウの「システムプロンプト」ページに書いてあります。変えたいときはそこで編集するか、Coo に直接言ってくれれば自分で書き換えます。',
    personaMark: 'システムプロンプト',
    personaOk: 'わかりました',
    finish: MAC
      ? '準備完了です！メニューバーにも Coo のアイコンがあります。クリックすると設定を変えられます。'
      : process.platform === 'linux'
        ? '準備完了です！設定を変えたいときは、Coo を右クリックしてメニューを開いてください。トレイに Coo のアイコンがあれば、それをクリックしても開けます。'
        : '準備完了です！タスクバー右下のトレイにも Coo のアイコンがあります。クリックすると設定を変えられます。',
    go: 'はじめよう',
    dress: '先に着せ替えする',
    closed: 'わかりました、ここまでにしましょう。もう一度紹介を聞きたいときは、設定を開いて「スタート」ページの「ガイド」をクリックしてください。',

    askFirst: 'まだモデルにつながっていません。API Key を追加してもらえたら話せます。どのサービスを使いますか？',
    askAgain: 'まだモデルがつながっていません。API Key を追加してもらえたら、そばでお話しできます。どのサービスを使いますか？',
    askLater: 'あとで',
    noModel: 'モデルが接続されていません。今すぐ接続しますか？',
    noModelGo: '接続する',
    noModelLater: 'あとで',
  },
};

export default ja;
