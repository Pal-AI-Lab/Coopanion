/** Config section `worlds.desktop-pet`, its defaults and the console config groups. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { Language } from 'cortico/core/language.ts';
import type { WorldSection } from 'cortico/world.ts';
import type { SegmentConfig } from './asr/segmenter.ts';
import { DEFAULT_HOTKEY, DEFAULT_TYPE_KEY } from './asr/hotkey.ts';
import { capFor, petText } from './i18n/index.ts';
import { CUA_DEFAULTS, cuaConfigGroup, type CuaConfig } from './cua/config.ts';

export const DESKTOP_PET_ID = 'desktop-pet';

/** Longest name for the person, in characters as seen, for Chinese, Japanese and Korean (`capFor` doubles it elsewhere). */
export const USER_MAX = 20;

/** What the pet's menu offers, in its order, all but `roam`; any of them can also show as a button beside the pet on hover. */
export const PET_ACTIONS = ['chat', 'voice', 'roam', 'theme', 'sound', 'hide', 'dress'] as const;
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

/** A step of the speech's pitch or speed; `custom` takes the number saved beside it. */
export const SPEECH_LEVELS = ['low', 'mid', 'high', 'custom'] as const;
export type SpeechLevel = typeof SPEECH_LEVELS[number];
/** The pitch of each step in Hz, and the range of a custom one: the bank is recorded near the middle step. */
export const SPEECH_PITCH_HZ = { low: 300, mid: 400, high: 500 } as const;
export const SPEECH_PITCH_MIN = 200, SPEECH_PITCH_MAX = 700;
/** Most syllables a second at each step, and the range of a custom speed. */
export const SPEECH_RATE = { low: 10, mid: 13, high: 16 } as const;
export const SPEECH_RATE_MIN = 6, SPEECH_RATE_MAX = 20;
export interface SpeechSettings {
  /** Bubbles are read out syllable by syllable in place of the babble. */
  enabled: boolean;
  pitch: SpeechLevel;
  pitchHz: number;
  speed: SpeechLevel;
  unitsPerSecond: number;
}

/** What the pet page plays: a step's own number, or the saved one (within range) for `custom`. */
export function speechFor(s: SpeechSettings): { enabled: boolean; pitchHz: number; unitsPerSecond: number } {
  const step = <T extends Record<'low' | 'mid' | 'high', number>>(table: T, level: SpeechLevel, own: number, min: number, max: number) =>
    level === 'custom' ? (Number.isFinite(own) ? Math.min(max, Math.max(min, own)) : table.mid) : table[level] ?? table.mid;
  return {
    enabled: s.enabled === true,
    pitchHz: step(SPEECH_PITCH_HZ, s.pitch, s.pitchHz, SPEECH_PITCH_MIN, SPEECH_PITCH_MAX),
    unitsPerSecond: step(SPEECH_RATE, s.speed, s.unitsPerSecond, SPEECH_RATE_MIN, SPEECH_RATE_MAX),
  };
}

export type RoamMode = 'free' | 'calm' | 'off';
/** Which side of each palette the pet pages draw: dark = light figure for dark surroundings. */
export type PetTheme = 'dark' | 'light';
/**
 * Which touches wake the bot: poke = clicks only, petting and carrying wait for the next wake; all; none = every touch
 * waits; custom = the kinds in `touch.wakeKinds`.
 */
export type TouchWake = 'poke' | 'all' | 'none' | 'custom';
/** Touches `touch.wakeKinds` can pick, as the pet page names them; a crash counts as the throw or drop it ended. */
export const TOUCH_KINDS = ['poke', 'pet', 'throw', 'drop'] as const;
export type TouchKind = typeof TOUCH_KINDS[number];

/** Whether a touch of `kind` wakes the bot by itself under these settings. */
export function touchWakes(touch: { wakeOn: TouchWake; wakeKinds?: readonly string[] }, kind: string): boolean {
  if (touch.wakeOn === 'all') return true;
  if (touch.wakeOn === 'poke') return kind === 'poke';
  return touch.wakeOn === 'custom' && Array.isArray(touch.wakeKinds) && touch.wakeKinds.includes(kind);
}

/**
 * What `pet_set` and `pet_quiet` may do: off = nothing; default = the items of SELF_DEFAULT that are true at once, the
 * rest once the person agrees; any = every item at once; custom = per item, as `selfAdjustCustom` says.
 */
export type SelfAdjust = 'off' | 'default' | 'any' | 'custom';
export const SELF_ADJUST: readonly SelfAdjust[] = ['off', 'default', 'any', 'custom'];
/** The settings `pet_set` takes, in its order. */
export const SELF_KEYS = ['figure', 'scheme', 'roam', 'snoreSeconds', 'sound', 'scale', 'bubbleSize', 'fontSize', 'theme', 'hoverButtons', 'user'] as const;
export type SelfKey = typeof SELF_KEYS[number];
/** Per item, whether the bot changes it at once (true) or asks first (false), under `default`. */
export const SELF_DEFAULT: Readonly<Record<SelfKey, boolean>> = {
  figure: true, scheme: true, roam: true, snoreSeconds: true, sound: false, scale: false, bubbleSize: false, fontSize: false, theme: false, hoverButtons: false, user: false,
};

/** `selfAdjust` as it reads: versions up to 0.1.20 wrote true (now `default`) or false (now `off`). */
export function selfAdjustMode(value: unknown): SelfAdjust {
  if (value === false) return 'off';
  return SELF_ADJUST.includes(value as SelfAdjust) ? value as SelfAdjust : 'default';
}

/** Per item, whether the bot may change it at once under these settings; all false when it may change nothing. */
export function directSettings(cfg: { selfAdjust: unknown; selfAdjustCustom?: Partial<Record<SelfKey, unknown>> }): Record<SelfKey, boolean> {
  const mode = selfAdjustMode(cfg.selfAdjust);
  return Object.fromEntries(SELF_KEYS.map((k) => [k,
    mode === 'any' || (mode === 'default' && SELF_DEFAULT[k])
    || (mode === 'custom' && (typeof cfg.selfAdjustCustom?.[k] === 'boolean' ? cfg.selfAdjustCustom[k] === true : SELF_DEFAULT[k]))])) as Record<SelfKey, boolean>;
}
/** hold: listen while the talk key is held; toggle: each press starts or stops listening; always: listen all the time. */
export type MicMode = 'hold' | 'toggle' | 'always';
/**
 * funasr: FunASR's SenseVoiceSmall; whisper: OpenAI's Whisper small (both in this process, one model
 * download each, every platform); system: the recognizer Windows ships (nothing to download, less accurate);
 * api: an OpenAI-compatible transcription service at `asr.api` (src/asr/transcription-api.ts).
 */
export type AsrEngine = 'funasr' | 'whisper' | 'system' | 'api';

/** The deployment secrets this World reads, by what they are for. */
export const DESKTOP_PET_SECRETS = { asrApiKey: 'DESKTOP_PET_ASR_API_KEY' } as const;

/** Languages SenseVoiceSmall hears, by the app language that speaks them; it also takes `yue` and `auto`. */
export const SENSEVOICE_LANGUAGES: Readonly<Record<string, string>> = { zh: 'zh', 'zh-Hant': 'zh', en: 'en', ja: 'ja', ko: 'ko' };

/**
 * The engine for an `asr.engine` setting and an app language. Empty, or a value this version does
 * not take, the app language picks: FunASR for a language SenseVoice hears, Whisper for the rest.
 * `system` holds only where Windows' recognizer exists (`systemSupported`).
 */
export function asrEngineFor(setting: string, language: string, systemSupported: boolean): AsrEngine {
  const byLanguage: AsrEngine = language in SENSEVOICE_LANGUAGES ? 'funasr' : 'whisper';
  if (setting === 'funasr' || setting === 'whisper' || setting === 'api') return setting;
  return setting === 'system' && systemSupported ? 'system' : byLanguage;
}

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
    /** The bubbles' frame (widths, padding, corners, tail, distance from the head), 1 = as drawn by pet.css; the text keeps its size. */
    bubbleSize: number;
    /** The text in the bubbles and the icons on its line, 1 = as drawn by pet.css; the bubbles keep their widths. */
    fontSize: number;
    /** How fast the bot's bubbles type and how long they stay, as a multiplier: typing runs at 20 × this characters a second and every hold is divided by it. */
    bubbleSpeed: number;
    /** How far the light halo reaches out from the body, in pixels (its outer blur); 0 turns it off. */
    glow: number;
    /** The pet page draws 60 frames a second at rest too; off, it drops to 30 while the body stands, sits or sleeps. */
    /** Frames a second while the body moves (and at rest with `lockFrameRate`); 0 follows the display. */
    frameRate: number;
    lockFrameRate: boolean;
    /** Hide the pet window while a fullscreen window covers the display it is on. */
    hideWhenFullscreen: boolean;
    /** Serve `/overlay`, the pet window's picture for an OBS browser source. */
    exportOverlay: boolean;
  };
  roam: RoamMode;
  /** All of the pet's sounds; `sounds` picks among them while this is on. */
  sound: boolean;
  sounds: SoundSettings;
  speech: SpeechSettings;
  theme: PetTheme;
  /** Start each run where the pet stood when the World last stopped. */
  rememberPosition: boolean;
  /**
   * Where the pet stood when the World last stopped, as a share of the pet window's width (0..1), whichever
   * display the window was on; each start opens the window on the primary display. Written only on stop;
   * null when nothing is saved.
   */
  petX: number | null;
  /** How far down the pet stood, as a share of the window height (0..1), saved with petX; null for a body on the floor. */
  petY: number | null;
  /** Actions shown as buttons beside the pet on hover, ids from PET_ACTIONS joined by commas. */
  hoverButtons: string;
  /** Double-clicking the pet opens the typing box. */
  doubleClickChat: boolean;
  /** A hotkey, written as the talk key is (`src/asr/hotkey.ts`), that opens the typing box from any window while `enabled`. */
  typeKey: { enabled: boolean; hotkey: string };
  /** Show the current activity above the pet, including file names. */
  statusBubble: boolean;
  /** Keep what the person typed, said or sent from the chat page above the pet until it replies. */
  saidBubbles: boolean;
  /** How far the bot may change its own looks and habits (src/self.ts); read through `selfAdjustMode`. */
  selfAdjust: SelfAdjust;
  /** Under `custom`: per item, true = changed at once, false = asked first. */
  selfAdjustCustom: Record<SelfKey, boolean>;
  skin: PetSkin;
  /** Computer use (src/cua/). */
  cua: CuaConfig;
  touch: {
    /** Clicks, petting and throws become events. */
    enabled: boolean;
    wakeOn: TouchWake;
    /** Under `custom`: the touches that wake the bot. */
    wakeKinds: TouchKind[];
  };
  asr: {
    enabled: boolean;
    /** Empty: by the app language (`asrEngineFor`). Earlier versions wrote `auto` here, which reads as empty. */
    engine: AsrEngine | '';
    /** An ISO 639-1 code or `auto`; empty follows the app language. FunASR and Whisper read a code they do not take as `auto`. */
    language: string;
    /** CPU threads for one FunASR or Whisper decode; 0 = two. */
    threads: number;
    /** Traditional characters heard become Simplified, while the app language is `zh`. */
    simplified: boolean;
    /** How long Windows' recognizer and the transcription service get for one sentence. */
    timeoutMs: number;
    /** Engine `api`: requests go to `baseUrl` + `/audio/transcriptions`; the API Key is the secret `DESKTOP_PET_SECRETS.asrApiKey`. */
    api: { baseUrl: string; model: string };
    segment: SegmentConfig;
    mic: {
      mode: MicMode;
      /** Talk key for hold and toggle, names joined by `+` (see `src/asr/hotkey.ts`). */
      hotkey: string;
      /** Browser media device id of the microphone; empty uses the system default. */
      deviceId: string;
      /** Hold mode: the microphone opens when the talk key goes down and closes after it goes up; off keeps it open while voice input is on. */
      openOnPress: boolean;
    };
  };
}

/** The pet's size range on screen. */
export const SCALE_MIN = .5, SCALE_MAX = 10;
/** The range of `window.bubbleSize` and `window.fontSize`. */
export const BUBBLE_SIZE_MIN = .8, BUBBLE_SIZE_MAX = 1.6;
/** The range of `window.bubbleSpeed`. */
export const BUBBLE_SPEED_MIN = .5, BUBBLE_SPEED_MAX = 2;
/** The halo's reach in pixels: 0 is off; past GLOW_MAX it reads as a gray cloud rather than an outline. */
export const GLOW_MAX = 16, GLOW_DEFAULT = 7;
/** The range of `asr.segment.thresholdDb`, in dBFS. */
export const THRESHOLD_DB_MIN = -80, THRESHOLD_DB_MAX = 0;

export const DESKTOP_PET_DEFAULTS: DesktopPetConfigSection = {
  enabled: false,
  port: 7797,
  user: '',
  window: { enabled: true, electronFile: '', scale: 1, bubbleSize: 1, fontSize: 1, bubbleSpeed: 1, glow: GLOW_DEFAULT, frameRate: 60, lockFrameRate: false, hideWhenFullscreen: false, exportOverlay: false },
  roam: 'calm',
  sound: true,
  sounds: { move: true, touch: true, face: true, snore: true, talk: true, ui: true, snoreSeconds: 0 },
  speech: { enabled: false, pitch: 'mid', pitchHz: SPEECH_PITCH_HZ.mid, speed: 'mid', unitsPerSecond: SPEECH_RATE.mid },
  theme: 'dark',
  rememberPosition: false,
  petX: null,
  petY: null,
  hoverButtons: 'chat,voice',
  doubleClickChat: false,
  typeKey: { enabled: false, hotkey: DEFAULT_TYPE_KEY },
  statusBubble: true,
  saidBubbles: true,
  selfAdjust: 'default',
  selfAdjustCustom: { ...SELF_DEFAULT },
  skin: {
    figure: 'coo', scheme: 'deepseek', palette: 'mint', head: 'none', side: 'none', glasses: 'none', neck: 'none',
    colors: { head: { main: 'body', acc: 'eye' }, side: { main: 'eye', acc: 'eye' }, glasses: { main: 'body', acc: 'eye' }, neck: { main: 'eye', acc: 'eye' } },
  },
  cua: CUA_DEFAULTS,
  touch: { enabled: true, wakeOn: 'poke', wakeKinds: ['poke'] },
  asr: {
    enabled: true,
    engine: '',
    language: '',
    threads: 0,
    simplified: true,
    timeoutMs: 20_000,
    api: { baseUrl: '', model: '' },
    segment: { thresholdDb: -42, minSpeechMs: 180, dispatchSilenceMs: 250, silenceMs: 600, maxUtteranceMs: 15_000, preRollMs: 320, minUtteranceMs: 350 },
    mic: { mode: 'hold', hotkey: DEFAULT_HOTKEY, deviceId: '', openOnPress: false },
  },
};

const K = `worlds.${DESKTOP_PET_ID}`;

/** The console's config groups: the pet's own, its sounds and voice input, titled in `language` (the console's). */
export function desktopPetConfigGroups(language: Language = 'zh'): ConfigGroup[] {
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
        [`${K}.saidBubbles`]: { type: 'boolean', title: c.saidBubbles.title, description: c.saidBubbles.description, 'x-hot': true },
        [`${K}.selfAdjust`]: { type: 'string', title: c.selfAdjust.title, enum: [...SELF_ADJUST], description: c.selfAdjust.description, 'x-hot': true },
        [`${K}.window.enabled`]: { type: 'boolean', title: c.windowEnabled.title, 'x-hot': false },
        [`${K}.window.scale`]: { type: 'number', title: c.scale.title, minimum: SCALE_MIN, maximum: SCALE_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.bubbleSize`]: { type: 'number', title: c.bubbleSize.title, description: c.bubbleSize.description, minimum: BUBBLE_SIZE_MIN, maximum: BUBBLE_SIZE_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.fontSize`]: { type: 'number', title: c.fontSize.title, description: c.fontSize.description, minimum: BUBBLE_SIZE_MIN, maximum: BUBBLE_SIZE_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.bubbleSpeed`]: { type: 'number', title: c.bubbleSpeed.title, description: c.bubbleSpeed.description, minimum: BUBBLE_SPEED_MIN, maximum: BUBBLE_SPEED_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.glow`]: { type: 'number', title: c.glow.title, description: c.glow.description, minimum: 0, maximum: GLOW_MAX, multipleOf: 1, 'x-hot': true },
        [`${K}.window.frameRate`]: { type: 'integer', title: c.frameRate.title, minimum: 0, description: c.frameRate.description, 'x-hot': true },
        [`${K}.window.lockFrameRate`]: { type: 'boolean', title: c.lockFrameRate.title, description: c.lockFrameRate.description, 'x-hot': true },
        // only the window process on Windows can tell another program is full screen (host/electron-main.cjs `fullscreen`); unregistered, the 「习惯」 page hides it too
        ...(process.platform === 'win32' ? {
          [`${K}.window.hideWhenFullscreen`]: { type: 'boolean', title: c.hideWhenFullscreen.title, description: c.hideWhenFullscreen.description, 'x-hot': true },
        } : {}),
        [`${K}.window.exportOverlay`]: { type: 'boolean', title: c.exportOverlay.title, description: c.exportOverlay.description, 'x-hot': true },
        [`${K}.window.electronFile`]: { type: 'string', title: c.electronFile.title, description: c.electronFile.description, 'x-path': { kind: 'file' }, 'x-hot': false },
        [`${K}.port`]: { type: 'integer', title: c.port.title, minimum: 1024, maximum: 65535, description: c.port.description, 'x-hot': false },
        [`${K}.touch.enabled`]: { type: 'boolean', title: c.touchEnabled.title, description: c.touchEnabled.description, 'x-hot': true },
        [`${K}.touch.wakeOn`]: { type: 'string', title: c.touchWakeOn.title, enum: ['none', 'poke', 'all', 'custom'], description: c.touchWakeOn.description, 'x-hot': true },
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
        [`${K}.speech.enabled`]: { type: 'boolean', title: c.speech.title, description: c.speech.description, 'x-hot': true },
        [`${K}.speech.pitch`]: { type: 'string', title: c.speechPitch.title, enum: [...SPEECH_LEVELS], description: c.speechPitch.description(SPEECH_PITCH_HZ.low, SPEECH_PITCH_HZ.mid, SPEECH_PITCH_HZ.high), 'x-hot': true },
        [`${K}.speech.pitchHz`]: { type: 'integer', title: c.speechPitchHz.title, minimum: SPEECH_PITCH_MIN, maximum: SPEECH_PITCH_MAX, 'x-suffix': 'Hz', 'x-hot': true },
        [`${K}.speech.speed`]: { type: 'string', title: c.speechSpeed.title, enum: [...SPEECH_LEVELS], description: c.speechSpeed.description(SPEECH_RATE.low, SPEECH_RATE.mid, SPEECH_RATE.high), 'x-hot': true },
        [`${K}.speech.unitsPerSecond`]: { type: 'integer', title: c.speechRate.title, minimum: SPEECH_RATE_MIN, maximum: SPEECH_RATE_MAX, 'x-suffix': c.speechRate.suffix, 'x-hot': true },
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
        [`${K}.asr.engine`]: { type: 'string', title: c.asrEngine.title, enum: ['', 'funasr', 'whisper', 'system', 'api'], description: c.asrEngine.description, 'x-hot': true },
        [`${K}.asr.api.baseUrl`]: { type: 'string', title: c.asrApiUrl.title, description: c.asrApiUrl.description, 'x-hot': true },
        [`${K}.asr.api.model`]: { type: 'string', title: c.asrApiModel.title, description: c.asrApiModel.description, 'x-hot': true },
        [`${K}.asr.language`]: { type: 'string', title: c.asrLanguage.title, description: c.asrLanguage.description, 'x-hot': true },
        [`${K}.asr.threads`]: { type: 'integer', title: c.asrThreads.title, minimum: 0, maximum: 16, description: c.asrThreads.description, 'x-hot': true },
        [`${K}.asr.simplified`]: { type: 'boolean', title: c.asrSimplified.title, description: c.asrSimplified.description, 'x-hot': true },
        [`${K}.asr.segment.thresholdDb`]: { type: 'number', title: c.thresholdDb.title, minimum: THRESHOLD_DB_MIN, maximum: THRESHOLD_DB_MAX, 'x-suffix': 'dBFS', 'x-hot': true },
        [`${K}.asr.segment.silenceMs`]: { type: 'integer', title: c.silenceMs.title, minimum: 200, maximum: 5000, 'x-suffix': 'ms', 'x-hot': true },
        [`${K}.asr.segment.maxUtteranceMs`]: { type: 'integer', title: c.maxUtteranceMs.title, minimum: 2000, maximum: 60000, 'x-suffix': 'ms', 'x-hot': true },
      },
    },
  };
  return [pet, sound, asr, cuaConfigGroup(language)];
}
