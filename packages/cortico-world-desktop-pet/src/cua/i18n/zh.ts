/**
 * 简体中文:电脑操作给人看的文字。键与 en.ts 相同;繁体中文缺的顶层键读这里。
 * 征求同意的问句与系统对话框按应用语言;控制台的配置项与状态灯按控制台请求的语言。
 * 给 bot 读的文字(包括引擎的报错)不在这里(model-text.ts)。
 */
export default {
  /** 用电脑前征求同意:who 是 bot 的名字 */
  ask: {
    eachTurn: (who: string) => `${who} 想使用你的电脑：查看屏幕、操作鼠标和键盘。这一次可以吗？`,
    once: (who: string, minutes: number) => `${who} 想操作你的鼠标和键盘。接下来 ${minutes} 分钟内都可以吗？`,
    acting: (who: string) => `${who} 想操作你的鼠标和键盘。这一次可以吗？`,
    /** 两个按钮:桌宠气泡和系统对话框共用;caption 是系统对话框的标题(桌宠页不在时才弹) */
    caption: '电脑操作',
    yes: '可以',
    no: '这次不行',
  },

  /** 这个系统能不能用电脑操作 */
  preflight: {
    noDisplay: '电脑操作在 Linux 上需要 X11（或 Wayland 下的 XWayland）：没有找到 DISPLAY。',
    unsupported: '电脑操作只支持 Windows、macOS 和 Linux。',
  },

  /** 控制台:桌宠 World 页上操作引擎的状态灯 */
  console: {
    engine: '操作引擎',
    screen: (w: number, h: number) => `屏幕 ${w}×${h}`,
    onDemand: '按需启动',
    exited: (code: number | null) => `引擎进程退出（退出码 ${code}）`,
    allowed: '允许',
    viewOnly: '只看',
    asking: '询问',
    levels: { 'ask-each-turn': '每轮', 'ask-before-acting': '动手前', 'ask-once': (minutes: number) => `${minutes} 分钟一次`, 'never-ask': '不问' },
  },

  /** 控制台的配置项 */
  config: {
    group: '电脑操作',
    enabled: { title: '启用电脑操作' },
    control: { title: '允许操作鼠标和键盘', description: '关闭后只能截图和列出窗口。' },
    permission: { title: '询问时机', description: 'ask-each-turn：每轮查看屏幕或操作前都询问；ask-before-acting：查看屏幕不询问，每轮操作鼠标键盘前询问；ask-once：查看屏幕不询问，操作前询问一次，同意后在「同意有效期」内不再询问；never-ask：从不询问。' },
    grantMinutes: { title: '同意有效期', suffix: '分钟', description: '只对 ask-once 有效。' },
    userIdleMs: { title: '让位时长', description: '你操作鼠标或键盘后，需静止这么久才继续操作。' },
    maxYieldWaitMs: { title: '让位最多等待' },
    maxWidth: { title: '截图最大宽' },
    maxHeight: { title: '截图最大高' },
    quality: { title: '截图质量' },
    afterAction: { title: '操作后附截图' },
    settleMs: { title: '截图前等待' },
  },
};
