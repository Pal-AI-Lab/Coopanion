/**
 * What the bot reads from this World (events, receipts, environment prompt values), in Chinese and
 * in English; `en: typeof zh` keeps the two tables' keys and signatures the same. The embedding app
 * picks the language (`DesktopPetAssembly.modelLanguage`), Chinese when it does not. What the person
 * typed, said or answered goes into these lines as it came. The vocabulary table and the dress list
 * have their own tables, in `script.ts` and `self.ts`.
 *
 * The question `pet_set` asks the person in the bubble follows the same choice: it is made of the
 * same change lines as the receipt.
 */
import type { SelfKey } from './config.ts';

export type ModelLanguage = 'zh' | 'en';

interface SayReceipt {
  /** Seconds of earlier lines still ahead of this one. */
  waitSec: number;
  /** Seconds this one stays on screen. */
  selfSec: number;
  chatOpen: boolean;
  /** The unanswered question this one replaced. */
  replaced: string | null;
  /** Markers left out: not in the vocabulary. */
  dropped: string[];
  /** Images shown with it on the chat page. */
  images: number;
}

interface AskReceipt {
  replaced: string | null;
  /** More than three options were given. */
  cut: boolean;
  chatOpen: boolean;
}

/** Why the changes `pet_set` asked about were not made. */
type NotAsked = 'unavailable' | 'timeout' | 'no';

const zh = {
  /** Locale of the weekday in an event's time stamp. */
  dateLocale: 'zh-CN',
  typed: (user: string, text: string) => `[typed] ${user}:${text}`,
  heard: (user: string, text: string) => `[voice] ${user}:${text}`,
  image: (user: string, i: number, total: number) => `[${user}发来的图片 ${i}/${total}]`,

  answerClosed: (user: string, question: string) => `[answer] ${user}关掉了提问「${question}」,没有作答。`,
  answerPicked: (user: string, question: string, n: number, option: string) => `[answer] ${user}回答「${question}」:选了第 ${n} 项「${option}」`,
  answerWrote: (user: string, question: string, text: string) => `[answer] ${user}回答「${question}」:自己写了:「${text}」`,

  touch: (text: string) => `[touch] ${text}`,
  pokedAwake: (user: string) => `${user}把睡着的你戳醒了`,
  poked: (user: string, n: number) => (n > 1 ? `${user}戳了你 ${n} 下` : `${user}戳了你一下`),
  pettedAsleep: (user: string) => `${user}摸了摸睡着的你`,
  petted: (user: string, n: number) => (n > 1 ? `${user}摸了你好几下` : `${user}摸了摸你的头`),
  thrown: (user: string, crashed: boolean) => `${user}把你拎起来甩了出去${crashed ? ',你重重落地,摔晕了一会儿' : ''}`,
  /** `at`: how far across the screen, null when the page did not say. */
  dropped: (user: string, at: string | null, crashed: boolean) => `${user}把你拎起来,放到了屏幕横向 ${at ?? '某'} 处${crashed ? ',你摔晕了一会儿' : ''}`,
  crashed: '你重重落地,摔晕了一会儿',

  figureFailed: (name: string, reason: string, body: string, note: string) => `[figure] ${name}没能显示出来(${reason}),你现在是${body}。${note ? `\n${note}` : ''}`,
  reasonUnknown: '原因不明',
  figureNow: (body: string) => `[figure] 你现在的样子:${body}。`,
  figureNote: (note: string) => `[figure] ${note}`,
  lookNow: (body: string) => `你现在的样子:${body}。`,
  /** The body as the prompt and the figure events describe it: name, looks, picked options. */
  body: (name: string, about: string, picks: string[]) => `${name},${about}${picks.length ? `(${picks.join(',')})` : ''}`,
  pick: (axis: string, option: string) => `${axis}:${option}`,

  /** Follows the across share in `at` for a body that stands off the floor: how far down it is (0% the top). */
  downAt: (y: string) => `,纵向 ${y}`,
  walkArrived: (at: string) => `走到了屏幕横向 ${at} 处。`,
  walkStopped: (at: string) => `走到屏幕横向 ${at} 处停下了。`,
  walkGrabbed: (at: string, user: string) => `没走到:走到 ${at} 处时被${user}拎起来了。`,
  walkReplaced: (at: string, by: string) => `没走到:走到 ${at} 处时换成了别的动作(${by})。`,
  walkTimeout: (seconds: number) => `${seconds} 秒内没有走到。`,
  walkWindowGone: '没走到:桌宠窗口断开了。',
  walkWorldStopped: 'World 已停止,没走到。',
  /** A target of the figure's own, by `name`; `by` is what its body said stopped it. */
  moveArrived: (name: string, at: string) => `到了「${name}」,在屏幕横向 ${at} 处。`,
  moveStopped: (name: string, at: string) => `去「${name}」的途中,在屏幕横向 ${at} 处停下了。`,
  moveGrabbed: (name: string, at: string, user: string) => `没到「${name}」:在屏幕横向 ${at} 处被${user}拎起来了。`,
  moveFailed: (name: string, at: string, by: string) => `没到「${name}」(${by}),现在在屏幕横向 ${at} 处。`,
  moveTimeout: (name: string, seconds: number) => `${seconds} 秒内没到「${name}」。`,
  /** `targets`: the ids of the current figure's own targets. */
  moveBadTarget: (got: string, targets: string[]) => `[pet_move_to 没执行] to 应为 0–1 的数字、left / center / right / cursor${targets.length ? `,或现在的形象的目标 ${targets.join(' / ')}` : ''},收到 ${got}。`,
  moveNoTarget: '[pet_move_to 没执行] 缺少 to。',
  /** `target`: the figure's target the params were given for, null for a default one; `spec`: its params as `id min–max`. */
  moveBadParams: (target: string | null, spec: string[], got: string) => `[pet_move_to 没执行] ${target === null ? '默认目标不带 params' : spec.length ? `${target} 的 params 依次是 ${spec.join('、')},可以少给,不能超出范围` : `${target} 不带 params`},收到 ${got}。`,
  walkCannot: (name: string) => `[pet_move_to 没执行] 现在的形象(${name})不会走到默认目标。`,

  /** `detail`: the window host's own words on why, when it has them. */
  notConnected: (tool: string, detail: string | null, user: string) => `[${tool} 没执行] 桌宠窗口没有连接${detail ? `(${detail})` : ''},${user}看不到。`,
  /** Why the pet window is not there (window-host.ts), as `notConnected` passes it on. */
  window: {
    badHostEnv: (env: string) => `${env} 不是 JSON 字符串数组`,
    noElectronFile: (file: string) => `Electron 程序不存在:${file}`,
    noElectron: '没有可用的 Electron:在桌宠面板安装窗口运行时,或在配置里指定 Electron 程序',
    startFailed: (why: string) => `启动失败:${why}`,
    closed: '窗口已关闭',
    exited: (code: number | null) => `窗口进程退出(退出码 ${code})`,
  },

  sayEmpty: '[pet_say 没执行] 脚本是空的,也没带图片。不想说话就不调用。',
  sayReceipt: (r: SayReceipt) => `${r.waitSec > .5 ? `已排队,前面还有约 ${Math.round(r.waitSec)} 秒` : '已开始显示'},这段约 ${Math.round(r.selfSec)} 秒。`
    + (r.chatOpen ? '对话页开着,这段也显示在那里。' : '')
    + (r.images ? `附带的 ${r.images} 张图片只显示在对话页。` : '')
    + (r.replaced !== null ? `替换了还没回答的提问「${r.replaced}」。` : '')
    + (r.dropped.length ? `\n[执行参数] 当前形象的词表里没有这些标记,已略过:${r.dropped.join('、')}。` : ''),

  /** `pet_say` with images and an empty script. */
  imagesShown: (n: number, chatOpen: boolean) => `${n} 张图片已显示在对话页${chatOpen ? '' : ',对话页现在没有打开'}。`,
  /** fallbackText of an image `pet_say` showed; that event is stored, never delivered. */
  shownImage: (i: number, total: number) => `[对话页上展示的图片 ${i}/${total}]`,
  imagesNotHandles: '[pet_say 没执行] images 要填附件句柄组成的数组。',
  tooManyImages: (max: number) => `[pet_say 没执行] images 最多 ${max} 个。`,
  imageMissing: (handle: string) => `[pet_say 没执行] 读不到附件 ${handle}。images 填上下文里 [blob …] 行开头的句柄。`,
  imageNotImage: (handle: string, mime: string) => `[pet_say 没执行] ${handle} 是 ${mime},不是图片。`,

  askEmpty: '[pet_ask 没执行] question 是空的。',
  askNoWay: '[pet_ask 没执行] 没有选项,又不允许自己写,没法作答。',
  askReceipt: (r: AskReceipt) => '已问出。'
    + (r.replaced !== null ? `替换了还没回答的上一个提问「${r.replaced}」。` : '')
    + (r.cut ? '只显示了前 3 个选项。' : '')
    + (r.chatOpen ? '对话页开着,问题也显示在那里,两边都能回答。' : '')
    + '回答到了会以 [answer] 事件送达。',

  selfAdjustOff: (tool: string, user: string) => `[${tool} 没执行] ${user}在「习惯」页把「自主配置权限」设成了「禁止」。`,
  setErrors: (errors: string[]) => `[pet_set 没执行] ${errors.join(';')}。`,
  setNothing: '要改的都和现在一样,没有改动。',
  setDone: (says: string[]) => `已改:${says.join(';')}。`,
  setAgreed: (user: string, says: string[]) => `${user}同意了,已改:${says.join(';')}。`,
  /** The person answered 「以后都可以」: `items` are changed at once from now on. */
  setAlways: (user: string, says: string[], items: string[]) => `${user}同意了,已改:${says.join(';')}。${user}还说${items.join('、')}以后不用再问,直接改就行。`,
  setNotChanged: (why: NotAsked, user: string, says: string[]) =>
    `${why === 'unavailable' ? '桌宠窗口没有连接,没法问' : why === 'timeout' ? `${user}没有回答` : `${user}没同意`},这些没改:${says.join(';')}。`,

  quietBad: (max: number) => `[pet_quiet 没执行] minutes 应为 0–${max} 的数。`,
  quietNone: '现在没有在安静。',
  quietEnded: '已结束安静,音效和走动回到设置里的样子。',
  quietUntil: (time: string, sound: boolean, roam: 'off' | 'calm') => `安静到 ${time}:音效${sound ? '照常' : '关'},走动 ${roam === 'off' ? '不乱动' : '多待着'}。设置没变,到时自动恢复。`,

  actNone: (dropped: string[]) => `[pet_act 没执行] 当前形象的词表里没有这些动作${dropped.length ? `(${dropped.join('、')})` : ''}。`,
  actReceipt: (actions: string[], lasting: string[], dropped: string[]) => `开始依次做:${actions.join(' → ')}。`
    + (lasting.length ? `${lasting.join('、')} 会一直保持到下一个动作。` : '')
    + (dropped.length ? `\n[执行参数] 当前形象的词表里没有这些,已略过:${dropped.join('、')}。` : ''),

  on: '开着',
  off: '关着',
  /** `pet_set`'s items, named for the bot with the parameter each is. */
  settingNames: {
    figure: '形象(figure)', scheme: '打扮(scheme)', roam: '走动(roam)', snoreSeconds: '呼噜时长(snoreSeconds)', sound: '音效(sound)',
    scale: '大小(scale)', bubbleSize: '气泡尺寸(bubbleSize)', fontSize: '字体尺寸(fontSize)', theme: '黑白模式(theme)', hoverButtons: '悬停按钮(hoverButtons)', user: '对对方的称呼(user)',
  } as Record<SelfKey, string>,
  /** `{{pet.self}}`: the items that change at once and the ones asked first. */
  selfTiers: (user: string, direct: string[], asked: string[]) => (!asked.length ? '现在这些都直接生效。'
    : !direct.length ? `现在这些都要先在气泡里征得${user}同意。`
    : `现在直接生效的:${direct.join('、')};先在气泡里征得${user}同意的:${asked.join('、')}。`),
  /** `{{pet.self}}` while the person allows no change. */
  selfNone: (user: string) => `${user}在「习惯」页把「自主配置权限」设成了「禁止」,现在这些你都改不了,\`pet_quiet\` 也用不了。`,
  /** `{{pet.chat}}`, when the app has a chat page. */
  chatPage: (_user: string) => '应用的「对话」页按时间列出这些气泡、对方的话,以及你两句话之间调用过的工具名;对方也能在那里打字、发图片(同样是 `[typed]` 事件,图片接在正文后),回答 `pet_ask`。`pet_say` 带的 `images` 只显示在对话页,头顶气泡不显示。',
  /** `{{pet.cua}}` while computer use is off on a system that runs it. */
  cuaOff: (user: string, canOpen: boolean) => `## 电脑操作\n\n电脑操作现在关着:你看不到屏幕,也动不了鼠标和键盘。${user}想让你看屏幕或帮忙操作电脑时,可以提出打开它:在设置窗口「习惯」页的「电脑操作」一节,打开前那里会讲清风险。` +
    (canOpen ? `${user}同意去打开的话,\`pet_cua_open_settings\` 把设置窗口直接打开到那里。` : ''),
  /** The receipt of `pet_cua_open_settings`. */
  cuaSettingsOpened: (user: string) => `设置窗口已打开到「电脑操作」,正弹着风险说明;${user}点「打开」之后,下一条消息起你就能用电脑操作的工具。`,
  /** `{{pet.reply}}`: the language to talk to the person in, named by the app. */
  reply: (user: string, language: string) => `对${user}说的话,气泡、提问和选项,都用${language}。`,
};

const en: typeof zh = {
  dateLocale: 'en-US',
  typed: (user, text) => `[typed] ${user}: ${text}`,
  heard: (user, text) => `[voice] ${user}: ${text}`,
  image: (user, i, total) => `[image ${i}/${total} from ${user}]`,

  answerClosed: (user, question) => `[answer] ${user} closed the question "${question}" without answering.`,
  answerPicked: (user, question, n, option) => `[answer] ${user} answered "${question}": picked option ${n}, "${option}"`,
  answerWrote: (user, question, text) => `[answer] ${user} answered "${question}" in their own words: "${text}"`,

  touch: (text) => `[touch] ${text}`,
  pokedAwake: (user) => `${user} poked you awake`,
  poked: (user, n) => (n > 1 ? `${user} poked you ${n} times` : `${user} poked you`),
  pettedAsleep: (user) => `${user} patted you while you were asleep`,
  petted: (user, n) => (n > 1 ? `${user} patted you several times` : `${user} patted your head`),
  thrown: (user, crashed) => `${user} picked you up and threw you${crashed ? '; you landed hard and were knocked out for a moment' : ''}`,
  dropped: (user, at, crashed) => `${user} picked you up and put you down ${at ? `at ${at} across the screen` : 'somewhere on the screen'}${crashed ? '; you were knocked out for a moment' : ''}`,
  crashed: 'You landed hard and were knocked out for a moment',

  figureFailed: (name, reason, body, note) => `[figure] ${name} could not be shown (${reason}); you are now ${body}.${note ? `\n${note}` : ''}`,
  reasonUnknown: 'reason unknown',
  figureNow: (body) => `[figure] You now look like this: ${body}.`,
  figureNote: (note) => `[figure] ${note}`,
  lookNow: (body) => `You now look like this: ${body}.`,
  body: (name, about, picks) => `${name}, ${about}${picks.length ? ` (${picks.join(', ')})` : ''}`,
  pick: (axis, option) => `${axis}: ${option}`,

  downAt: (y) => ` (${y} down)`,
  walkArrived: (at) => `Arrived at ${at} across the screen.`,
  walkStopped: (at) => `Stopped at ${at} across the screen.`,
  walkGrabbed: (at, user) => `Did not get there: ${user} picked you up at ${at} across the screen.`,
  walkReplaced: (at, by) => `Did not get there: at ${at} across the screen another action took over (${by}).`,
  walkTimeout: (seconds) => `Did not get there within ${seconds} seconds.`,
  walkWindowGone: 'Did not get there: the pet window disconnected.',
  walkWorldStopped: 'The World stopped; did not get there.',
  moveArrived: (name, at) => `Reached "${name}", at ${at} across the screen.`,
  moveStopped: (name, at) => `Stopped on the way to "${name}", at ${at} across the screen.`,
  moveGrabbed: (name, at, user) => `Did not reach "${name}": ${user} picked you up at ${at} across the screen.`,
  moveFailed: (name, at, by) => `Did not reach "${name}" (${by}); now at ${at} across the screen.`,
  moveTimeout: (name, seconds) => `Did not reach "${name}" within ${seconds} seconds.`,
  moveBadTarget: (got, targets) => `[pet_move_to not run] to must be a number from 0 to 1, left / center / right / cursor${targets.length ? `, or one of the current figure's targets ${targets.join(' / ')}` : ''}; got ${got}.`,
  moveNoTarget: '[pet_move_to not run] to is missing.',
  moveBadParams: (target, spec, got) => `[pet_move_to not run] ${target === null ? 'The default targets take no params' : spec.length ? `The params of ${target} are, in order, ${spec.join(', ')}; fewer may be given, none out of range` : `${target} takes no params`}; got ${got}.`,
  walkCannot: (name) => `[pet_move_to not run] The current figure (${name}) does not walk to the default targets.`,

  notConnected: (tool, detail, user) => `[${tool} not run] The pet window is not connected${detail ? ` (${detail})` : ''}; ${user} cannot see it.`,
  window: {
    badHostEnv: (env) => `${env} is not a JSON array of strings`,
    noElectronFile: (file) => `The Electron executable does not exist: ${file}`,
    noElectron: 'No Electron to run: install the window runtime on the pet panel, or set the Electron executable in the config',
    startFailed: (why) => `Failed to start: ${why}`,
    closed: 'The window was closed',
    exited: (code) => `The window process exited (exit code ${code})`,
  },

  sayEmpty: '[pet_say not run] The script is empty and there are no images. Do not call it when you have nothing to say.',
  sayReceipt: (r) => [
    r.waitSec > .5
      ? `Queued behind about ${Math.round(r.waitSec)} s of earlier lines; this one takes about ${Math.round(r.selfSec)} s.`
      : `Showing now; this one takes about ${Math.round(r.selfSec)} s.`,
    r.chatOpen ? 'The chat page is open and shows it too.' : '',
    r.images ? `The ${r.images} image${r.images > 1 ? 's' : ''} with it show only on the chat page.` : '',
    r.replaced !== null ? `Replaced the unanswered question "${r.replaced}".` : '',
  ].filter(Boolean).join(' ')
    + (r.dropped.length ? `\n[arguments] These markers are not in the current figure's vocabulary and were skipped: ${r.dropped.join(', ')}.` : ''),

  imagesShown: (n, chatOpen) => `${n} image${n > 1 ? 's' : ''} shown on the chat page${chatOpen ? '' : ', which is not open right now'}.`,
  shownImage: (i, total) => `[image ${i}/${total} shown on the chat page]`,
  imagesNotHandles: '[pet_say not run] images takes an array of attachment handles.',
  tooManyImages: (max) => `[pet_say not run] images takes at most ${max} handles.`,
  imageMissing: (handle) => `[pet_say not run] No attachment ${handle}. Put the handle that starts a [blob …] line in your context into images.`,
  imageNotImage: (handle, mime) => `[pet_say not run] ${handle} is ${mime}, not an image.`,

  askEmpty: '[pet_ask not run] question is empty.',
  askNoWay: '[pet_ask not run] No options and no own answer allowed, so there is no way to answer.',
  askReceipt: (r) => [
    'Asked.',
    r.replaced !== null ? `Replaced the previous unanswered question "${r.replaced}".` : '',
    r.cut ? 'Only the first 3 options are shown.' : '',
    r.chatOpen ? 'The chat page is open and shows the question too; it can be answered in either place.' : '',
    'The answer will arrive as an [answer] event.',
  ].filter(Boolean).join(' '),

  selfAdjustOff: (tool, user) => `[${tool} not run] ${user} set "Self-adjustment" to "Off" on the Habits page.`,
  setErrors: (errors) => `[pet_set not run] ${errors.join('; ')}.`,
  setNothing: 'Everything asked for is already so; nothing changed.',
  setDone: (says) => `Changed: ${says.join('; ')}.`,
  setAgreed: (user, says) => `${user} agreed; changed: ${says.join('; ')}.`,
  setAlways: (user, says, items) => `${user} agreed; changed: ${says.join('; ')}. ${user} also said there is no need to ask about ${items.join(', ')} again: change ${items.length > 1 ? 'them' : 'it'} directly from now on.`,
  setNotChanged: (why, user, says) =>
    `${why === 'unavailable' ? 'The pet window is not connected, so there was no way to ask' : why === 'timeout' ? `${user} did not answer` : `${user} said no`}; not changed: ${says.join('; ')}.`,

  quietBad: (max) => `[pet_quiet not run] minutes must be a number from 0 to ${max}.`,
  quietNone: 'Not keeping quiet right now.',
  quietEnded: 'Quiet ended; sound effects and walking are back as the settings have them.',
  quietUntil: (time, sound, roam) => `Quiet until ${time}: sound effects ${sound ? 'as usual' : 'off'}, walking ${roam}. The settings are unchanged and come back on their own then.`,

  actNone: (dropped) => `[pet_act not run] None of these are in the current figure's vocabulary${dropped.length ? ` (${dropped.join(', ')})` : ''}.`,
  actReceipt: (actions, lasting, dropped) => `Doing in order: ${actions.join(' → ')}.`
    + (lasting.length ? ` ${lasting.join(', ')} ${lasting.length > 1 ? 'are' : 'is'} held until the next action.` : '')
    + (dropped.length ? `\n[arguments] Not in the current figure's vocabulary, skipped: ${dropped.join(', ')}.` : ''),

  on: 'on',
  off: 'off',
  settingNames: {
    figure: 'figure', scheme: 'dress (scheme)', roam: 'walking (roam)', snoreSeconds: 'snoring time (snoreSeconds)', sound: 'sound effects (sound)',
    scale: 'size (scale)', bubbleSize: 'bubble size (bubbleSize)', fontSize: 'text size (fontSize)', theme: 'night or day look (theme)', hoverButtons: 'hover buttons (hoverButtons)', user: 'what you call them (user)',
  },
  selfTiers: (user, direct, asked) => (!asked.length ? 'Right now all of these take effect at once.'
    : !direct.length ? `Right now all of these are first asked of ${user} in a bubble.`
    : `Right now these take effect at once: ${direct.join(', ')}; these are first asked of ${user} in a bubble: ${asked.join(', ')}.`),
  selfNone: (user) => `${user} set "Self-adjustment" to "Off" on the Habits page, so right now you can change none of these, and \`pet_quiet\` does not work either.`,
  // the English template puts these right after a sentence, so they start with a space
  chatPage: (user) => ` The app's Chat page lists these bubbles in time order, with what ${user} said and the names of the tools you called between two lines; ${user} can also type and send images there (they arrive as \`[typed]\` events too, images after the text) and answer \`pet_ask\`. The \`images\` of \`pet_say\` show only on the Chat page, not in the bubble.`,
  cuaOff: (user, canOpen) => `## Computer use\n\nComputer use is off: you cannot see the screen or use the mouse and keyboard. When ${user} wants you to look at the screen or help operate the computer, you can suggest turning it on: the Computer use section of the Habits page in the settings window, which explains the risks before it turns on.` +
    (canOpen ? ` If ${user} agrees to turn it on, \`pet_cua_open_settings\` opens the settings window right there.` : ''),
  cuaSettingsOpened: (user) => `The settings window is open at Computer use, showing what it risks; once ${user} clicks to turn it on, the computer-use tools are yours from the next message.`,
  reply: (user, language) => ` Talk to ${user} in ${language}: bubbles, questions and options alike.`,
};

export type ModelText = typeof zh;

export const MODEL_TEXT: Record<ModelLanguage, ModelText> = { zh, en };
