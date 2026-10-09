/**
 * What the bot reads from this World (receipts and environment prompt values), in Chinese and in
 * English; `en: typeof zh` keeps the two tables' keys and signatures the same. The embedding app
 * picks the language (`CuaWorldOptions.modelLanguage`), Chinese when it does not. Window titles go into
 * these lines as they came; the engine's errors are worded here from their codes (`engineErrors`).
 */
import type { PermissionLevel } from './config.ts';
import type { EngineErrorCode } from './engine/fail.ts';

export type ModelLanguage = 'zh' | 'en';

type Button = 'left' | 'right' | 'middle';

const zh = {
  notRun: (tool: string, why: string) => `[${tool} 没执行] ${why}`,
  failed: (tool: string, why: string) => `[${tool} 失败] ${why}`,
  askAgain: '下一轮再用会重新询问。',
  interruptedBeforeAct: '收到打断时还没开始操作。',
  interruptedAsking: '收到打断时还在等使用者回答能不能用电脑。',
  askTimedOut: (seconds: number) => `问了使用者能不能用电脑,${seconds} 秒没有回应,这一轮不能用。`,
  refused: (level: PermissionLevel) => `使用者这一轮没有允许${level === 'ask-each-turn' ? '用电脑' : '动鼠标键盘'}。`,
  worldStopped: 'World 已停止',
  /** `code` absent: a clean exit. */
  engineExited: (code?: number | null) => (code === undefined ? '引擎进程已退出' : `引擎进程退出(退出码 ${code})`),
  engineTimeout: '引擎没有在期限内应答',
  /** What the engine's error codes say; `args` as the engine sent them. */
  engineErrors: {
    macScreenPermission: () => '没有「屏幕录制」权限:在「系统设置 → 隐私与安全性 → 录屏与系统录音」里打开 Coopanion,再重启它;已经开着的话,先用「−」把 Coopanion 移出列表再加回来:更新后的新版本不认旧授权',
    macInputPermission: () => '没有「辅助功能」权限:在「系统设置 → 隐私与安全性 → 辅助功能」里打开 Coopanion,再重启它;已经开着的话,先用「−」把 Coopanion 移出列表再加回来:更新后的新版本不认旧授权',
    macNoKey: (vk) => `Mac 键盘上没有这个键(虚拟键码 ${vk})`,
    x11Display: () => '连不上 X11 显示(DISPLAY 没有设置?):电脑操作在 Linux 上需要 X11 或 XWayland',
    linuxNoScreenshot: () => '截屏失败:X 服务器给不出屏幕画面(Wayland 下的 XWayland 常见),也没有找到截屏工具。请安装 grim、spectacle、scrot 或 ImageMagick 之一,或者改用 X11 会话',
    linuxPixelFormat: (bits) => `截屏失败:不支持的像素格式(${bits} 位)`,
    linuxNoKey: (vk) => `这个键盘布局里没有这个键(虚拟键码 ${vk})`,
    linuxNoXdotool: () => '打字需要 xdotool:请先安装(Debian/Ubuntu: sudo apt install xdotool)',
    winBitBlt: () => 'BitBlt 失败',
    winGetDIBits: (lines, height) => `GetDIBits 只取到 ${lines}/${height} 行`,
    winSendInput: (sent, total) => `SendInput 只送出 ${sent}/${total} 个事件(可能被更高权限的窗口挡住)`,
  } as Record<EngineErrorCode, (...args: Array<string | number | undefined>) => string>,

  screenshot: (lead: string, w: number, h: number, sw: number, sh: number, cursor: string, foreground: string | null, seen: boolean) =>
    `${lead}截图 ${w}×${h}(屏幕 ${sw}×${sh});鼠标在 ${cursor};前台窗口「${foreground ?? '无'}」。` + (seen ? '' : '\n当前模型不接收图片,只能读到这段文字。'),
  screenshotFallback: (w: number, h: number) => `屏幕截图 ${w}×${h}`,
  viewOnly: '这台电脑的设置只允许看,不允许操作鼠标键盘(worlds.cua.control 关着)。',
  yielded: (seconds: number) => `等了 ${seconds} 秒,用户一直在用鼠标或键盘,没有和用户抢着操作。`,
  cancelledWaiting: (seconds: string) => `等用户停手 ${seconds} 秒时收到打断,没有发出输入。`,
  waitedFirst: (seconds: string) => `(先等用户停手 ${seconds} 秒)`,
  after: (line: string, cursor: string, foreground: string | null) => `${line} 鼠标在 ${cursor};前台窗口「${foreground ?? '无'}」。`,
  noShotInterrupted: '收到打断,没有截图。',

  notNumbers: 'x、y 要是数字',
  offShot: (x: number, y: number, maxX: number, maxY: number) => `(${x}, ${y}) 不在截图范围内(0–${maxX}, 0–${maxY})`,
  clicked: (x: unknown, y: unknown, button: Button, count: 1 | 2 | 3) =>
    `已在 (${x}, ${y}) ${{ left: '左键', right: '右键', middle: '中键' }[button]}${{ 1: '单击', 2: '双击', 3: '三击' }[count]}。`,
  moved: (x: unknown, y: unknown) => `鼠标已移到 (${x}, ${y})。`,
  dragStart: (why: string) => `起点${why}`,
  dragEnd: (why: string) => `终点${why}`,
  dragged: (from: unknown[], to: unknown[]) => `已从 (${from[0]}, ${from[1]}) 拖到 (${to[0]}, ${to[1]})。`,
  scrollNone: 'down 和 right 都是 0。',
  scrolled: (x: unknown, y: unknown, down: number, right: number) => {
    const parts = [down ? `${down > 0 ? '向下' : '向上'} ${Math.abs(down)} 格` : '', right ? `${right > 0 ? '向右' : '向左'} ${Math.abs(right)} 格` : ''].filter(Boolean);
    return `已在 (${x}, ${y}) 滚动${parts.join('、')}。`;
  },
  typeEmpty: 'text 是空的。',
  typedPart: (typed: number, total: number, by: 'cancel' | 'user') => `只输入了 ${typed}/${total} 个字符:${by === 'cancel' ? '收到打断' : '用户开始操作'},停了下来。`,
  typed: (total: number) => `已输入 ${total} 个字符。`,
  keyBad: (why: string) => `${why}。`,
  keyUnknown: (name: string) => `不认识的键「${name}」`,
  keyNone: '没有给出按键',
  pressed: (spec: string) => `已按 ${spec}。`,
  minimized: '最小化',
  offScreen: '不在主屏幕',
  windowLine: (handle: string, foreground: boolean, title: string, where: string) => `- ${handle}${foreground ? ' [前台]' : ''} 「${title}」 ${where}`,
  windows: (n: number, lines: string[]) => `可见窗口 ${n} 个(位置用截图坐标,前面的在上层):\n${lines.join('\n')}`,
  focusEmpty: 'window 是空的。',
  focusMissing: (key: string) => `没有标题包含「${key}」的可见窗口。`,
  focused: (title: string) => `已把「${title}」切到前台。`,
  focusRefused: (title: string, foreground: string | null) => `尝试切换到「${title}」,系统没有让它到前台;现在前台是「${foreground ?? '无'}」。`,
  waitInterrupted: (waited: string, seconds: number) => `等了 ${waited}/${seconds} 秒时收到打断,没有截图。`,
  waited: (seconds: number) => `等了 ${seconds} 秒。`,
  waitNoLook: (seconds: number) => `等了 ${seconds} 秒。这一轮使用者还没允许看屏幕,所以没有截图;要看就用 cua_screenshot,会先问使用者。`,

  keysMac: '这是 Mac:复制粘贴、全选、保存用 cmd(cmd+c、cmd+v、cmd+a、cmd+s),切换应用用 cmd+tab。',
  keysOther: '复制粘贴、全选、保存用 ctrl(ctrl+c、ctrl+v、ctrl+a、ctrl+s),切换窗口用 alt+tab。',
  control: (allowed: boolean): string => (allowed ? '允许操作鼠标和键盘' : '只允许截图和列窗口,不能操作鼠标键盘'),
  permission: (level: PermissionLevel, grantMinutes: number) => ({
    'ask-each-turn': '每一轮第一次截图或操作之前,使用者会被问一次能不能用电脑。使用者没同意,这一轮的电脑操作工具都不执行;不要换别的工具绕过去,等使用者开口。',
    'ask-before-acting': '截图和列窗口不用先问。每一轮第一次动鼠标或键盘之前,使用者会被问一次;使用者没同意,这一轮的输入工具都不执行,截图照常;不要换别的工具绕过去,等使用者开口。',
    'ask-once': `截图和列窗口不用先问。动鼠标或键盘之前会问使用者一次,同意后 ${grantMinutes} 分钟内不再问;使用者没同意,这一轮的输入工具都不执行,截图照常;不要换别的工具绕过去,等使用者开口。`,
    'never-ask': '看屏幕和动鼠标键盘都不用先问使用者,工具直接执行。',
  })[level],
};

const en: typeof zh = {
  notRun: (tool, why) => `[${tool} not run] ${why}`,
  failed: (tool, why) => `[${tool} failed] ${why}`,
  askAgain: ' The person is asked again the next time it is used in a later turn.',
  interruptedBeforeAct: 'Interrupted before anything was done.',
  interruptedAsking: 'Interrupted while still waiting for the person to answer whether you may use the computer.',
  askTimedOut: (seconds) => `Asked the person whether you may use the computer; no answer in ${seconds} seconds, so not this turn.`,
  refused: (level) => `The person did not allow ${level === 'ask-each-turn' ? 'computer use' : 'mouse and keyboard input'} this turn.`,
  worldStopped: 'The World stopped',
  engineExited: (code) => (code === undefined ? 'The engine process exited' : `The engine process exited (exit code ${code})`),
  engineTimeout: 'The engine did not answer in time',
  engineErrors: {
    macScreenPermission: () => 'No Screen Recording permission: turn Coopanion on under System Settings → Privacy & Security → Screen & System Audio Recording, then restart it. If it is on already, remove Coopanion from the list with "−" and add it back: an updated version does not inherit the old permission',
    macInputPermission: () => 'No Accessibility permission: turn Coopanion on under System Settings → Privacy & Security → Accessibility, then restart it. If it is on already, remove Coopanion from the list with "−" and add it back: an updated version does not inherit the old permission',
    macNoKey: (vk) => `A Mac keyboard has no such key (virtual-key code ${vk})`,
    x11Display: () => 'Cannot connect to the X11 display (is DISPLAY set?): computer use on Linux needs X11 or XWayland',
    linuxNoScreenshot: () => 'Screenshot failed: the X server gives no screen image (common with XWayland under Wayland) and no screenshot tool was found. Install one of grim, spectacle, scrot or ImageMagick, or switch to an X11 session',
    linuxPixelFormat: (bits) => `Screenshot failed: unsupported pixel format (${bits} bits)`,
    linuxNoKey: (vk) => `The keyboard layout has no such key (virtual-key code ${vk})`,
    linuxNoXdotool: () => 'Typing needs xdotool: install it first (Debian/Ubuntu: sudo apt install xdotool)',
    winBitBlt: () => 'BitBlt failed',
    winGetDIBits: (lines, height) => `GetDIBits returned only ${lines}/${height} lines`,
    winSendInput: (sent, total) => `SendInput sent only ${sent}/${total} events (a window with higher privileges may be in the way)`,
  },

  screenshot: (lead, w, h, sw, sh, cursor, foreground, seen) =>
    `${lead}Screenshot ${w}×${h} (screen ${sw}×${sh}); mouse at ${cursor}; foreground window "${foreground ?? 'none'}".` + (seen ? '' : '\nThe current model does not take images; this text is all it gets.'),
  screenshotFallback: (w, h) => `screenshot ${w}×${h}`,
  viewOnly: 'This computer\'s settings allow looking only, no mouse or keyboard input (worlds.cua.control is off).',
  yielded: (seconds) => `Waited ${seconds} seconds and the person kept using the mouse or keyboard, so nothing was sent to compete with them.`,
  cancelledWaiting: (seconds) => `Interrupted after waiting ${seconds} seconds for the person to stop; no input was sent.`,
  waitedFirst: (seconds) => ` (after waiting ${seconds} seconds for the person to stop)`,
  after: (line, cursor, foreground) => `${line} Mouse at ${cursor}; foreground window "${foreground ?? 'none'}".`,
  noShotInterrupted: ' Interrupted, so no screenshot.',

  notNumbers: 'x and y must be numbers',
  offShot: (x, y, maxX, maxY) => `(${x}, ${y}) is outside the screenshot (0–${maxX}, 0–${maxY})`,
  clicked: (x, y, button, count) => `${{ 1: 'Clicked', 2: 'Double-clicked', 3: 'Triple-clicked' }[count]} the ${button} button at (${x}, ${y}).`,
  moved: (x, y) => `Moved the mouse to (${x}, ${y}).`,
  dragStart: (why) => `start: ${why}`,
  dragEnd: (why) => `end: ${why}`,
  dragged: (from, to) => `Dragged from (${from[0]}, ${from[1]}) to (${to[0]}, ${to[1]}).`,
  scrollNone: 'down and right are both 0.',
  scrolled: (x, y, down, right) => {
    const notches = (n: number) => `${Math.abs(n)} notch${Math.abs(n) === 1 ? '' : 'es'}`;
    const parts = [down ? `${down > 0 ? 'down' : 'up'} ${notches(down)}` : '', right ? `${right > 0 ? 'right' : 'left'} ${notches(right)}` : ''].filter(Boolean);
    return `Scrolled ${parts.join(' and ')} at (${x}, ${y}).`;
  },
  typeEmpty: 'text is empty.',
  typedPart: (typed, total, by) => `Typed only ${typed}/${total} characters: stopped because ${by === 'cancel' ? 'of an interrupt' : 'the person started using the computer'}.`,
  typed: (total) => `Typed ${total} character${total === 1 ? '' : 's'}.`,
  keyBad: (why) => `${why}.`,
  keyUnknown: (name) => `unknown key "${name}"`,
  keyNone: 'no keys given',
  pressed: (spec) => `Pressed ${spec}.`,
  minimized: 'minimized',
  offScreen: 'not on the main screen',
  windowLine: (handle, foreground, title, where) => `- ${handle}${foreground ? ' [foreground]' : ''} "${title}" ${where}`,
  windows: (n, lines) => `${n} visible window${n === 1 ? '' : 's'} (positions in screenshot coordinates, topmost first):\n${lines.join('\n')}`,
  focusEmpty: 'window is empty.',
  focusMissing: (key) => `No visible window has "${key}" in its title.`,
  focused: (title) => `Brought "${title}" to the foreground.`,
  focusRefused: (title, foreground) => `Tried to switch to "${title}", but the system did not bring it to the foreground; the foreground window is "${foreground ?? 'none'}".`,
  waitInterrupted: (waited, seconds) => `Interrupted after waiting ${waited}/${seconds} seconds; no screenshot.`,
  waited: (seconds) => `Waited ${seconds} seconds.`,
  waitNoLook: (seconds) => `Waited ${seconds} seconds. The person has not allowed looking at the screen this turn, so there is no screenshot; cua_screenshot asks them first.`,

  keysMac: 'This is a Mac: copy, paste, select all and save use cmd (cmd+c, cmd+v, cmd+a, cmd+s), and cmd+tab switches apps.',
  keysOther: 'Copy, paste, select all and save use ctrl (ctrl+c, ctrl+v, ctrl+a, ctrl+s), and alt+tab switches windows.',
  control: (allowed) => (allowed ? 'mouse and keyboard input is allowed' : 'only screenshots and window lists are allowed, no mouse or keyboard input'),
  permission: (level, grantMinutes) => ({
    'ask-each-turn': 'Before the first screenshot or action of each turn, the person is asked once whether you may use the computer. If they do not agree, none of the computer-use tools run this turn; do not route around it with other tools, wait for the person to speak.',
    'ask-before-acting': 'Screenshots and window lists need no asking. Before the first mouse or keyboard input of each turn, the person is asked once; if they do not agree, none of the input tools run this turn, while screenshots still work; do not route around it with other tools, wait for the person to speak.',
    'ask-once': `Screenshots and window lists need no asking. Before mouse or keyboard input the person is asked once, and after a yes not again for ${grantMinutes} minutes; if they do not agree, none of the input tools run this turn, while screenshots still work; do not route around it with other tools, wait for the person to speak.`,
    'never-ask': 'Looking at the screen and using the mouse and keyboard need no asking; the tools run directly.',
  })[level],
};

export type ModelText = typeof zh;

export const MODEL_TEXT: Record<ModelLanguage, ModelText> = { zh, en };
