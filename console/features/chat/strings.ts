import { pick } from '../../base/language.ts';
import type { Touch } from './index.ts';
import { S as zhHant, STEP as zhHantStep } from './strings.zh-Hant.ts';
import { S as ja, STEP as jaStep } from './strings.ja.ts';
import { S as ko, STEP as koStep } from './strings.ko.ts';
import { S as fr, STEP as frStep } from './strings.fr.ts';
import { S as de, STEP as deStep } from './strings.de.ts';
import { S as es419, STEP as es419Step } from './strings.es-419.ts';
import { S as ptBR, STEP as ptBRStep } from './strings.pt-BR.ts';
import { S as it, STEP as itStep } from './strings.it.ts';
import { S as ru, STEP as ruStep } from './strings.ru.ts';

const zh = {
  nav: '对话',
  title: '对话',
  trace: '控制台',
  traceHint: '高级模式的「控制台」页：上下文、工具调用与原始事件',
  placeholder: (bot: string) => `给 ${bot} 发消息…`,
  connecting: '正在连接…',
  empty: (bot: string) => `还没有和 ${bot} 说过话。`,
  older: '更早的对话',
  voice: '语音',
  idle: '空闲',
  thinking: (bot: string) => `${bot} 正在思考…`,
  doing: (what: string) => `正在${what}`,
  retry: (at: string) => `模型没有应答，${at} 重试`,
  handoff: '正在整理之前的对话',
  contextUsed: (used: string, limit: string) => `约 ${used} / ${limit} token`,
  contextTokens: (used: string) => `约 ${used} token`,
  contextLimit: (limit: string) => `达到 ${limit} 时整理之前的对话`,
  contextLast: (when: string) => `上次整理：${when}`,
  paused: '已暂停 · 消息在继续后送达',
  queued: (bot: string) => `排队中，${bot} 完成当前步骤后查看`,
  queuedPaused: '已暂停，继续后送达',
  sendNow: '立即发送',
  sendNowHint: (bot: string) => `中断 ${bot} 当前的操作，立即送达`,
  withdraw: '撤回',
  withdrawHint: '撤回到输入框',
  discarded: '未送达：排队的消息已被清空',
  imageCount: (n: number) => `[${n} 张图]`,
  ownAnswer: '自行回答…',
  send: '发送',
  computer: '操作电脑',
  steps: (n: number) => `${n} 步`,
  things: (n: number) => `完成了 ${n} 项操作`,
  seconds: (s: number) => `${s} 秒`,
  imagesUnseen: (bot: string) => `现在的模型看不到图片，${bot} 只会知道你发了几张图。`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `，${b} 摔晕了一会儿` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `你把睡着的 ${b} 戳醒了` : t.count > 1 ? `你戳了 ${b} ${t.count} 下` : `你戳了 ${b} 一下`;
      case 'pet': return t.count > 1 ? `你摸了 ${b} 好几下` : `你摸了摸 ${b}`;
      case 'throw': return `你把 ${b} 拎起来甩了出去${out}`;
      case 'drop': return `你把 ${b} 拎起来换了个地方${out}`;
      default: return `${b} 重重落地，摔晕了一会儿`;
    }
  },
  /** A figure switch (`figure`), a dress switch (`dress`), or a figure that did not load. */
  figure: (kind: string, name: string, b: string): string => (kind === 'figure' ? `你将 ${b} 更换为「${name}」` : kind === 'dress' ? `你为 ${b} 更换了装扮` : `「${name}」显示失败，已切换为 Coo`),
};

export const en: typeof zh = {
  nav: 'Chat',
  title: 'Chat',
  trace: 'Console',
  traceHint: 'The Console page of advanced mode: context, tool calls and raw events',
  placeholder: (bot: string) => `Message ${bot}…`,
  connecting: 'Connecting…',
  empty: (bot: string) => `Nothing said to ${bot} yet.`,
  older: 'Earlier',
  voice: 'Voice',
  idle: 'Idle',
  thinking: (bot: string) => `${bot} is thinking…`,
  doing: (what: string) => `Busy: ${what}`,
  retry: (at: string) => `The model did not answer; retrying at ${at}`,
  handoff: 'Tidying up the earlier conversation',
  contextUsed: (used: string, limit: string) => `About ${used} / ${limit} tokens`,
  contextTokens: (used: string) => `About ${used} tokens`,
  contextLimit: (limit: string) => `The earlier conversation is tidied up at ${limit}`,
  contextLast: (when: string) => `Last tidied up: ${when}`,
  paused: 'Paused · messages arrive once resumed',
  queued: (bot: string) => `Queued; ${bot} reads it after this step`,
  queuedPaused: 'Paused; delivered once resumed',
  sendNow: 'Send now',
  sendNowHint: (bot: string) => `Stop what ${bot} is doing and deliver it now`,
  withdraw: 'Take back',
  withdrawHint: 'Move back to the input box',
  discarded: 'Not delivered: the queue was cleared',
  imageCount: (n: number) => `[${n} image${n === 1 ? '' : 's'}]`,
  ownAnswer: 'Your own answer…',
  send: 'Send',
  computer: 'Using the computer',
  steps: (n: number) => `${n} step${n === 1 ? '' : 's'}`,
  things: (n: number) => `${n} step${n === 1 ? '' : 's'} done`,
  seconds: (s: number) => `${s} s`,
  imagesUnseen: (bot: string) => `The current model cannot see images; ${bot} only learns how many you sent.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, and ${b} was knocked out for a bit` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `You poked ${b} awake` : t.count > 1 ? `You poked ${b} ${t.count} times` : `You poked ${b}`;
      case 'pet': return t.count > 1 ? `You patted ${b} a few times` : `You patted ${b}`;
      case 'throw': return `You picked up and tossed ${b}${out}`;
      case 'drop': return `You carried ${b} somewhere else${out}`;
      default: return `${b} hit the ground hard and was knocked out for a bit`;
    }
  },
  figure: (kind: string, name: string, b: string): string => (kind === 'figure' ? `You changed ${b} to ${name}` : kind === 'dress' ? `You changed ${b}'s outfit` : `${name} failed to show; switched to Coo`),
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});

const stepZh = {
  pet_cua_screenshot: '截屏', pet_cua_click: '点击', pet_cua_move: '移动鼠标', pet_cua_drag: '拖动', pet_cua_scroll: '滚动', pet_cua_type: '打字',
  pet_cua_key: '按键', pet_cua_windows: '查看窗口', pet_cua_focus: '切换窗口', pet_cua_wait: '等待',
  pet_move_to: '走动', pet_act: '做动作', pet_set: '调整设置', pet_quiet: '安静一会儿',
};

export const stepEn: typeof stepZh = {
  pet_cua_screenshot: 'Screenshot', pet_cua_click: 'Click', pet_cua_move: 'Move the mouse', pet_cua_drag: 'Drag', pet_cua_scroll: 'Scroll', pet_cua_type: 'Type',
  pet_cua_key: 'Press keys', pet_cua_windows: 'List windows', pet_cua_focus: 'Switch window', pet_cua_wait: 'Wait',
  pet_move_to: 'Walk', pet_act: 'Move about', pet_set: 'Adjust settings', pet_quiet: 'Keep quiet',
};

/** What the person reads for a tool's name. Tools not named here (the Persona's notes and turn control, other Worlds') stay on the Console page of the advanced mode. */
export const STEP: Readonly<Record<string, string>> = pick({
  zh: stepZh, en: stepEn, 'zh-Hant': zhHantStep, ja: jaStep, ko: koStep, fr: frStep, de: deStep, 'es-419': es419Step, 'pt-BR': ptBRStep, it: itStep, ru: ruStep,
});
