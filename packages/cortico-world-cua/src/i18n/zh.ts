/**
 * 简体中文:这个 World 给人看的文字。键与 en.ts 相同;繁体中文缺的顶层键读这里。
 * 征求同意的问句与系统对话框按应用语言;控制台的配置项、状态与提示词说明按控制台请求的语言。
 * 给 bot 读的文字(包括引擎的报错)不在这里(model-text.ts)。
 */
export default {
  /** 用电脑前征求同意:who 是 bot 的名字 */
  ask: {
    eachTurn: (who: string) => `${who} 想用你的电脑:看屏幕、动鼠标和键盘。这一次可以吗?`,
    once: (who: string, minutes: number) => `${who} 想动你的鼠标和键盘。接下来 ${minutes} 分钟里都可以吗?`,
    acting: (who: string) => `${who} 想动你的鼠标和键盘。这一次可以吗?`,
    /** 没有桌宠页时,系统对话框的标题和两个按钮 */
    caption: '电脑操作',
    yes: '可以',
    no: '不行',
  },

  /** World 启动前的检查 */
  preflight: {
    noDisplay: '电脑操作 World 在 Linux 上需要 X11(或 Wayland 下的 XWayland):没有找到 DISPLAY。',
    unsupported: '电脑操作 World 只支持 Windows、macOS 和 Linux。',
  },

  /** 控制台:World 页的状态灯、标签与提示词说明 */
  console: {
    label: '电脑操作',
    engine: '操作引擎',
    screen: (w: number, h: number) => `屏幕 ${w}×${h}`,
    onDemand: '按需启动',
    exited: (code: number | null) => `引擎进程退出(退出码 ${code})`,
    control: '操作',
    allowed: '允许',
    viewOnly: '只看',
    asking: '询问',
    levels: { 'ask-each-turn': '每轮', 'ask-before-acting': '动手前', 'ask-once': (minutes: number) => `${minutes} 分钟一次`, 'never-ask': '不问' },
    envPrompt: { title: '电脑操作环境', description: '截图坐标、让位规则与操作边界。' },
    vars: {
      'cua.os': '这台电脑的系统:Windows 或 Mac',
      'cua.keys': '这个系统常用的快捷键',
      'cua.shot': '截图尺寸',
      'cua.control': '是否允许操作鼠标键盘',
      'cua.idle': '让位时长(秒)',
      'cua.permission': '什么时候先问使用者(按 permission 设置)',
    } as Record<string, string>,
  },

  /** 控制台的配置项 */
  config: {
    group: '电脑操作',
    control: { title: '允许操作鼠标键盘', description: '关掉后只能截图和列窗口。' },
    permission: { title: '什么时候先问你', description: 'ask-each-turn:每一轮看屏幕或动手前都问;ask-before-acting:看屏幕不问,每一轮动鼠标键盘前问;ask-once:看屏幕不问,动鼠标键盘前问一次,同意后「同意管多久」内不再问;never-ask:都不问。' },
    grantMinutes: { title: '同意管多久', suffix: '分钟', description: '只对 ask-once 有效。' },
    userIdleMs: { title: '让位时长', description: '你动过鼠标或键盘后,要静止这么久才继续操作。' },
    maxYieldWaitMs: { title: '让位最多等待' },
    maxWidth: { title: '截图最大宽' },
    maxHeight: { title: '截图最大高' },
    quality: { title: '截图质量' },
    afterAction: { title: '操作后附截图' },
    settleMs: { title: '截图前等待' },
  },
};
