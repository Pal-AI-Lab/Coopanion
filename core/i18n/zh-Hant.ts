import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const zhHant: Translation<CoreText> = {
  settings: {
    language: { title: '語言', description: '設定視窗、桌寵的氣泡和選單使用這種語言，Coo 也用它和你說話。變更後立即生效。' },
    telemetry: { title: '匿名使用統計', description: '傳送不含對話內容的使用次數與設定，幫助改進 Coopanion。欄位見 docs/TELEMETRY.md。' },
    roundsSoft: { title: '收尾提醒', suffix: '次', description: '一次喚醒裡請求模型達到這麼多次時，提醒 Coo 做完手上的事就結束這一輪。' },
    roundsHard: { title: '單次喚醒上限', suffix: '次', description: '一次喚醒裡最多請求模型這麼多次，到了就結束這一輪。' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `我連續 ${n} 次沒能從模型那裡拿到回覆。錯誤${status ? ` ${status}` : ''}：${reason}。請在設定的「開始」頁檢查模型名稱和 API Key，那裡可以測試連線。`,
    open: '開啟設定',
    ok: '知道了',
  },

  update: {
    downloading: (v: string) => `發現新版本 ${v}，正在背景下載，下載好了我再告訴你。下載卡住的話，也可以到 GitHub 手動下載安裝。`,
    ready: (v: string) => `新版本 ${v} 下載好了。現在重新啟動更新嗎？不急的話，下次結束應用程式時會自動安裝。`,
    failed: (v: string, why: string) => `新版本 ${v} 沒能下載下來：${why}。可以到 GitHub 手動下載安裝。`,
    ok: '好', github: '到 GitHub 下載', install: '現在重新啟動更新', later: '下次再說', gotIt: '知道了',
  },

  quit: '結束應用程式',
  cuaYes: '可以',
  cuaNo: '這次不行',

  status: {
    read: '在看', browse: '在翻', memory: '記憶', find: '在找', search: '在搜尋', write: '在寫', edit: '在改', append: '在補記',
    delete: '在刪', save: '在存', screen: '在看螢幕', windows: '在看開著的視窗', rightClick: '在按右鍵', doubleClick: '在點兩下', click: '在點',
    move: '在移動滑鼠', drag: '在拖曳', scroll: '在捲動', focus: '在切換視窗', type: '在打字', key: '在按鍵', wait: '在等',
    alarmSet: '在設鬧鐘', alarmList: '在看鬧鐘', alarmCancel: '在取消鬧鐘',
    quoted: (text: string) => `「${text}」`,
    seconds: (n: number) => `${n} 秒`,
    minutesLater: (n: number) => `${n} 分鐘後`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `桌寵換成${figure}的「${preset}」時自動換上`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['朋友推薦', 'friend'], ['其他地方', 'other'], ['不告訴你', 'skip']],
    hello: '你好呀！我是 Coo，以後就住在你螢幕的底邊囉，庫...',
    helloReply: '你好，Coo！',
    askName: '我該怎麼稱呼你？',
    nameSend: '就這樣叫',
    gotName: (name: string) => `${name}，記住囉！`,
    askSource: '你是從哪裡認識我的？',
    sourceThanks: '原來是這樣，庫...',
    askRoam: '平常我該安靜一點，還是活潑一點？點一下，看看我會怎樣。',
    roam: {
      off: { label: '不亂動', level: '低', line: '那我就乖乖站著，你叫我我再動。' },
      calm: { label: '多待著', level: '中', line: '我會不時去散步一圈，大多時候待著。' },
      free: { label: '常走動', level: '高', line: '我可以到處跑來跑去，庫...！' },
    },
    roamOk: '就這樣',
    roamDone: '好，就照這個來。',
    wakeTitle: '回應模式',
    askWake: '回應模式：你戳我、摸我、把我拎起來的時候，我什麼時候回應你？',
    wake: {
      none: { label: '安靜', note: '互動先記著，和她說話時一起回應' },
      poke: { label: '預設', note: '只有被戳的時候才回應' },
      all: { label: '積極', note: '所有互動都會回應' },
    },

    askVendor: (first: string) => `要和你聊天，我得先連上模型。用哪一家的？拿不定主意就選 ${first}。`,
    vendorOk: '就用這家',
    moreVendors: '更多…',
    pickModel: (model: string) => `預設用 ${model}，便宜，還能看圖。想用別的模型，改成它的名字就行。`,
    modelOk: '就用這個',
    askKey: (name: string) => `把 ${name} 的 API Key 貼在這裡吧。依用量計費，要留意 token 消耗喔。`,
    keySend: '連線',
    keyLink: (name: string) => `還沒有 Key？到 ${name} 申請`,
    keyLater: '稍後再填',
    connecting: '正在連線…',
    keyOk: (name: string, model: string) => `連上 ${name} 了${model ? `（${model}）` : ''}！現在我能說話囉，庫...`,
    keyFail: (why: string) => `沒連上：${why}。看看 Key 是不是完整，帳戶裡還有沒有餘額？再貼一次試試。`,
    keyAlready: (connection: string) => `模型已經連好了（${connection}），省事，庫...`,
    keySkipped: '沒關係，等你填好我再開口。之後我會再來問你。',

    askModel: (name: string, mb: number) => `要聽懂你說話，我得先下載一個語音辨識模型（${name}，約 ${mb} MB）。現在下載嗎？`,
    download: '下載',
    notNow: '先不用',
    downloading: '正在下載語音模型，庫...',
    downloaded: '下載好了，現在我聽得懂你說話囉！',
    downloadFail: (why: string) => `沒下載下來：${why}。之後可以在設定的「語音輸入」頁再試。`,
    modelLater: '好，之後在設定的「語音輸入」頁一鍵就能下載。',
    talk: (hint: string) => `想和我說話：${hint}。`,
    talkOff: '語音輸入現在關著，可以在設定的「語音輸入」頁開啟。',
    talkType: '也可以把滑鼠停在我身上，點旁邊的氣泡按鈕打字。',
    gotIt: '知道了',
    buttons: '滑鼠停在我身上，旁邊會冒出幾個按鈕；在我身上按右鍵能開啟選單，暫停、設定和結束都在裡面。',
    ok: '好',
    persona: '我是什麼個性、怎麼說話，都寫在設定視窗的「系統提示詞」頁裡。想讓我換個樣子，可以去那裡改；直接告訴我也行，我自己來改。',
    personaMark: '系統提示詞',
    personaOk: '明白了',
    finish: MAC
      ? '都準備好囉！選單列裡也有我的圖示，想改設定點它就行。'
      : process.platform === 'linux'
        ? '都準備好囉！想改設定的話，在我身上按右鍵開啟選單就行；桌面的系統匣裡要是有我的圖示，點它也可以。'
        : '都準備好囉！工作列右下角的系統匣裡也有我的圖示，想改設定點它就行。',
    go: '開始吧',
    dress: '先幫我換身衣服',
    closed: '好，那先到這裡。想再聽我介紹，開啟設定，在「開始」頁點「使用引導」。',

    askFirst: '我還沒連上模型，填好 API Key 我才能和你說話。用哪一家的？',
    askAgain: '還是沒連上模型呢，填好 API Key 我才能陪你聊天。用哪一家的？',
    askLater: '等一下',
    noModel: '目前沒有連上模型，要去連線嗎？',
    noModelGo: '去連線',
    noModelLater: '等一下',
  },
};

export default zhHant;
