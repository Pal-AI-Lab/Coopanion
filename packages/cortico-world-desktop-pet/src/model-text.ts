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
  typed: (user: string, text: string) => `[打字] ${user}:${text}`,
  heard: (user: string, text: string) => `[语音] ${user}:${text}`,
  image: (user: string, i: number, total: number) => `[${user}发来的图片 ${i}/${total}]`,

  answerClosed: (user: string, question: string) => `[回答] ${user}关掉了提问「${question}」,没有作答。`,
  answerPicked: (user: string, question: string, n: number, option: string) => `[回答] ${user}回答「${question}」:选了第 ${n} 项「${option}」`,
  answerWrote: (user: string, question: string, text: string) => `[回答] ${user}回答「${question}」:自己写了:「${text}」`,

  touch: (text: string) => `[互动] ${text}`,
  pokedAwake: (user: string) => `${user}把睡着的你戳醒了`,
  poked: (user: string, n: number) => (n > 1 ? `${user}戳了你 ${n} 下` : `${user}戳了你一下`),
  pettedAsleep: (user: string) => `${user}摸了摸睡着的你`,
  petted: (user: string, n: number) => (n > 1 ? `${user}摸了你好几下` : `${user}摸了摸你的头`),
  thrown: (user: string, crashed: boolean) => `${user}把你拎起来甩了出去${crashed ? ',你重重落地,摔晕了一会儿' : ''}`,
  /** `at`: how far across the screen, null when the page did not say. */
  dropped: (user: string, at: string | null, crashed: boolean) => `${user}把你拎起来,放到了屏幕横向 ${at ?? '某'} 处${crashed ? ',你摔晕了一会儿' : ''}`,
  crashed: '你重重落地,摔晕了一会儿',

  figureFailed: (name: string, reason: string, body: string, note: string) => `[形象] ${name}没能显示出来(${reason}),你现在是${body}。${note ? `\n${note}` : ''}`,
  reasonUnknown: '原因不明',
  figureNow: (body: string) => `[形象] 你现在的样子:${body}。`,
  figureNote: (note: string) => `[形象] ${note}`,
  lookNow: (body: string) => `你现在的样子:${body}。`,
  /** The body as the prompt and the figure events describe it: name, looks, picked options. */
  body: (name: string, about: string, picks: string[]) => `${name},${about}${picks.length ? `(${picks.join(',')})` : ''}`,
  pick: (axis: string, option: string) => `${axis}:${option}`,

  walkArrived: (at: string) => `走到了屏幕横向 ${at} 处。`,
  walkStopped: (at: string) => `走到屏幕横向 ${at} 处停下了。`,
  walkGrabbed: (at: string, user: string) => `没走到:走到 ${at} 处时被${user}拎起来了。`,
  walkReplaced: (at: string, by: string) => `没走到:走到 ${at} 处时换成了别的动作(${by})。`,
  walkTimeout: (seconds: number) => `${seconds} 秒内没有走到。`,
  walkWindowGone: '没走到:桌宠窗口断开了。',
  walkWorldStopped: 'World 已停止,没走到。',
  walkBadTarget: (got: string) => `[pet_walk_to 没执行] to 应为 0–1 的数字或 left / center / right / cursor,收到 ${got}。`,
  walkNoTarget: '[pet_walk_to 没执行] 缺少 to。',
  walkCannot: (name: string) => `[pet_walk_to 没执行] 现在的形象(${name})不会走动。`,

  /** `detail`: the window host's own words on why, when it has them. */
  notConnected: (tool: string, detail: string | null, user: string) => `[${tool} 没执行] 桌宠窗口没有连接${detail ? `(${detail})` : ''},${user}看不到。`,

  sayEmpty: '[pet_say 没执行] 脚本是空的。不想说话就不调用。',
  sayReceipt: (r: SayReceipt) => `${r.waitSec > .5 ? `已排队,前面还有约 ${Math.round(r.waitSec)} 秒` : '已开始显示'},这段约 ${Math.round(r.selfSec)} 秒。`
    + (r.chatOpen ? '对话页开着,这段也显示在那里。' : '')
    + (r.replaced !== null ? `替换了还没回答的提问「${r.replaced}」。` : '')
    + (r.dropped.length ? `\n[执行参数] 当前形象的词表里没有这些标记,已略过:${r.dropped.join('、')}。` : ''),

  askEmpty: '[pet_ask 没执行] question 是空的。',
  askNoWay: '[pet_ask 没执行] 没有选项,又不允许自己写,没法作答。',
  askReceipt: (r: AskReceipt) => '已问出。'
    + (r.replaced !== null ? `替换了还没回答的上一个提问「${r.replaced}」。` : '')
    + (r.cut ? '只显示了前 3 个选项。' : '')
    + (r.chatOpen ? '对话页开着,问题也显示在那里,两边都能回答。' : '')
    + '回答到了会以 [回答] 事件送达。',

  selfAdjustOff: (tool: string, user: string) => `[${tool} 没执行] ${user}在「习惯」页关掉了「允许自己调整」。`,
  setErrors: (errors: string[]) => `[pet_set 没执行] ${errors.join(';')}。`,
  setNothing: '要改的都和现在一样,没有改动。',
  setDone: (says: string[]) => `已改:${says.join(';')}。`,
  setQuestion: (says: string[]) => `我想${says.join('、')},可以吗?`,
  setChoices: ['可以', '不用了'] as [yes: string, no: string],
  setAgreed: (user: string, says: string[]) => `${user}同意了,已改:${says.join(';')}。`,
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
  /** `{{pet.chat}}`, when the app has a chat page. */
  chatPage: (_user: string) => '应用的「对话」页按时间列出这些气泡、对方的话,以及你两句话之间调用过的工具名;对方也能在那里打字、发图片(同样是 `[打字]` 事件,图片接在正文后),回答 `pet_ask`。',
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

  walkArrived: (at) => `Arrived at ${at} across the screen.`,
  walkStopped: (at) => `Stopped at ${at} across the screen.`,
  walkGrabbed: (at, user) => `Did not get there: ${user} picked you up at ${at} across the screen.`,
  walkReplaced: (at, by) => `Did not get there: at ${at} across the screen another action took over (${by}).`,
  walkTimeout: (seconds) => `Did not get there within ${seconds} seconds.`,
  walkWindowGone: 'Did not get there: the pet window disconnected.',
  walkWorldStopped: 'The World stopped; did not get there.',
  walkBadTarget: (got) => `[pet_walk_to not run] to must be a number from 0 to 1 or left / center / right / cursor; got ${got}.`,
  walkNoTarget: '[pet_walk_to not run] to is missing.',
  walkCannot: (name) => `[pet_walk_to not run] The current figure (${name}) does not walk.`,

  notConnected: (tool, detail, user) => `[${tool} not run] The pet window is not connected${detail ? ` (${detail})` : ''}; ${user} cannot see it.`,

  sayEmpty: '[pet_say not run] The script is empty. Do not call it when you have nothing to say.',
  sayReceipt: (r) => [
    r.waitSec > .5
      ? `Queued behind about ${Math.round(r.waitSec)} s of earlier lines; this one takes about ${Math.round(r.selfSec)} s.`
      : `Showing now; this one takes about ${Math.round(r.selfSec)} s.`,
    r.chatOpen ? 'The chat page is open and shows it too.' : '',
    r.replaced !== null ? `Replaced the unanswered question "${r.replaced}".` : '',
  ].filter(Boolean).join(' ')
    + (r.dropped.length ? `\n[arguments] These markers are not in the current figure's vocabulary and were skipped: ${r.dropped.join(', ')}.` : ''),

  askEmpty: '[pet_ask not run] question is empty.',
  askNoWay: '[pet_ask not run] No options and no own answer allowed, so there is no way to answer.',
  askReceipt: (r) => [
    'Asked.',
    r.replaced !== null ? `Replaced the previous unanswered question "${r.replaced}".` : '',
    r.cut ? 'Only the first 3 options are shown.' : '',
    r.chatOpen ? 'The chat page is open and shows the question too; it can be answered in either place.' : '',
    'The answer will arrive as an [answer] event.',
  ].filter(Boolean).join(' '),

  selfAdjustOff: (tool, user) => `[${tool} not run] ${user} turned off "Let Coo adjust itself" on the Habits page.`,
  setErrors: (errors) => `[pet_set not run] ${errors.join('; ')}.`,
  setNothing: 'Everything asked for is already so; nothing changed.',
  setDone: (says) => `Changed: ${says.join('; ')}.`,
  setQuestion: (says) => `I'd like to make these changes: ${says.join('; ')}. Is that OK?`,
  setChoices: ['OK', 'No thanks'],
  setAgreed: (user, says) => `${user} agreed; changed: ${says.join('; ')}.`,
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
  // the English template puts these right after a sentence, so they start with a space
  chatPage: (user) => ` The app's Chat page lists these bubbles in time order, with what ${user} said and the names of the tools you called between two lines; ${user} can also type and send images there (they arrive as \`[typed]\` events too, images after the text) and answer \`pet_ask\`.`,
  reply: (user, language) => ` Talk to ${user} in ${language}: bubbles, questions and options alike.`,
};

export type ModelText = typeof zh;

export const MODEL_TEXT: Record<ModelLanguage, ModelText> = { zh, en };
