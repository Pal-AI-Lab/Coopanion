/**
 * 简体中文:这个 World 给人看的文字。键与 en.ts 相同;繁体中文缺的顶层键读这里。
 * 气泡、菜单、语音提示按应用语言;控制台的配置项、面板、对话页与提示词说明按控制台请求的语言。
 * 给 bot 读的文字不在这里(model-text.ts)。
 */
export default {
  /** 没设称呼时,事件和气泡里对使用者的称呼 */
  defaultUser: '伙伴',

  /** 桌宠菜单与气泡 */
  menu: {
    /** 应用没给退出按钮起名时的名字 */
    quit: '退出',
    /** 点电源键后菜单头上的确认问句 */
    quitPrompt: (label: string) => `${label}?`,
  },

  /** 状态气泡:没有专门描述的工具调用 */
  busy: '在忙',

  /** 语音输入:菜单里麦克风按钮的状态、引导和设置页的说明 */
  voice: {
    starting: '识别服务启动中',
    notRunning: '识别服务没有运行',
    modelMissing: (mb: number) => `识别模型还没下载（约 ${mb} MB）：在「语音输入」页下载`,
    badKey: (hotkey: string) => `认不出按键「${hotkey}」`,
    /** 说话键读不了,临时改为一直收音 */
    fallback: (problem: string) => `说话键不可用，暂时自动收音：${problem}`,
    always: '一直在听，直接说话',
    /** 用说话键开关收音;label 是含连击的完整按键名(「双击 左 Alt」) */
    toggleTaps: (label: string, taps: number) => `${label} 开始听，再${taps === 2 ? '双击' : '三击'}停`,
    toggle: (key: string) => `按一下 ${key} 开始听，再按一下停`,
    holdTaps: (key: string, taps: number) => `快速按${taps === 2 ? '一' : '两'}下 ${key}，紧接着按住说话，松开就发出去`,
    hold: (key: string) => `按住 ${key} 说话，松开就发出去`,
    /** 「语音输入」页识别结果里,没识别出来的那一行 */
    failedLine: (error: string) => `[失败] ${error}`,
  },

  /** 说话键的名字,与 Windows 的键名一一对应;Mac 那组覆盖在上面 */
  keys: {
    LeftCtrl: '左 Ctrl', RightCtrl: '右 Ctrl', LeftAlt: '左 Alt', RightAlt: '右 Alt', LeftShift: '左 Shift', RightShift: '右 Shift',
    RightWin: '右 Win', Backquote: '`', Mouse3: '鼠标中键', Mouse4: '鼠标侧键 4', Mouse5: '鼠标侧键 5',
  } as Record<string, string>,
  macKeys: {
    Ctrl: 'Control', LeftCtrl: '左 Control', RightCtrl: '右 Control',
    Alt: 'Option', LeftAlt: '左 Option', RightAlt: '右 Option', Win: 'Command', RightWin: '右 Command',
  } as Record<string, string>,
  /** 连按的说法,放在键名前:「双击 左 Alt」 */
  taps: (taps: number, keys: string) => `${taps === 2 ? '双击' : '三击'} ${keys}`,

  /** 说话键读不了的原因 */
  hotkey: {
    cannotRead: (why: string) => `读不了键盘状态：${why}`,
    macNoKey: 'Mac 上没有这个按键，换一个说话键',
    macPermission: '没有「输入监控」权限：在「系统设置 → 隐私与安全性 → 输入监控」里打开 Coopanion，再重启它；已经开着的话，先用「−」把 Coopanion 移出列表再加回来：更新后的新版本不认旧授权',
    linuxNoKey: 'Linux 上读不到这个按键（鼠标侧键不行），换一个说话键',
    linuxNoDisplay: '按键收音在 Linux 上需要 X11（或 XWayland）：没有找到 DISPLAY',
    linuxNoX11: '按键收音连不上 X11 显示',
    unsupported: '按键收音只在 Windows、macOS 和 Linux 上可用',
  },

  /** Windows 自带的语音识别 */
  system: {
    name: (culture: string) => (culture ? `Windows 语音识别（${culture}）` : 'Windows 语音识别'),
    noSpeech: '系统语音组件 System.Speech 加载不了',
    noRecognizer: (language: string) => `系统里没有${language === 'auto' ? '' : `「${language}」的`}语音识别器：在 Windows 设置 → 时间和语言 → 语言里给该语言装上「语音识别」`,
    windowsOnly: '系统语音识别只在 Windows 上可用',
    startFailed: (why: string) => `启动失败：${why}`,
    exited: '系统语音识别进程退出了',
    exitedCode: (code: number | null) => `系统语音识别进程退出（退出码 ${code}）`,
    notReady: '系统语音识别在期限内没有就绪',
    notRunning: '系统语音识别没有运行',
    timeout: (ms: number) => `识别超时（${ms}ms）`,
    stopped: '系统语音识别已停止',
  },

  /** sherpa-onnx 跑的识别模型 */
  sherpa: {
    incomplete: '识别模型文件不全，重新下载一次',
    noRuntime: (platform: string) => `这个平台（${platform}）没有 sherpa-onnx 的运行库`,
    loadFailed: (why: string) => `识别模型载入失败：${why}`,
    notLoaded: '识别模型没有载入',
  },

  /** 窗口运行时与识别模型的下载 */
  store: {
    noBuild: (platform: string) => `没有 ${platform} 的预编译包`,
    downloading: (file: string) => `下载 ${file}`,
    unpacking: '解压',
    downloadingModel: '下载识别模型',
    downloadingFrom: (file: string, host: string) => `下载 ${file}（${host}）`,
    verifying: (file: string) => `校验 ${file}`,
    mismatch: (sum: string) => `校验不符：${sum}…`,
    failed: (file: string, why: string) => `${file} 下载失败（${why}）`,
    exitCode: (cmd: string, code: number | null, out: string) => `${cmd} 退出码 ${code}：${out}`,
  },

  /** 形象包 figure.json 读不了的原因;字段名照写 */
  packs: {
    noManifest: (file: string) => `没有 ${file}`,
    badJson: (file: string, why: string) => `${file} 不是合法的 JSON：${why}`,
    notInteger: (key: string, got: string) => `${key} 应为整数，是 ${got}`,
    tooNew: (key: string, v: number, now: number) => `${key} 是 ${v}，这一版只认到 ${now}：要先更新应用`,
    tooOld: (key: string, v: number, oldest: number) => `${key} ${v} 是 ${oldest} 之前的测试格式，读不了`,
    badId: (got: string) => `id 不合法：${got}`,
    noName: 'name 缺失',
    noAbout: 'about 缺失',
    badEntry: 'entry 或 export 不合法',
    badModel: 'model 路径不合法',
    badThumb: 'thumb 路径不合法',
    badAxis: (got: string) => `axes 里有不合法的一项：${got}`,
    badOption: (axis: string, got: string) => `axes.${axis} 里有不合法的选项：${got}`,
    badPreset: (got: string) => `presets 里有不合法的一项：${got}`,
    presetMissing: (preset: string, axis: string) => `presets.${preset} 没有选 ${axis} 的选项`,
    badPresetThumb: (preset: string) => `presets.${preset}.thumb 路径不合法`,
    vocabNotArray: 'vocab 应为数组',
    badWordId: (got: string) => `vocab 里有不合法的 id：${got}`,
    unknownKind: (id: string, kind: string) => `vocab.${id}.kind 是 ${kind}，这一版不认识，这个词不给 bot 用`,
    namesNotArray: (id: string, lang: string) => `vocab.${id}.names.${lang} 应为数组`,
    badWordName: (id: string, got: string) => `vocab.${id} 的名字不合法：${got}`,
    nameTaken: (name: string) => `vocab 里 ${name} 指了不止一个词`,
    noWordAbout: (id: string) => `vocab.${id}.about 缺失`,
    badSeconds: (id: string) => `vocab.${id}.seconds 应为正数`,
    soundsNotObject: 'sounds 应为对象',
    badSoundName: (got: string) => `sounds 里的名字不合法：${got}`,
    badSoundFile: (name: string) => `sounds.${name}.file 应为形象包里的文件`,
    badVolume: (name: string) => `sounds.${name}.volume 应为 0–1`,
    soundType: (name: string, file: string) => `sounds.${name} 的 ${file} 不是这一版放得了的 .ogg、.mp3 或 .wav，这个声音不会响`,
    soundKind: (name: string, kind: string, kinds: readonly string[]) => `sounds.${name}.kind 是 ${kind}，这一版只认 ${kinds.join('、')}，这个声音不会响`,
    soundMissing: (name: string, file: string) => `sounds.${name} 的 ${file} 不存在，这个声音不会响`,
    badWalk: (got: string) => `can.walk 是 ${got}，这一版不认识，按会走处理`,
    idTaken: (id: string, builtin: boolean) => `id ${id} 已被${builtin ? '内置形象' : '另一个形象包'}占用`,
  },

  /** 在装扮页导入形象包 */
  importing: {
    badZip: (why: string) => `这不是能读的 zip：${why}`,
    tooBig: (mb: number) => `解开后超过 ${mb} MB`,
    truncated: '上传的内容不完整',
    badPath: (path: string) => `有一个路径不能用：${path}`,
    builtinId: (id: string) => `id ${id} 是内置形象的，换个 id 才能导入`,
    duplicateId: (id: string) => `id ${id} 和这次导入的另一个形象包重复`,
    unpackFailed: (why: string) => `没能解开：${why}`,
    expired: '这次导入已经过期，请重新选择',
    noneChosen: '没有选要导入的形象包',
    zipOrFolder: '只收 zip 或文件夹',
    overLimit: (mb: number) => `超过 ${mb} MB`,
  },

  /** 桌宠想改设置、要先征得同意时的气泡:问句、三个按钮,以及每项改动的说法 */
  consent: {
    question: (items: string[]) => `我想${items.join('、')}，可以吗？`,
    /** 可以 / 以后都可以(这几项以后不再问) / 不用了 */
    choices: ['可以', '以后都可以', '不用了'] as [yes: string, always: string, no: string],
    list: (items: string[]) => items.join('、'),
    pick: (axis: string, option: string) => `${axis}：${option}`,
    figure: (to: string) => `换成${to}的样子`,
    scheme: (figure: string, look: string) => `换一身${figure}的打扮（${look}）`,
    roam: { free: '常走动', calm: '多待着', off: '不乱动' } as Record<'free' | 'calm' | 'off', string>,
    roamTo: (to: string) => `走动改成「${to}」`,
    snore: (seconds: number): string => (seconds === 0 ? '睡着时一直打呼噜到醒' : `每次睡着打 ${seconds} 秒呼噜`),
    sound: (on: boolean): string => (on ? '打开音效' : '关掉音效'),
    scale: (from: number, to: number) => `把大小从 ${from} 倍改成 ${to} 倍`,
    theme: { dark: '换成夜间模式', light: '换成白天模式' } as Record<'dark' | 'light', string>,
    hover: (list: string) => `把悬停按钮换成${list}`,
    actions: { chat: '打字', voice: '语音输入', roam: '行为模式', theme: '夜间模式', sound: '音效', dress: '装扮', hide: '隐藏桌宠' } as Record<string, string>,
    user: (to: string) => `改叫你「${to}」`,
  },

  /** 页面端口都被占用时 World 启动失败的原因 */
  portsTaken: (from: number, to: number, why: string) => `端口 ${from}–${to} 都被占用：${why}`,

  /** 控制台:World 页的状态灯、链接、面板与提示词说明 */
  console: {
    label: '桌宠',
    window: '桌宠窗口',
    connected: '页面已连接',
    notOpen: '未打开',
    voice: '语音识别',
    notStarted: '未启动',
    viewInBrowser: '在浏览器里看桌宠',
    dress: '装扮',
    panels: {
      pet: { title: '桌宠', description: '窗口、装扮与窗口运行时。' },
      voice: { title: '语音输入', description: '识别引擎、电平与识别结果。' },
      chat: { title: '对话', description: '对话页：打字和发图给它，看它说过的话与做过的事。' },
    } as Record<'pet' | 'voice' | 'chat', { title: string; description: string }>,
    envPrompt: { title: '桌宠环境', description: '描述桌宠的身体、四个工具与输入事件。' },
    vars: {
      'pet.user': '对使用者的称呼',
      'pet.vocab': '当前形象的表情与动作词表',
      'pet.voice': '语音输入开着还是关着',
      'pet.body': '当前形象的样子',
      'pet.dress': 'pet_set 能选的形象与打扮',
      'pet.self': '「自主配置权限」：哪些设置直接改、哪些先征得同意，或都不能改',
      'pet.chat': '应用提供对话页时，对它的说明；没有时为空',
      'pet.reply': '应用语言既不是简体中文也不是英文时，让 bot 用那种语言说话的一句；否则为空',
    } as Record<string, string>,
    noImage: '没有这张图',
    noGuide: '这个应用没有引导',
    unknownMethod: (name: string) => `未知方法 ${name}`,
  },

  /** 控制台的配置项(高级模式的 World 页与设置页) */
  config: {
    group: '桌宠',
    soundGroup: '音效',
    asrGroup: '语音输入',
    user: { title: '怎么称呼你', description: (max: number) => `语音、打字和互动事件里用这个名字指代你，最多 ${max} 个字。留空时用默认称呼。` },
    roam: { title: '行为模式', description: 'free 常走动；calm 多待着；off 只做被要求的动作。' },
    theme: { title: '黑白模式', description: 'dark 夜间：浅色身体、深色气泡；light 白天：深色身体、浅色气泡。' },
    rememberPosition: { title: '记住位置', description: '退出时记下桌宠的横向位置，下次启动落回那里；有多块屏幕时总在主屏上启动。' },
    hoverButtons: { title: '悬停按钮', description: (max: number, ids: string) => `鼠标停在桌宠身上时旁边出现的按钮，最多 ${max} 个，逗号分隔：${ids}。` },
    doubleClickChat: { title: '双击打字', description: '双击桌宠打开打字框。' },
    statusBubble: { title: '状态气泡', description: '想事情、翻记忆、操作电脑时显示在做什么，会显示文件名。' },
    selfAdjust: { title: '自主配置权限', description: 'off 禁止：不能自己改设置，也不能临时安静；default 默认：形象、配色、走动和打呼直接改，大小、音效、主题、悬停按钮和称呼先征得你同意；any 任意：都直接改；custom 自定义：按「习惯」页里的勾选，勾上的直接改，其余先征得你同意。' },
    windowEnabled: { title: '启动时打开桌宠窗口' },
    scale: { title: '大小' },
    frameRate: { title: '帧率', description: '走动、被拎着、跳起时每秒画多少帧；0 跟随显示器刷新率。超过显示器刷新率时按显示器的。「习惯」页可选 60、120、144 和不限。' },
    lockFrameRate: { title: '一直按帧率画', description: '静止时也按「帧率」画桌宠。关着时站着、坐着、睡着降到每秒 30 帧。' },
    hideWhenFullscreen: { title: '全屏时自动隐藏', description: '开着时，前台窗口全屏铺满桌宠所在的那块屏（游戏、全屏视频、浏览器全屏）就把它藏起来，退出全屏放回来；最大化的窗口不算。关着时一直浮在上面。' },
    electronFile: { title: 'Electron 程序', description: '留空时依次用 CORTICO_DESKTOP_PET_HOST 和面板里安装的运行时。' },
    port: { title: '页面端口', description: '被占用时向上顺延。' },
    touchEnabled: { title: '互动发成事件', description: '戳、摸、拎起来甩出去。' },
    touchWakeOn: { title: '回应模式', description: 'poke 只有点一下唤醒，摸头和拎起来跟着下一次唤醒一起送；all 都唤醒；none 都跟着下一次唤醒送。一次互动唤醒之后、这一轮结束之前的互动，都跟着下一次唤醒送。custom 按「习惯」页里勾选的互动唤醒。' },
    sound: { title: '音效总开关', description: '桌宠菜单里的音效按钮切的就是这个。' },
    sounds: {
      move: { title: '动作', description: '走路、跑、跳、落地、被甩出去、点头、摇头、转圈、晕、发抖、跳舞、张望。' },
      touch: { title: '互动', description: '被拎起来、拎着晃、被摸、被戳。' },
      face: { title: '表情', description: '开心、眨眼、喜欢、惊讶、生气、难过、害羞、打哈欠。' },
      snore: { title: '打呼噜', description: '' },
      talk: { title: '说话', description: '气泡里逐字冒出的叽咕声、选项卡片弹出的声音。' },
      ui: { title: '按钮与提示', description: '点按钮、气泡弹出、选中、开始和结束听你说话。' },
    } as Record<'move' | 'touch' | 'face' | 'snore' | 'talk' | 'ui', { title: string; description: string }>,
    snoreSeconds: { title: '呼噜打多久', suffix: '秒', description: '每次睡着后打这么久呼噜就安静下来，Z 照样飘；0 = 一直打到醒。' },
    asrEnabled: { title: '语音输入总开关' },
    asrEngine: { title: '识别引擎', description: 'funasr 用 FunASR 的 SenseVoiceSmall，支持中文、英文、日文、韩文和粤语，首次要下载约 240 MB 的模型；whisper 用 OpenAI 的 Whisper small，支持法语、德语、西班牙语、葡萄牙语、意大利语、俄语等近百种语言，首次要下载约 360 MB 的模型，一句说完才出字；这两个都在本机识别。system 用 Windows 自带的语音识别，不用下载，准确度低一些（只在 Windows 上有）。留空时按应用语言选：中文、英文、日文、韩文用 funasr，其余用 whisper。' },
    asrLanguage: { title: '语言', description: 'ISO 639-1 语言代码，或 auto 让模型自己判断；留空时跟随应用语言。FunASR 认 zh、en、ja、ko、yue，Whisper 认 fr、de、es、pt、it、ru 等近百种，不认的代码按 auto。' },
    asrThreads: { title: 'CPU 线程', description: 'FunASR 和 Whisper 一次识别用几个线程，0 = 2。' },
    asrSimplified: { title: '转成简体', description: '应用语言是简体中文时把识别出的繁体字转成简体。' },
    thresholdDb: { title: '说话门槛' },
    silenceMs: { title: '一句结束的静音' },
    maxUtteranceMs: { title: '一句最长' },
  },

  /** 控制台的「桌宠」「语音输入」面板 */
  panel: {
    pet: '桌宠',
    window: '桌宠窗口',
    openWindow: '打开窗口',
    closeWindow: '关闭窗口',
    runtime: '窗口运行时',
    install: '安装',
    viewInBrowser: '在浏览器里看',
    dress: '装扮',
    dressHint: '改动会立刻保存，并同步到桌宠窗口',
    connected: '已连接',
    starting: '启动中',
    cannotOpen: '打不开',
    notOpen: '未打开',
    external: '用外部程序',
    installed: '已安装',
    downloading: (progress: string) => `下载中 ${progress}`,
    installFailed: '安装失败',
    notInstalled: '未安装',
    noBuild: '本平台没有预编译包',
    electronSize: 'Electron 44.4.4，约 150 MB',

    voice: '语音输入',
    enable: '开启语音输入',
    enabledHint: '已开启：麦克风一直打开，按下面的收音方式把说的话发给桌宠',
    disabledHint: '已关闭：不打开麦克风，下面的设置暂不生效',
    engine: '识别引擎',
    funasr: 'FunASR（本机识别）',
    system: 'Windows 自带',
    whisper: 'Whisper（本机识别）',
    systemHint: '不用下载，准确度一般；想要更准换成 FunASR 或 Whisper',
    funasrHint: 'SenseVoiceSmall，在本机识别，支持中文、英文、日文、韩文和粤语；模型下载一次就能一直用',
    whisperHint: 'Whisper small，在本机识别，支持法语、德语、西班牙语、葡萄牙语、意大利语、俄语等；一句说完才出字；模型下载一次就能一直用',
    server: '识别服务',
    start: '启动',
    stop: '停止',
    ready: '就绪',
    error: '出错',
    stopped: '已停止',
    model: '识别模型',
    download: '下载',
    retry: '重试',
    downloadFailed: '下载失败',
    downloaded: '已下载',
    notDownloaded: '还没下载',
    modelSource: (size: string) => `约 ${size}，从 ModelScope 下载，国内可用`,
    mic: '麦克风',
    micStates: { on: '收音中', off: '没在收', denied: '被拒绝', error: '出错' } as Record<string, string>,
    defaultDevice: '系统默认',
    missingDevice: '之前选的设备（现在找不到）',
    micN: (n: number) => `麦克风 ${n}`,
    mode: '收音方式',
    modes: { hold: '按住说话键时收音', toggle: '用说话键开关收音', always: '一直收音' } as Record<'hold' | 'toggle' | 'always', string>,
    /** 说话键怎么按:按住说话、开关收音两种模式下的说法,按连按次数 */
    presses: {
      2: { hold: '双击再按住', toggle: '双击开始，再双击停' },
      1: { hold: '直接按住', toggle: '按一下开始，再按一下停' },
      3: { hold: '三击再按住', toggle: '三击开始，再三击停' },
    } as Record<number, Record<'hold' | 'toggle', string>>,
    talkKey: (label: string) => `说话键：${label}`,
    capture: '按下新的说话键，可以是组合键或鼠标侧键…（Esc 取消）',
    listening: '正在收音',
    waitingKey: '等说话键',
    keyProblem: (problem: string) => `${problem}，改为一直收音`,
    results: '识别结果',
    resultsHint: '划掉的是太短或疑似幻觉、没有发出去的',
  },

  /** 对话页发消息被退回的原因与提示 */
  chat: {
    badImages: '图片格式不对',
    tooManyImages: (max: number) => `一次最多 ${max} 张图`,
    badMime: (mime: string) => `不支持的图片格式 ${mime}`,
    emptyImage: '有一张图是空的',
    bigImage: (mb: number) => `单张图不能超过 ${mb} MB`,
    offline: '还没连上',
    notSent: '没能送出',
    tooLate: '这条已经送到了，撤不回来。',
  },
};
