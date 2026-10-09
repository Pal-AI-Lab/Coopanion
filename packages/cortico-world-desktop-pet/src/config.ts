/** Config section `worlds.desktop-pet`, its defaults and the console config groups. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { WorldSection } from 'cortico/world.ts';
import type { SegmentConfig } from './asr/segmenter.ts';
import { DEFAULT_HOTKEY } from './asr/hotkey.ts';
import { capFor, petText } from './i18n/index.ts';

export const DESKTOP_PET_ID = 'desktop-pet';

/** Longest name for the person, in characters as seen, for Chinese, Japanese and Korean (`capFor` doubles it elsewhere). */
export const USER_MAX = 20;

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

/**
 * The body and how it is dressed, as the pages' `normalizeSkin` (web/coo/coo.js) reads it; unknown values fall back
 * to defaults there. Coo's picks are its own fields (palette and the four slots, with their colour channels);
 * a figure pack's are `scheme` (src/packs.ts).
 */
export interface PetSkin {
  /** The figure pack on screen: coo (built in), whale (built in, web/whale) or an installed pack's id. */
  figure?: string;
  /** The pack's pick: a preset id, or its axes' options joined by `-`. */
  scheme?: string;
  palette: string;
  head: string;
  side: string;
  glasses: string;
  neck: string;
  colors: Record<string, { main: string; acc: string }>;
}

/** Kinds of the pet's sounds, the keys of `SOUND_KINDS` in web/sound.js; a pack's own sounds are filed under these too. */
export const SOUND_KINDS = ['move', 'touch', 'face', 'snore', 'talk', 'ui'] as const;
export type SoundKind = typeof SOUND_KINDS[number];
export type SoundSettings = Record<SoundKind, boolean> & {
  /** Snoring stops this many seconds into each sleep; the z's keep floating. 0 = snore the whole sleep. */
  snoreSeconds: number;
};

export type RoamMode = 'free' | 'calm' | 'off';
/** Which side of each palette the pet pages draw: dark = light figure for dark surroundings. */
export type PetTheme = 'dark' | 'light';
/** Which touches wake the bot: poke = clicks only, petting and carrying wait for the next wake; all; none = every touch waits. */
export type TouchWake = 'poke' | 'all' | 'none';
/** hold: listen while the talk key is held; toggle: each press starts or stops listening; always: listen all the time. */
export type MicMode = 'hold' | 'toggle' | 'always';
/** funasr: FunASR's SenseVoiceSmall in this process (one model download, every platform); system: the recognizer Windows ships (nothing to download, less accurate). */
export type AsrEngine = 'funasr' | 'system';

/** Languages SenseVoiceSmall hears, by the app language that speaks them; it also takes `yue` and `auto`. */
export const SENSEVOICE_LANGUAGES: Readonly<Record<string, string>> = { zh: 'zh', 'zh-Hant': 'zh', en: 'en', ja: 'ja', ko: 'ko' };

export interface DesktopPetConfigSection extends WorldSection {
  /** Local server for the pet page, the dressing page and the pet window's socket. */
  port: number;
  /** How events name the person at the computer; empty: the app language's default name (`defaultUser` in src/i18n). */
  user: string;
  window: {
    /** Open the pet window when the World starts. */
    enabled: boolean;
    /** Electron executable; empty uses CORTICO_DESKTOP_PET_HOST, then the managed runtime. */
    electronFile: string;
    /** Figure size on screen, 1 = 256 logo units drawn at 107 px. */
    scale: number;
    /** The pet page draws 60 frames a second at rest too; off, it drops to 30 while the body stands, sits or sleeps. */
    /** Frames a second while the body moves (and at rest with `lockFrameRate`); 0 follows the display. */
    frameRate: number;
    lockFrameRate: boolean;
    /** Hide the pet window while a fullscreen window covers the display it is on. */
    hideWhenFullscreen: boolean;
  };
  roam: RoamMode;
  /** All of the pet's sounds; `sounds` picks among them while this is on. */
  sound: boolean;
  sounds: SoundSettings;
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
  /** Double-clicking the pet opens the typing box. */
  doubleClickChat: boolean;
  /** Show the current activity above the pet, including file names. */
  statusBubble: boolean;
  /** The bot may change its own looks and habits (src/self.ts), and asks before the rest. */
  selfAdjust: boolean;
  skin: PetSkin;
  touch: {
    /** Clicks, petting and throws become events. */
    enabled: boolean;
    wakeOn: TouchWake;
  };
  asr: {
    enabled: boolean;
    /**
     * Empty: by the app language, FunASR for a language SenseVoice hears and the system recognizer
     * (where there is one) for the rest. Earlier versions wrote `auto` or `whisper` here; both now mean funasr.
     */
    engine: AsrEngine | '';
    /** A SenseVoice language code or `auto`; empty follows the app language. */
    language: string;
    /** CPU threads for one FunASR decode; 0 = two. */
    threads: number;
    /** Traditional characters heard become Simplified, while the app language is `zh`. */
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

/** The pet's size range on screen. */
export const SCALE_MIN = .5, SCALE_MAX = 10;

export const DESKTOP_PET_DEFAULTS: DesktopPetConfigSection = {
  enabled: false,
  port: 7797,
  user: '',
  window: { enabled: true, electronFile: '', scale: 1, frameRate: 60, lockFrameRate: false, hideWhenFullscreen: false },
  roam: 'calm',
  sound: true,
  sounds: { move: true, touch: true, face: true, snore: true, talk: true, ui: true, snoreSeconds: 0 },
  theme: 'dark',
  rememberPosition: false,
  petX: null,
  hoverButtons: 'chat,voice',
  doubleClickChat: false,
  statusBubble: true,
  selfAdjust: true,
  skin: {
    figure: 'coo', scheme: 'deepseek', palette: 'mint', head: 'none', side: 'none', glasses: 'none', neck: 'none',
    colors: { head: { main: 'body', acc: 'eye' }, side: { main: 'eye', acc: 'eye' }, glasses: { main: 'body', acc: 'eye' }, neck: { main: 'eye', acc: 'eye' } },
  },
  touch: { enabled: true, wakeOn: 'poke' },
  asr: {
    enabled: true,
    engine: '',
    language: '',
    threads: 0,
    simplified: true,
    timeoutMs: 20_000,
    segment: { thresholdDb: -42, minSpeechMs: 180, dispatchSilenceMs: 250, silenceMs: 600, maxUtteranceMs: 15_000, preRollMs: 320, minUtteranceMs: 350 },
    mic: { mode: 'hold', hotkey: DEFAULT_HOTKEY, deviceId: '' },
  },
};

const K = `worlds.${DESKTOP_PET_ID}`;

/** The console's config groups: the pet's own, its sounds and voice input, titled in `language` (the console's). */
export function desktopPetConfigGroups(language = 'zh'): ConfigGroup[] {
  const c = petText(language).config;
  const userMax = capFor(USER_MAX, language);
  const pet: ConfigGroup = {
    id: `world:${DESKTOP_PET_ID}`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.group,
      properties: {
        [`${K}.user`]: { type: 'string', title: c.user.title, description: c.user.description(userMax), 'x-hot': true },
        [`${K}.roam`]: { type: 'string', title: c.roam.title, enum: ['free', 'calm', 'off'], description: c.roam.description, 'x-hot': true },
        [`${K}.theme`]: { type: 'string', title: c.theme.title, enum: ['dark', 'light'], description: c.theme.description, 'x-hot': true },
        [`${K}.rememberPosition`]: { type: 'boolean', title: c.rememberPosition.title, description: c.rememberPosition.description, 'x-hot': true },
        [`${K}.hoverButtons`]: { type: 'string', title: c.hoverButtons.title, description: c.hoverButtons.description(MAX_HOVER_BUTTONS, PET_ACTIONS.join(', ')), 'x-hot': true },
        [`${K}.doubleClickChat`]: { type: 'boolean', title: c.doubleClickChat.title, description: c.doubleClickChat.description, 'x-hot': true },
        [`${K}.statusBubble`]: { type: 'boolean', title: c.statusBubble.title, description: c.statusBubble.description, 'x-hot': true },
        [`${K}.selfAdjust`]: { type: 'boolean', title: c.selfAdjust.title, description: c.selfAdjust.description, 'x-hot': true },
        [`${K}.window.enabled`]: { type: 'boolean', title: c.windowEnabled.title, 'x-hot': false },
        [`${K}.window.scale`]: { type: 'number', title: c.scale.title, minimum: SCALE_MIN, maximum: SCALE_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.frameRate`]: { type: 'integer', title: c.frameRate.title, minimum: 0, description: c.frameRate.description, 'x-hot': true },
        [`${K}.window.lockFrameRate`]: { type: 'boolean', title: c.lockFrameRate.title, description: c.lockFrameRate.description, 'x-hot': true },
        // only the window process on Windows can tell another program is full screen (host/electron-main.cjs `fullscreen`); unregistered, the 「习惯」 page hides it too
        ...(process.platform === 'win32' ? {
          [`${K}.window.hideWhenFullscreen`]: { type: 'boolean', title: c.hideWhenFullscreen.title, description: c.hideWhenFullscreen.description, 'x-hot': true },
        } : {}),
        [`${K}.window.electronFile`]: { type: 'string', title: c.electronFile.title, description: c.electronFile.description, 'x-path': { kind: 'file' }, 'x-hot': false },
        [`${K}.port`]: { type: 'integer', title: c.port.title, minimum: 1024, maximum: 65535, description: c.port.description, 'x-hot': false },
        [`${K}.touch.enabled`]: { type: 'boolean', title: c.touchEnabled.title, description: c.touchEnabled.description, 'x-hot': true },
        [`${K}.touch.wakeOn`]: { type: 'string', title: c.touchWakeOn.title, enum: ['poke', 'all', 'none'], description: c.touchWakeOn.description, 'x-hot': true },
      },
    },
  };
  const sound: ConfigGroup = {
    id: `world:${DESKTOP_PET_ID}:sound`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.soundGroup,
      properties: {
        [`${K}.sound`]: { type: 'boolean', title: c.sound.title, description: c.sound.description, 'x-hot': true },
        ...Object.fromEntries(SOUND_KINDS.map((kind) => [`${K}.sounds.${kind}`, {
          type: 'boolean' as const, title: c.sounds[kind].title, ...(c.sounds[kind].description ? { description: c.sounds[kind].description } : {}), 'x-hot': true,
        }])),
        [`${K}.sounds.snoreSeconds`]: { type: 'integer', title: c.snoreSeconds.title, minimum: 0, maximum: 3600, 'x-suffix': c.snoreSeconds.suffix, description: c.snoreSeconds.description, 'x-hot': true },
      },
    },
  };
  const asr: ConfigGroup = {
    id: `world:${DESKTOP_PET_ID}:asr`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.asrGroup,
      properties: {
        [`${K}.asr.enabled`]: { type: 'boolean', title: c.asrEnabled.title, 'x-hot': true },
        [`${K}.asr.engine`]: { type: 'string', title: c.asrEngine.title, enum: ['', 'funasr', 'system'], description: c.asrEngine.description, 'x-hot': true },
        [`${K}.asr.language`]: { type: 'string', title: c.asrLanguage.title, description: c.asrLanguage.description, 'x-hot': true },
        [`${K}.asr.threads`]: { type: 'integer', title: c.asrThreads.title, minimum: 0, maximum: 16, description: c.asrThreads.description, 'x-hot': true },
        [`${K}.asr.simplified`]: { type: 'boolean', title: c.asrSimplified.title, description: c.asrSimplified.description, 'x-hot': true },
        [`${K}.asr.segment.thresholdDb`]: { type: 'number', title: c.thresholdDb.title, minimum: -80, maximum: 0, 'x-suffix': 'dBFS', 'x-hot': true },
        [`${K}.asr.segment.silenceMs`]: { type: 'integer', title: c.silenceMs.title, minimum: 200, maximum: 5000, 'x-suffix': 'ms', 'x-hot': true },
        [`${K}.asr.segment.maxUtteranceMs`]: { type: 'integer', title: c.maxUtteranceMs.title, minimum: 2000, maximum: 60000, 'x-suffix': 'ms', 'x-hot': true },
      },
    },
  };
  return [pet, sound, asr];
}
