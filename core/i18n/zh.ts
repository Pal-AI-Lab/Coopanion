/**
 * 简体中文:Core 进程给人看的文字,包括桌宠气泡里的启动引导、请求失败与更新提示、Coopanion 的设置项、
 * 状态气泡的说法。键与 en.ts 相同;繁体中文缺的顶层键读这里。
 */
const MAC = process.platform === 'darwin';

export default {
  /** 「习惯」页与高级设置里 Coopanion 自己的设置项 */
  settings: {
    language: { title: '语言', description: '界面和 Coo 说话都使用这种语言，修改后立即生效。' },
    telemetry: { title: '匿名使用统计', description: '发送不含对话内容的使用次数与设置，帮助改进 Coopanion。字段见 docs/TELEMETRY.md。' },
    contextRing: { title: '上下文圆环', description: '在对话页输入框显示一个圆环，表示离整理之前的对话还有多远。' },
    roundsSoft: { title: '收尾提醒', suffix: '次', description: '单次唤醒请求模型达到此次数时，提醒 Coo 完成当前任务后结束本轮。' },
    roundsHard: { title: '单次唤醒上限', suffix: '次', description: '单次唤醒最多请求模型的次数，达到后结束本轮。' },
  },

  /** 连续几次请求模型失败后,桌宠气泡里的说明 */
  failure: {
    text: (n: number, status: number, reason: string) => `我连着 ${n} 次没能从模型那里拿到回复。错误${status ? ` ${status}` : ''}：${reason}。请在设置的「开始」页检查模型名和 API Key，那里可以测试连接。`,
    /** 服务商预设关掉了 `sendSyntheticReasoning`,端点却要它而回 400 时的说明 */
    reasoningReplay: (n: number) => `我连着 ${n} 次没能从模型那里拿到回复：这家服务商要求每次调用工具前都回传思考内容，Coopanion 对它关掉了这一项。请把这件事反馈给开发者：https://github.com/Pal-AI-Lab/Coopanion/issues`,
    open: '打开设置',
    ok: '知道了',
  },

  /** 自动更新的几步,在桌宠气泡里说 */
  update: {
    downloading: (v: string) => `发现新版本 ${v}，正在后台下载，下好了我再告诉你。`,
    ready: (v: string) => `新版本 ${v} 下载好了。现在重启更新吗？不急的话，下次退出应用时会自动装上。`,
    failed: (v: string, why: string) => `新版本 ${v} 没能下载下来：${why}。可以去 GitHub 手动下载安装。`,
    ok: '好', github: '前往 GitHub 下载', install: '现在重启更新', later: '下次再说', gotIt: '知道了',
    trouble: '遇到问题？', githubByHand: '前往 GitHub 手动下载',
  },

  /** 桌宠菜单头上的电源键 */
  quit: '退出应用',
  /** 左栏里应用通知这个 World 的名字 */
  noticeLabel: '应用通知',
  /** 电脑操作征求同意时气泡里的两个按钮 */

  /** 状态气泡:Coo 正在用的工具 */
  status: {
    read: '在查看', browse: '在翻阅', memory: '记忆', find: '在查找', search: '在搜索', write: '在写入', edit: '在修改', append: '在追加',
    delete: '在删除', moveFile: '在移动', save: '在保存', screen: '在查看屏幕', windows: '在查看打开的窗口', rightClick: '在右击', doubleClick: '在双击', click: '在点击',
    move: '在移动鼠标', drag: '在拖动', scroll: '在滚动', focus: '在切换窗口', type: '在打字', key: '在按键', wait: '在等待',
    alarmSet: '在设定闹钟', alarmList: '在查看闹钟', alarmCancel: '在取消闹钟',
    /** 在搜的关键词 */
    quoted: (text: string) => `「${text}」`,
    seconds: (n: number) => `${n} 秒`,
    minutesLater: (n: number) => `${n} 分钟后`,
  },

  /** 设置窗口「开始」页「配色方案」里跟着桌宠形象的配色方案 */
  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `桌宠换成${figure}的「${preset}」时自动换上`,
  },

  /** 启动引导:第一次启动时 Coo 在气泡里一步步说的话 */
  guide: {
    /** 「你是从哪里认识我的?」的回答与统计里的 id;最后一项是跳过。id 见 docs/TELEMETRY.md */
    sources: [['B站', 'bilibili'], ['小红书', 'xiaohongshu'], ['抖音', 'douyin'], ['Steam', 'steam'], ['GitHub', 'github'], ['朋友推荐', 'friend'], ['其他', 'other'], ['不告诉你', 'skip']] as ReadonlyArray<readonly [label: string, id: string]>,
    hello: '你好呀！我是 Coo，以后就住在你屏幕的底边啦，库...',
    helloReply: '你好，Coo！',
    askName: '我该怎么称呼你？',
    nameSend: '就这么叫',
    gotName: (name: string) => `${name}，记住啦！`,
    askSource: '你是从哪里认识我的？',
    sourceThanks: '原来是这样，库...',
    askPersona: '你觉得我应该是...',
    /** 人设卡片:卡片上的字,点到时 Coo 说的话 */
    personas: {
      coo: { label: '小小的、好奇的', line: '这是什么？我凑过去看一眼，库...' },
      grail: { label: '黏人的、贪心的', line: '你在吃什么呀？也分我一口嘛，库...' },
      forge: { label: '靠谱的、干练的', line: '要做什么？交给我，一会儿就好，库。' },
      heart: { label: '活泼的、陪伴的', line: '我来啦！今天也一直陪着你，库！' },
      winter: { label: '安静的、沉默的', line: '……嗯，库。' },
      whale: { label: 'DeepSeek 大肥鱼', line: '欢迎回来！这是什么？让我看看，库...' },
    },
    /** 确认按钮旁的一行;`dress` 是设置窗口里装扮页的名字,画在图标后 */
    dressHint: { text: '配色可以在 装扮 中替换', dress: '装扮' },
    askRoam: '平时我该安静一点，还是活泼一点？点一下，看看我会怎样。',
    /** 三张卡片:名字、活跃程度、点到时 Coo 说的话 */
    roam: {
      off: { label: '不乱动', level: '低', line: '那我就乖乖站着，你叫我我再动。' },
      calm: { label: '多待着', level: '中', line: '我会时不时溜达一圈，大多时候待着。' },
      free: { label: '常走动', level: '高', line: '我可以到处跑来跑去，库...！' },
    },
    roamOk: '就这样',
    roamDone: '好，就按这个来。',
    /** 回应模式这一步:名字(问句里标色)、问句、三张卡片的名字和下面一行小字 */
    wakeTitle: '回应模式',
    askWake: '回应模式：你戳我、摸我、把我拎起来的时候，我什么时候回应你？',
    wake: {
      none: { label: '安静', note: '互动先记着，等你说话时一起回应' },
      poke: { label: '默认', note: '只有被戳的时候才回应' },
      all: { label: '积极', note: '所有互动都会回应' },
    },

    askVendor: (first: string) => `要和你聊天，我得先连上大模型。用哪一家的？拿不准就选 ${first}。`,
    vendorOk: '就用这家',
    moreVendors: '更多…',
    pickModel: (model: string) => `默认用 ${model}，便宜，还能看图。想用别的模型，改成它的名字就行。`,
    modelOk: '就用这个',
    askKey: (name: string) => `把 ${name} 的 API Key 贴在这里吧。按用量计费，注意 token 消耗哦。`,
    keySend: '连接',
    keyLink: (name: string) => `还没有 Key？去 ${name} 申请`,
    keyLater: '稍后再填',
    connecting: '正在连接…',
    keyOk: (name: string, model: string) => `连上 ${name} 了${model ? `（${model}）` : ''}！现在我能说话啦，库...`,
    keyFail: (why: string) => `没连上：${why}。看看 Key 是不是完整，账户里还有没有余额？再贴一次试试。`,
    /** A ChatGPT plan is signed in in the browser instead of taking a key; the plan's quota is the person's to watch. */
    chatgptAsk: '点击下面的按钮，在浏览器里登录 ChatGPT 账号。我说的话会计入你的 ChatGPT 套餐用量，记得留意额度哦。',
    chatgptGo: '使用 ChatGPT 继续',
    chatgptWaiting: '在浏览器里登录好就回来，我在这里等你。',
    chatgptFail: (why: string) => `没登录上：${why}。再试一次吧？`,
    keyAlready: (connection: string) => `模型已经连好了（${connection}），省事，库...`,
    keySkipped: '没关系，等你填好我再开口。之后我会再来问你。',

    askModel: (name: string, mb: number) => `要听懂你说话，我得先下载一个语音识别模型（${name}，约 ${mb} MB，从国内的 ModelScope 下载）。现在下吗？`,
    download: '下载',
    notNow: '先不用',
    downloading: '正在下载语音模型，库...',
    downloaded: '下好了，现在我听得懂你说话啦！',
    downloadFail: (why: string) => `没下载下来：${why}。之后在设置的「语音输入」页可以再试。`,
    modelLater: '好，之后在设置的「语音输入」页一键就能下。',
    talk: (hint: string) => `想和我说话：${hint}。`,
    talkOff: '语音输入现在关着，可以在设置的「语音输入」页打开。',
    talkType: '也可以把鼠标停在我身上，点旁边的气泡按钮打字。',
    gotIt: '知道了',
    buttons: '鼠标停在我身上，旁边会冒出几个按钮；右键我能打开菜单，暂停、设置和退出都在里面。',
    ok: '好',
    persona: '我是什么性子、怎么说话，都写在设置窗口的「系统提示词」页里。想让我换个样子，可以去那里改；直接告诉我也行，我自己来改。',
    /** persona 那句里用主题色标出的词 */
    personaMark: '系统提示词',
    personaOk: '明白了',
    finish: MAC
      ? '都准备好啦！菜单栏里也有我的图标，想改设置点它就行。'
      : process.platform === 'linux'
        ? '都准备好啦！想改设置的话，右键我打开菜单就行；桌面的托盘区里要是有我的图标，点它也可以。'
        : '都准备好啦！任务栏右下角的托盘里也有我的图标，想改设置点它就行。',
    go: '开始吧',
    dress: '先给我换身衣服',
    closed: '好，那先到这儿。想再听我介绍，打开设置，在「开始」页点「使用向导」。',

    askFirst: '我还没连上模型，填好 API Key 我才能和你说话。用哪一家的？',
    askAgain: '还是没连上模型呢，填好 API Key 我才能陪你聊天。用哪一家的？',
    askLater: '等会儿',
    noModel: '当前未接通模型，要去接通模型吗？',
    noModelGo: '去接通',
    noModelLater: '等会儿',
  },
};
