/** Config section `worlds.desktop-pet`, its defaults and the console config groups. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { WorldSection } from 'cortico/world.ts';
import type { SegmentConfig } from './asr/segmenter.ts';
import { DEFAULT_HOTKEY } from './asr/hotkey.ts';

export const DESKTOP_PET_ID = 'desktop-pet';

/** What the pet's menu offers, in its order; any of them can also show as a button beside the pet on hover. */
export const PET_ACTIONS = ['chat', 'voice', 'roam', 'theme', 'sound', 'dress', 'hide'] as const;
export type PetAction = typeof PET_ACTIONS[number];
/** Most hover buttons. */
export const MAX_HOVER_BUTTONS = 6;

/** The hover buttons a config value names: known actions, each once, at most MAX_HOVER_BUTTONS. */
export function hoverButtonList(value: string): PetAction[] {
  const out: PetAction[] = [];
  for (const id of value.split(',').map((s) => s.trim())) {
    if ((PET_ACTIONS as readonly string[]).includes(id) && !out.includes(id as PetAction)) out.push(id as PetAction);
  }
  return out.slice(0, MAX_HOVER_BUTTONS);
}

/** Accessory choice as the page's `normalizeSkin` reads it; unknown values fall back to defaults there. */
export interface PetSkin {
  /** coo: the built-in figure; whale: the DeepSeek whale maid (web/whale). */
  figure?: string;
  /** The whale's colour scheme id (web/whale/model.json). */
  scheme?: string;
  palette: string;
  head: string;
  side: string;
  glasses: string;
  neck: string;
  colors: Record<string, { main: string; acc: string }>;
}

export type RoamMode = 'free' | 'calm' | 'off';
/** Which side of each palette the pet pages draw: dark = light figure for dark surroundings. */
export type PetTheme = 'dark' | 'light';
/** Which touches wake the bot: poke = clicks only, petting and carrying wait for the next wake; all; none = every touch waits. */
export type TouchWake = 'poke' | 'all' | 'none';
/** hold: listen while the talk key is held; toggle: each press starts or stops listening; always: listen all the time. */
export type MicMode = 'hold' | 'toggle' | 'always';
/** funasr: FunASR's SenseVoiceSmall in this process (one model download, every platform); system: the recognizer Windows ships (nothing to download, less accurate). */
export type AsrEngine = 'funasr' | 'system';

export interface DesktopPetConfigSection extends WorldSection {
  /** Local server for the pet page, the dressing page and the pet window's socket. */
  port: number;
  /** How events name the person at the computer. */
  user: string;
  window: {
    /** Open the pet window when the World starts. */
    enabled: boolean;
    /** Electron executable; empty uses CORTICO_DESKTOP_PET_HOST, then the managed runtime. */
    electronFile: string;
    /** Figure size on screen, 1 = 256 logo units drawn at 107 px. */
    scale: number;
  };
  roam: RoamMode;
  sound: boolean;
  theme: PetTheme;
  /** Start each run where the pet stood when the World last stopped. */
  rememberPosition: boolean;
  /**
   * Where the pet stood when the World last stopped, as a share of the pet window's width (0..1), whichever
   * display the window was on; each start opens the window on the primary display. Written only on stop;
   * null when nothing is saved.
   */
  petX: number | null;
  /** Actions shown as buttons beside the pet on hover, ids from PET_ACTIONS joined by commas. */
  hoverButtons: string;
  skin: PetSkin;
  touch: {
    /** Clicks, petting and throws become events. */
    enabled: boolean;
    wakeOn: TouchWake;
  };
  asr: {
    enabled: boolean;
    /** Earlier versions wrote `auto` or `whisper` here; both now mean funasr. */
    engine: AsrEngine;
    language: string;
    /** CPU threads for one FunASR decode; 0 = two. */
    threads: number;
    simplified: boolean;
    timeoutMs: number;
    segment: SegmentConfig;
    mic: {
      mode: MicMode;
      /** Talk key for hold and toggle, names joined by `+` (see `src/asr/hotkey.ts`). */
      hotkey: string;
      /** Browser media device id of the microphone; empty uses the system default. */
      deviceId: string;
    };
  };
}

export const DESKTOP_PET_DEFAULTS: DesktopPetConfigSection = {
  enabled: false,
  port: 7797,
  user: '伙伴',
  window: { enabled: true, electronFile: '', scale: 1 },
  roam: 'calm',
  sound: true,
  theme: 'dark',
  rememberPosition: false,
  petX: null,
  hoverButtons: 'chat,voice',
  skin: {
    figure: 'coo', scheme: 'deepseek', palette: 'mint', head: 'none', side: 'none', glasses: 'none', neck: 'none',
    colors: { head: { main: 'body', acc: 'eye' }, side: { main: 'eye', acc: 'eye' }, glasses: { main: 'body', acc: 'eye' }, neck: { main: 'eye', acc: 'eye' } },
  },
  touch: { enabled: true, wakeOn: 'poke' },
  asr: {
    enabled: true,
    engine: 'funasr',
    language: 'zh',
    threads: 0,
    simplified: true,
    timeoutMs: 20_000,
    segment: { thresholdDb: -42, minSpeechMs: 180, dispatchSilenceMs: 250, silenceMs: 600, maxUtteranceMs: 15_000, preRollMs: 320, minUtteranceMs: 350 },
    mic: { mode: 'hold', hotkey: DEFAULT_HOTKEY, deviceId: '' },
  },
};

const K = `worlds.${DESKTOP_PET_ID}`;

export const DESKTOP_PET_CONFIG_GROUP: ConfigGroup = {
  id: `world:${DESKTOP_PET_ID}`,
  owner: `world:${DESKTOP_PET_ID}`,
  schema: {
    type: 'object',
    title: '桌宠',
    properties: {
      [`${K}.user`]: { type: 'string', title: '怎么称呼你', description: '语音、打字和互动事件里用这个名字指代你。', 'x-hot': true },
      [`${K}.roam`]: { type: 'string', title: '行为模式', enum: ['free', 'calm', 'off'], description: 'free 常走动;calm 多待着;off 只做被要求的动作。', 'x-hot': true },
      [`${K}.sound`]: { type: 'boolean', title: '音效', 'x-hot': true },
      [`${K}.theme`]: { type: 'string', title: '黑白模式', enum: ['dark', 'light'], description: 'dark 夜间:浅色身体、深色气泡;light 白天:深色身体、浅色气泡。', 'x-hot': true },
      [`${K}.rememberPosition`]: { type: 'boolean', title: '记住位置', description: '退出时记下桌宠的横向位置,下次启动落回那里;有多块屏幕时总在主屏上启动。', 'x-hot': true },
      [`${K}.hoverButtons`]: { type: 'string', title: '悬停按钮', description: `鼠标停在桌宠身上时旁边出现的按钮,最多 ${MAX_HOVER_BUTTONS} 个,逗号分隔:${PET_ACTIONS.join(', ')}。`, 'x-hot': true },
      [`${K}.window.enabled`]: { type: 'boolean', title: '启动时打开桌宠窗口', 'x-hot': false },
      [`${K}.window.scale`]: { type: 'number', title: '大小', minimum: .5, maximum: 2, multipleOf: .05, 'x-hot': true },
      [`${K}.window.electronFile`]: { type: 'string', title: 'Electron 程序', description: '留空时依次用 CORTICO_DESKTOP_PET_HOST 和面板里安装的运行时。', 'x-path': { kind: 'file' }, 'x-hot': false },
      [`${K}.port`]: { type: 'integer', title: '页面端口', minimum: 1024, maximum: 65535, description: '被占用时向上顺延。', 'x-hot': false },
      [`${K}.touch.enabled`]: { type: 'boolean', title: '互动发成事件', description: '戳、摸、拎起来甩出去。', 'x-hot': true },
      [`${K}.touch.wakeOn`]: { type: 'string', title: '哪些互动单独唤醒', enum: ['poke', 'all', 'none'], description: 'poke 只有点一下唤醒,摸头和拎起来跟着下一次唤醒一起送;all 都唤醒;none 都跟着下一次唤醒送。一次互动唤醒之后、这一轮结束之前的互动,都跟着下一次唤醒送。', 'x-hot': true },
    },
  },
};

export const DESKTOP_PET_ASR_CONFIG_GROUP: ConfigGroup = {
  id: `world:${DESKTOP_PET_ID}:asr`,
  owner: `world:${DESKTOP_PET_ID}`,
  schema: {
    type: 'object',
    title: '语音输入',
    properties: {
      [`${K}.asr.enabled`]: { type: 'boolean', title: '语音输入总开关', 'x-hot': true },
      [`${K}.asr.engine`]: { type: 'string', title: '识别引擎', enum: ['funasr', 'system'], description: 'funasr 用 FunASR 的 SenseVoiceSmall,在本机识别,中文准,首次要下载约 240 MB 的模型;system 用 Windows 自带的语音识别,不用下载,准确度低一些(只在 Windows 上有)。', 'x-hot': true },
      [`${K}.asr.language`]: { type: 'string', title: '语言', description: 'zh、en、ja、ko、yue,或 auto 让模型自己判断。', 'x-hot': true },
      [`${K}.asr.threads`]: { type: 'integer', title: 'CPU 线程', minimum: 0, maximum: 16, description: 'FunASR 一次识别用几个线程,0 = 2。', 'x-hot': true },
      [`${K}.asr.simplified`]: { type: 'boolean', title: '转成简体', 'x-hot': true },
      [`${K}.asr.segment.thresholdDb`]: { type: 'number', title: '说话门槛', minimum: -80, maximum: 0, 'x-suffix': 'dBFS', 'x-hot': true },
      [`${K}.asr.segment.silenceMs`]: { type: 'integer', title: '一句结束的静音', minimum: 200, maximum: 5000, 'x-suffix': 'ms', 'x-hot': true },
      [`${K}.asr.segment.maxUtteranceMs`]: { type: 'integer', title: '一句最长', minimum: 2000, maximum: 60000, 'x-suffix': 'ms', 'x-hot': true },
    },
  },
};
