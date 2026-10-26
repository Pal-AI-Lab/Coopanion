/**
 * DesktopPetWorld: the pet on the desktop as a World.
 *
 * Output goes through four tools that drive the pet page (bubble, options, going somewhere,
 * expressions and motions). Input arrives as events: speech heard through the pet window's
 * microphone (transcribed in this process by FunASR's SenseVoice or by Whisper, by Windows' own recognizer, or by an
 * OpenAI-compatible transcription service), typed text, answers to `pet_ask`, and touches
 * (poke, petting, being thrown). The page reports what actually happened; receipts and
 * events state only that.
 *
 * Processes owned here: the page server (always, while mounted), the pet window (when
 * `window.enabled`) and the system recognizer's helper (voice input on, engine `system`). FunASR and
 * Whisper run in this process once their model is downloaded.
 *
 * Two languages are read at each use: the model-text language for what the bot reads, and the app
 * language (`DesktopPetWorldOptions.language`) for what the person reads: the pages' text (the
 * snapshot carries it, so the pages follow a change within PREFS_SYNC_MS), status lines, voice
 * hints, the default name for the person, and which recognizer and recognition language voice
 * input uses by default. The console's text follows the console request's language.
 */
import type { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type {
  BlobInput, EventEnvelope, Logger, OutputTap, RunPhase, ToolCallContext, ToolDef, ToolOutcome, TriggerMode, World, WorldWebUiDecl,
  WorldHost, WorldLamp, WorldPanelDecl, WorldStreamSocket,
} from 'cortico/core/types.ts';
import { nowIso, shortTime } from 'cortico/core/util.ts';
import type { Language } from 'cortico/core/language.ts';
import type { DeepPartial } from 'cortico/world.ts';
import {
  DESKTOP_PET_ID, MAX_HOVER_BUTTONS, PET_ACTIONS, SELF_KEYS, TOUCH_KINDS, USER_MAX, asrEngineFor, desktopPetConfigGroups, directSettings,
  hoverButtonList, selfAdjustMode, speechFor, touchWakes,
  type AsrEngine, type DesktopPetConfigSection, type MicMode, type PetSkin, type PetTheme, type RoamMode, type SelfKey,
} from './config.ts';
import { capFor, cutChars, petText, type PetText } from './i18n/index.ts';
import { SpeechText, speechTextSteps } from './speech/index.ts';
import { PetServer, type PageMessage } from './server.ts';
import { StatusTracker, type DescribeTool } from './status.ts';
import { WindowHost, resolveHostCommand } from './window-host.ts';
import { RuntimeStore, type ModelSpec } from './runtime/store.ts';
import { SENSEVOICE, SherpaAsr, WHISPER, type SherpaModelKind, type SherpaModule, type SherpaState } from './asr/sherpa.ts';
import { SystemRecognizer, systemRecognizerSupported, type SystemRecognizerState, type SystemSentence } from './asr/system-recognizer.ts';
import { TranscriptionApi, type TranscriptionState } from './asr/transcription-api.ts';
import { Packer, Segmenter, rmsDb, type SegmentConfig, type SegmentSink, type Utterance } from './asr/segmenter.ts';
import { comboLabel, hotkeyBadge, hotkeyLabel, parseHotkey, splitTaps, watchHotkey, type KeyWatcher } from './asr/hotkey.ts';
import { joinSpeech, looksHallucinated } from './asr/result.ts';
import { toSimplified } from './asr/simplify.ts';
import { estimateSeconds, parseActions, parseScript, vocabChange, vocabTable, type VocabWord } from './script.ts';
import { ActivityGroup, ChatSockets, SELF_TYPE, chatHistory, chatItem, chatRefs, type ChatFigure } from './chat.ts';
import { ASK_OPTION_MAX, petToolDecls } from './tools.ts';
import { COO, figurePacks, lookOf, modelName, nameIn, packFor, type FigurePack, type MoveTarget, type PackScan } from './packs.ts';
import { moveChange, moveTable, readMove } from './moves.ts';
import { Cua } from './cua/cua.ts';
import { CUA_OFF_TOOL_DECLS } from './cua/tools.ts';
import type { Answer } from './cua/engine-ipc.ts';
import { PackImporter } from './pack-import.ts';
import { dressTable, planSettings, type SettingChange } from './self.ts';
import { MODEL_TEXT, type ModelLanguage, type ModelText } from './model-text.ts';

/** The console panels, titled in `language`. */
function desktopPetPanelDecls(language: Language = 'zh'): WorldPanelDecl[] {
  const p = petText(language).console.panels;
  return [
    { id: 'pet', ...p.pet, getMethods: ['state'] },
    { id: 'voice', ...p.voice, getMethods: ['state'] },
  ];
}

/** The culture of Windows' speech recognizer preferred for each app language, where its language has more than one. */
const SYSTEM_CULTURES: Readonly<Record<string, string>> = {
  zh: 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en-US', fr: 'fr-FR', de: 'de-DE', 'es-419': 'es-MX', 'pt-BR': 'pt-BR', it: 'it-IT', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR',
};

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const SPEECH_DATA = fileURLToPath(new URL('./speech/data/', import.meta.url));
/** The environment prompt template of each model-text language; English falls back to Chinese while its file is missing. */
const ENV_PROMPT_FILES: Record<ModelLanguage, string> = {
  zh: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
  en: fileURLToPath(new URL('./ENV_PROMPT.en.md', import.meta.url)),
};

/** Longest `pet_quiet`: a quiet that outlasts a day is a setting, which `pet_set` changes. */
const QUIET_MAX_MIN = 24 * 60;
const FRAME_MS = 20;
const SAMPLE_RATE = 16_000;
const WALK_TIMEOUT_MS = 30_000;
/** Touches of one kind closer than this are reported as one event with a count. */
const TOUCH_MERGE_MS = 2500;
/** How long a confirmation bubble waits for an answer. */
const CONFIRM_TIMEOUT_MS = 60_000;
/** History events read per chat page load; the page asks for the ones before by cursor. */
const CHAT_PAGE_EVENTS = 300;
/** A message from the chat page: text cut to this, up to IMAGES_MAX images of at most IMAGE_MAX_BYTES each, as the console World takes them. */
const CHAT_TEXT_MAX = 4000;
const IMAGES_MAX = 8;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** How often config edits from the console reach the pages: short enough that the size slider moves the pet with it. */
const PREFS_SYNC_MS = 150;
/** Talk-key polling interval: well under the shortest key tap. */
const HOTKEY_POLL_MS = 30;
/**
 * A microphone the talk key opened (`asr.mic.openOnPress`) closes this long after the key goes up,
 * so a press right after a release finds it open. The end of speech does not wait on it: the
 * segmenter is flushed when the key goes up, and frames that arrive later are not used.
 */
const MIC_RELEASE_MS = 500;

/**
 * Run controls an embedding app lends the pet's menu. Each button shows only when its control is
 * lent: pause/resume needs `isPaused` and `setPaused`, settings `openSettings`, the power button
 * `quit`. Without any the menu header shows only the avatar and the name.
 */
export interface PetBotControls {
  isPaused?(): boolean;
  setPaused?(paused: boolean): void;
  openSettings?(): void;
  /** Shows the app's computer-use switch together with what turning it on risks; while computer use is off, `pet_cua_open_settings` calls it. */
  openCuaSettings?(): void;
  /** Shows the chat page; the bubble's expand button carries its draft there. */
  openChat?(): void;
  /** Shows the embedding app's own dress page; the menu's 「装扮」 then opens it instead of the pet's dress window. */
  openDress?(): void;
  quit?(): void;
  /** The power button's label, e.g. "Quit Coopanion", read when the menu opens. */
  quitLabel?: string | (() => string);
  /** Runs the embedding app's introduction again (the console's `pet.guide` panel method). */
  guide?(): void;
}

/**
 * One step of a conversation an embedding app holds through the pet's bubble (`dialog`): Coo says
 * `text`, then shows `input`, if any, in the same bubble. `step` draws progress dots, `closable`
 * a close button.
 */
export interface PetDialog {
  text: string;
  /** Words in `text` drawn in the theme color, such as a name said for the first time. */
  marks?: string[];
  /** Expressions and motions (vocabulary words) played as the line starts. */
  actions?: string[];
  step?: [number, number];
  closable?: boolean;
  input?: PetDialogInput;
}

/**
 * - `buttons`: a row of buttons, answered with the index; a button's `hover` is the label it shows while pointed at or
 *   focused. `keys` shows a key cap above them, pressed `taps` times over and over, the last press held (a talk key
 *   tapped, then held).
 * - `choices`: cards to try out before `confirm`, each with an optional level tag, a small `note` under its label, and icon (a web/ui.js
 *   `ICONS` name, or `image`, a `data:image/…` URL such as a service's logo); a card's `line` is typed when it is picked and
 *   its `motion` played (standing still, strolling, running about) until another is picked, and its `actions` (vocabulary
 *   words) once. A card's `skin` dresses the body in it while the card is picked, and stays on when it is the answer;
 *   closing the step puts the body back as the config has it. A card's `tint` (light and dark theme), or else the eye colour of
 *   its skin's Coo palette, colours its icon.
 *   `list` lays the cards out one per row; `hint` is a line beside the confirm button with `mark`, a word in it, drawn
 *   after the `icon` of that name. `more` is a last card that,
 *   clicked, unfolds its `options` after the others in place; the answer's index counts on through them, and a `value`
 *   among them shows them from the start.
 * - `text`: a text box answered with the text; `secret` hides what is typed, `suggestions` are offered
 *   as the person types, `link` opens a page in the browser, `alt` is a second way out, answered as `{ alt: true }`.
 * - `progress`: a bar the app moves with `update({ progress })`; it ends when the app closes it.
 */
export type PetDialogInput =
  | { kind: 'buttons'; options: Array<{ label: string; primary?: boolean; hover?: string }>; keys?: string; taps?: number }
  | { kind: 'choices'; options: PetDialogChoice[]; more?: { label: string; icon?: string; image?: string; options: PetDialogChoice[] }; value?: number; confirm: string; list?: boolean; hint?: { text: string; mark: string; icon: string } }
  | { kind: 'text'; submit: string; placeholder?: string; value?: string; secret?: boolean; maxLength?: number; suggestions?: string[]; link?: { label: string; url: string }; alt?: string }
  | { kind: 'progress'; label?: string };
export type PetDialogChoice = {
  label: string; level?: string; note?: string; icon?: string; image?: string; line?: string; motion?: 'still' | 'walk' | 'run';
  actions?: string[]; skin?: Partial<PetSkin>; tint?: { light: string; dark: string };
};

/**
 * How a step ended: a button or card (`index`), typed text, the text box's `alt`, the close
 * button, the line read to the end with nothing to answer (`done`, also a progress step the app
 * closed), or no pet page to show it on.
 */
export type PetDialogAnswer =
  | { index: number } | { text: string } | { alt: true } | { closed: true } | { done: true } | { unavailable: true };

/** What the app changes on a step while it is up: the line, and a progress step's bar (0–1, or null while there is no telling). */
export interface PetDialogUpdate {
  text?: string;
  progress?: number | null;
}

export interface PetDialogHandle {
  readonly answer: Promise<PetDialogAnswer>;
  update(patch: PetDialogUpdate): void;
  /** Takes the step off the bubble; an unanswered one resolves `done`. */
  close(): void;
}

/**
 * How a confirmation ended: one of the choices (`always` only when three were offered), closed, no answer in time,
 * or no pet page to ask on.
 */
export type ConfirmResult = 'yes' | 'always' | 'no' | 'dismissed' | 'timeout' | 'unavailable';

export interface DesktopPetWorldOptions {
  cfg: DesktopPetConfigSection;
  timezone: string;
  persist: (patch: DeepPartial<DesktopPetConfigSection>) => void;
  runtimesRoot: () => string;
  modelsDir: () => string;
  /** Downloads; tests pass a local stand-in. */
  fetchImpl?: typeof fetch;
  /** Loads sherpa-onnx; tests pass a fake recognizer. */
  loadSherpa?: () => SherpaModule;
  /** The speech models to download; tests pass small ones. */
  funasrModel?: ModelSpec;
  whisperModel?: ModelSpec;
  /** The transcription service's API Key, read at each request, and where the voice panel saves a new one; absent, there is none. */
  asrApiKey?: () => string;
  storeAsrApiKey?: (key: string) => void;
  /** The bot's name for the menu header, the chat page and computer use's question; read at each use. */
  botName?: () => string;
  /** PNG shown as the avatar in the menu header, when it exists. */
  avatarFile?: string;
  controls?: PetBotControls;
  /** Reads the talk key; tests pass a scripted one. */
  watchHotkey?: typeof watchHotkey;
  /** Starts the system recognizer's helper; tests pass a fake. */
  spawnSystemRecognizer?: typeof spawn;
  /** Directories whose subdirectories are installed figure packs (src/packs.ts). */
  packRoots?: () => string[];
  /** The one of them the dressing page installs packs into (src/pack-import.ts); without it the page offers no import. */
  packDir?: () => string;
  /** Called after the bot changed settings itself (`pet_set`), so an app watching the config knows it was not the person. */
  onBotChange?: () => void;
  /** What the status bubble shows for a tool call. */
  describeTool?: DescribeTool;
  /** The language of what the bot reads from this World (`model-text.ts`), read at each use; Chinese when absent. */
  modelLanguage?: () => ModelLanguage;
  /** The app language: what the person reads (see the module header). Read at each use; `zh` when absent. */
  language?: () => Language;
  /**
   * The language the bot is to talk to the person in, named in the model-text language, when it is
   * not that language itself; it becomes one line of the environment prompt (`{{pet.reply}}`). Null
   * or absent: no such line.
   */
  replyLanguage?: () => string | null;
  /** Called with each answer to computer use's question, asked in the pet's bubble. */
  onCuaAnswer?: (answer: Answer) => void;
}

type SherpaEngine = Exclude<AsrEngine, 'system' | 'api'>;
type BackendState = SherpaState | SystemRecognizerState | TranscriptionState;

interface PendingWalk {
  resolve: (text: string) => void;
  timer: NodeJS.Timeout;
  /** The figure's target it goes to, as the bot reads its name; absent for a default target. */
  target?: string;
  /** The call's interrupt asked the page to stop the walk. */
  stopping?: boolean;
}

interface PendingAsk {
  id: string;
  question: string;
  options: string[];
}

interface TouchBatch {
  kind: string;
  count: number;
  woke: boolean;
  asleep: boolean;
  x: number | null;
  crashed: boolean;
  timer: NodeJS.Timeout;
}

interface HeardLine { text: string; at: number; ms: number; dropped?: boolean }

interface PendingConfirm {
  resolve: (result: ConfirmResult) => void;
  /** How many choices the bubble shows: the last one is no. */
  choices: number;
  timer: NodeJS.Timeout;
}

/** Characters a step's line is shown for per second (typing, then reading), for its time limit. */
const DIALOG_CPS = 4;

let seq = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** The first expression among a beat's words for the chat page's tag: its id, and its first name in each language of the body's vocabulary. */
function moodOf(actions: readonly string[], vocab: readonly VocabWord[]): { mood?: Record<string, string> } {
  const v = actions.map((a) => vocab.find((e) => e.id === a)).find((e) => e?.kind === 'expression' && e.id !== 'neutral');
  if (!v) return {};
  return { mood: { id: v.id, ...Object.fromEntries(Object.entries(v.names).flatMap(([lang, names]) => (names[0] ? [[lang, names[0]]] : []))) } };
}

/** Images of a chat page message: the whole batch is taken, or the reason it is not. */
function parseChatImages(raw: unknown, user: string, s: PetText['chat'], m: ModelText): { ok: true; blobs: BlobInput[] } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, blobs: [] };
  if (!Array.isArray(raw)) return { ok: false, reason: s.badImages };
  if (raw.length > IMAGES_MAX) return { ok: false, reason: s.tooManyImages(IMAGES_MAX) };
  const blobs: BlobInput[] = [];
  for (const [i, item] of raw.entries()) {
    const img = (item ?? {}) as { mime?: unknown; base64?: unknown; name?: unknown };
    if (typeof img.mime !== 'string' || !IMAGE_MIMES.has(img.mime)) return { ok: false, reason: s.badMime(String(img.mime)) };
    const bytes = typeof img.base64 === 'string' ? Buffer.from(img.base64, 'base64') : Buffer.alloc(0);
    if (bytes.length === 0) return { ok: false, reason: s.emptyImage };
    if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: s.bigImage(IMAGE_MAX_BYTES / 1048576) };
    const name = typeof img.name === 'string' && img.name.trim() ? img.name.trim().slice(0, 120) : undefined;
    blobs.push({ bytes, mime: img.mime, ...(name ? { name } : {}), fallbackText: m.image(user, i + 1, raw.length) });
  }
  return { ok: true, blobs };
}

/** A picture the typing box carries to the chat page with its draft, as the page's composer holds it; the page checks it again on send. */
interface DraftImage { name: string; mime: string; base64: string; bytes: number; width: number; height: number }

function draftImages(raw: unknown): DraftImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, IMAGES_MAX).flatMap((item) => {
    const i = (item ?? {}) as Partial<Record<keyof DraftImage, unknown>>;
    if (typeof i.mime !== 'string' || !IMAGE_MIMES.has(i.mime) || typeof i.base64 !== 'string' || !i.base64) return [];
    if (i.base64.length > Math.ceil(IMAGE_MAX_BYTES / 3) * 4 || typeof i.width !== 'number' || typeof i.height !== 'number') return [];
    const name = typeof i.name === 'string' && i.name ? i.name.slice(0, 120) : 'image';
    const bytes = typeof i.bytes === 'number' ? i.bytes : Math.floor(i.base64.length * 3 / 4);
    return [{ name, mime: i.mime, base64: i.base64, bytes, width: i.width, height: i.height }];
  });
}

export class DesktopPetWorld implements World {
  readonly id = DESKTOP_PET_ID;
  private host: WorldHost | null = null;
  private log: Logger | null = null;
  private readonly cfg: DesktopPetConfigSection;
  private readonly server: PetServer;
  /** The syllables of the pet page's speech; its dictionaries load the first time a text needs them. */
  private readonly speechText = new SpeechText(SPEECH_DATA, join(WEB_DIR, 'speech', 'zh.json'));
  private windowHost: WindowHost | null = null;
  private readonly store: RuntimeStore;
  private funasr: SherpaAsr | null = null;
  private whisper: SherpaAsr | null = null;
  private system: SystemRecognizer | null = null;
  private api: TranscriptionApi | null = null;
  /** The engine the running backend belongs to; a config change starts the other one. */
  private runningEngine: AsrEngine | null = null;
  private voiceGeneration = 0;
  private voiceStopping: Promise<void> | null = null;
  private voiceEnabled = false;
  /** `cua.enabled` as syncPrefs last saw it: switching it off ends the engine process. */
  private cuaSeen = false;
  /** The person asked to send what was heard now, without waiting for the pause that ends a sentence. */
  private committing = false;
  private readonly segmenter: Segmenter;
  private readonly packer = new Packer({ minChars: 1 });
  private readonly queue: Utterance[] = [];
  private transcribing = false;
  private packTimer: NodeJS.Timeout | null = null;
  private wasSpeaking = false;
  private screen: { w: number; h: number } | null = null;
  /** The pet window said it is hidden (its menu's or the tray's 「隐藏」); reset when a page connects. */
  private petHidden = false;
  private busyUntil = 0;
  private readonly walks = new Map<string, PendingWalk>();
  private ask: PendingAsk | null = null;
  private touch: TouchBatch | null = null;
  /** A touch has woken the bot and no turn has ended since; touches until then wait for the next wake. */
  private touchWoke = false;
  /** The local date of the last event's time stamp; the next event on another date names its date again. */
  private stampDay = '';
  private prefsKey = '';
  private prefsTimer: NodeJS.Timeout | null = null;
  /** Where the pet window last said the pet stands, measured as `petX` is; written by `savePosition` on stop. */
  private standX: number | null = null;
  /** How far down it stands, as `petY` is measured, when the body reported one with that position. */
  private standY: number | null = null;
  private readonly voiceSockets = new Set<WorldStreamSocket>();
  private lastLevelAt = 0;
  private readonly heard: HeardLine[] = [];
  private readonly counts = { utterances: 0, delivered: 0, dropped: 0 };
  private micState: { state: string; detail: string | null } = { state: 'off', detail: null };
  private devices: Array<{ id: string; label: string }> = [];
  private readonly confirms = new Map<string, PendingConfirm>();
  private readonly dialogs = new Map<string, (a: PetDialogAnswer) => void>();
  /** The talk key is down (hold) or was switched on (toggle). */
  private talking = false;
  /** With `micOnPress`: the page keeps the microphone open from the talk key's press until MIC_RELEASE_MS after its release. */
  private micHeld = false;
  private micReleaseTimer: NodeJS.Timeout | null = null;
  /** Counts cancelled captures; a transcription begun before a cancel is dropped when it lands. */
  private cancels = 0;
  private keyWatcher: KeyWatcher | null = null;
  /** Why the talk key cannot be read; the gate then stays closed. */
  private hotkeyProblem: string | null = null;
  private hotkeyKey = '';
  /** The typing key's watcher while `typeKey.enabled`, and why it cannot be read. */
  private typeWatcher: KeyWatcher | null = null;
  private typeKeyProblem: string | null = null;
  private typeKeyKey = '';
  private level = -100;
  private readonly chat = new ChatSockets();
  private readonly activity = new ActivityGroup();
  /** What the status bubble shows. */
  private readonly status: StatusTracker;
  /** Computer use; its tools and its part of the environment prompt are there while `cua.enabled` is on. */
  private readonly cua: Cua;
  private phase: RunPhase | null = null;
  /** The person's messages (typed, spoken) not yet delivered to the bot, by cursor. */
  private readonly pendingChat = new Set<number>();
  /** The first cursor of this run: Core queues this World's undelivered events from before it again at start. */
  private startCursor = 0;
  /** Text the bubble's expand button carried, until a chat page takes it. */
  private draft: { text: string; images: DraftImage[] } | null = null;
  private pausedShown: boolean | null = null;
  private botShown: string | null = null;

  /** Installs packs the dressing page sends, when the app named a directory for them. */
  private readonly importer: PackImporter | null;

  constructor(private readonly opts: DesktopPetWorldOptions) {
    this.cfg = opts.cfg;
    this.cua = new Cua({
      cfg: () => this.cfg.cua,
      botName: opts.botName,
      modelLanguage: () => this.language,
      language: () => this.appLanguage,
      askPermission: async (question, choices) => {
        const answer = await this.confirm(question, choices);
        if (answer === 'unavailable') return null;
        const said: Answer = answer === 'yes' || answer === 'timeout' ? answer : 'no';
        opts.onCuaAnswer?.(said);
        return said;
      },
    });
    this.importer = opts.packDir ? new PackImporter({ packDir: opts.packDir, packs: () => this.packs(), text: () => this.ui }) : null;
    this.status = new StatusTracker((status) => this.server.sendPet({ t: 'status', status }), opts.describeTool, () => this.ui.busy);
    this.segmenter = new Segmenter(this.segmentConfig(), FRAME_MS);
    this.segmenter.setSink(this.sink);
    this.store = new RuntimeStore({ runtimesRoot: opts.runtimesRoot, modelsDir: opts.modelsDir, fetchImpl: opts.fetchImpl, funasrModel: opts.funasrModel, whisperModel: opts.whisperModel, text: () => this.ui });
    this.server = new PetServer({
      port: () => this.cfg.port,
      webDir: WEB_DIR,
      snapshot: () => this.snapshot(),
      onPetMessage: (msg) => this.onPage(msg),
      onAudio: (frame) => this.onAudio(frame),
      onPetConnect: () => { this.petHidden = false; this.bodyMissing = null; this.log?.info('桌宠页面已连接'); },
      onPetDisconnect: () => this.onPageGone(),
      onSkin: (skin) => this.saveSkin(skin),
      onPrefs: (prefs) => this.savePrefs(prefs),
      avatarFile: opts.avatarFile,
      packs: () => this.packs(),
      packProblems: () => this.packScan().problems,
      importer: this.importer ?? undefined,
      language: () => this.appLanguage,
      text: () => this.ui,
      overlay: () => this.cfg.window.exportOverlay,
      speech: (text) => this.speechText.units(text, this.appLanguage),
    });
  }

  /* ---------- figures ---------- */

  /** Pack problems already logged, so a broken pack is reported once, not on every scan. */
  private readonly packProblems = new Set<string>();
  /** The figure (and a pack's pick, `id:scheme`) the pet page last said it shows, null before it said. */
  private figureShown: string | null = null;
  /** The figure the page said would not run, while the skin still names it: the page shows Coo meanwhile. */
  private figureFailed: string | null = null;
  /** Why Coo, the last stand-in, would not run on the connected page, which then shows no figure at all. */
  private bodyMissing: string | null = null;
  /** The words each pack's body said it knows when the page last loaded it; a body that did not say is taken at its manifest's word. */
  private readonly bodyWords = new Map<string, ReadonlySet<string>>();
  /** The words the bot was last told it may use: its prompt's at start, then a `[figure]` event's or a `pet_set` receipt's. */
  private toldVocab: readonly VocabWord[] = [];
  /** The figure's own `pet_move_to` targets the bot was last told of, as `toldVocab` the words. */
  private toldMoves: readonly MoveTarget[] = [];
  /** A look the bot put on itself: the pet page's report of it is not told back (the receipt said it). */
  private botLook: string | null = null;
  /** `pet_quiet` in force: what it overrides, until when, and the settings it found (a change to them ends it). */
  private quiet: { sound: boolean; roam: RoamMode; until: number; base: { sound: boolean; roam: RoamMode }; timer: NodeJS.Timeout } | null = null;

  /** The built-in packs, then the installed ones; scanned on each call (a few small files). */
  packs(): FigurePack[] {
    return this.packScan().packs;
  }

  /** `packs()` with what was wrong in the pack directories, each problem logged once. */
  private packScan(): PackScan {
    const scan = figurePacks(this.opts.packRoots?.() ?? [], this.appLanguage);
    for (const { dir, reason, loaded } of scan.problems) {
      const line = `${loaded ? '形象包有一部分没用上' : '形象包没加载'}:${dir}:${reason}`;
      if (!this.packProblems.has(line)) { this.packProblems.add(line); this.log?.warn(line); }
    }
    return scan;
  }

  /** The pack of the figure the skin asks for (Coo for one that is not installed); null only when even Coo's would not load. */
  private currentPack(): FigurePack | null {
    const figure = this.cfg.skin.figure ?? COO;
    return packFor(this.packs(), figure === this.figureFailed ? COO : figure);
  }
  /** The words the body on screen does: its pack's vocabulary, less the words its body said it does not know. */
  private vocab(): VocabWord[] {
    const pack = this.currentPack();
    if (!pack) return [];
    const known = this.bodyWords.get(pack.id);
    return known ? pack.manifest.vocab.filter((w) => known.has(w.id)) : pack.manifest.vocab;
  }
  /** The `pet_move_to` targets of the body on screen's pack, beyond the default ones. */
  private moves(): MoveTarget[] {
    return this.currentPack()?.manifest.moves ?? [];
  }

  /** The language of what the bot reads from this World. */
  private get language(): ModelLanguage {
    return this.opts.modelLanguage?.() ?? 'zh';
  }

  /** The text table of that language. */
  private get t(): ModelText {
    return MODEL_TEXT[this.language];
  }

  /** The app language: what the person reads. */
  private get appLanguage(): Language {
    return this.opts.language?.() ?? 'zh';
  }

  /** The text table of the app language. */
  private get ui(): PetText {
    return petText(this.appLanguage);
  }

  /** What events and bubbles call the person: the set name, else the app language's default. */
  get userName(): string {
    return this.cfg.user || this.ui.defaultUser;
  }

  /** Traditional characters heard become Simplified: the setting is on and the app language is Simplified Chinese. */
  private get simplifies(): boolean {
    return this.cfg.asr.simplified && this.appLanguage === 'zh';
  }

  /** Sends the pages what changed in the config now, without waiting for the next look; an app calls it after it changes the app language. */
  refresh(): void {
    this.syncPrefs();
  }

  /**
   * How the words the bot may use and the places it may go changed since it was last told, or ''. From here the
   * bot counts as told those of now.
   */
  private vocabNote(): string {
    const now = this.vocab(), moves = this.moves();
    const notes = [vocabChange(this.toldVocab, now, this.language), moveChange(this.toldMoves, moves, this.language)];
    this.toldVocab = now;
    this.toldMoves = moves;
    return notes.filter(Boolean).join('\n\n');
  }

  /** What the body looks like now, with its picked options. */
  private bodyText(pack: FigurePack | null): string {
    if (!pack) return '';
    const { language, t } = this;
    const m = pack.manifest;
    const scheme = lookOf(pack, this.cfg.skin);
    const picks = scheme.split('-');
    const preset = m.presets.find((p) => p.id === scheme);
    const chosen = m.axes.map((a, i) => {
      const o = a.options.find((x) => x.id === (preset?.pick[a.id] ?? picks[i])) ?? a.options[0]!;
      return t.pick(modelName(a.name, a.id, language), modelName(o.name, o.id, language));
    });
    return t.body(modelName(m.name, pack.id, language), nameIn(m.about, language), chosen);
  }

  /**
   * The pet page's report of the figure it shows: a switch the bot did not see in its prompt is told
   * after the debounce (changes in a row come as one batch); a pack that would not load (the page then
   * shows Coo) is told at once. Either way the bot hears how the words it may use changed, the words
   * a newly loaded body says it does not know among them (`words`, the kit's bodies send it).
   */
  private onFigure(msg: PageMessage): void {
    const id = typeof msg.id === 'string' ? msg.id : COO;
    const before = this.figureShown;
    const packs = this.packs();
    const pack = packs.find((p) => p.id === id) ?? null;
    if (msg.ok !== true) {
      this.figureShown = COO;
      this.figureFailed = id;
      const reason = typeof msg.reason === 'string' ? msg.reason.slice(0, 200) : this.t.reasonUnknown;
      if (id === COO) this.bodyMissing = reason;
      // the page shows Coo instead, whose words then hold too
      const coo = packs.find((p) => p.id === COO) ?? null;
      const note = this.vocabNote();
      const name = modelName(pack?.manifest.name, id, this.language);
      void this.push('desktop-pet.figure', 'desktop-pet.figure', this.t.figureFailed(name, reason, this.bodyText(coo), note), 'flush',
        { meta: { figure: { kind: 'failed', name: { ...pack?.manifest.name, id } } } });
      return;
    }
    if ('words' in msg) {
      if (Array.isArray(msg.words)) this.bodyWords.set(id, new Set(msg.words.filter((w): w is string => typeof w === 'string')));
      else this.bodyWords.delete(id);
    }
    const known = this.bodyWords.get(id);
    const unknown = pack && known ? pack.manifest.vocab.filter((w) => !known.has(w.id)).map((w) => w.id) : [];
    const problem = `形象包 ${id} 的词表里有身体不认得的词,没给 bot 用:${unknown.join('、')}`;
    if (unknown.length && !this.packProblems.has(problem)) { this.packProblems.add(problem); this.log?.warn(problem); }
    if (id === this.cfg.skin.figure) this.figureFailed = null;
    this.bodyMissing = null;
    const shown = id === COO ? COO : `${id}:${typeof msg.scheme === 'string' ? msg.scheme : ''}`;
    this.figureShown = shown;
    let look: string | null = null;
    // what the chat page says of a switch the person made: another figure, or another dress of the same one
    let change: ChatFigure | null = null;
    if (before !== null && before !== shown) {
      if (shown === this.botLook) this.botLook = null;
      else {
        look = this.t.figureNow(this.bodyText(pack));
        change = { kind: before.split(':')[0] === id ? 'dress' : 'figure', name: { ...pack?.manifest.name, id } };
      }
    }
    const note = this.vocabNote();
    const text = look && note ? `${look}\n${note}` : look ?? (note ? this.t.figureNote(note) : null);
    if (text) void this.push('desktop-pet.figure', 'desktop-pet.figure', text, 'debounce', change ? { meta: { figure: change } } : {});
  }

  /* ---------- lifecycle ---------- */

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.startCursor = host.store.latestCursor() + 1;
    this.log = host.log;
    this.cua.start(host);
    // the words and targets the prompt is rendered with, until the bot is told otherwise
    this.toldVocab = this.vocab();
    this.toldMoves = this.moves();
    await this.server.start();
    this.windowHost = new WindowHost(host.log, () => this.t.window);
    if (this.cfg.window.enabled) this.openWindow();
    const sherpa = (engine: SherpaEngine, kind: SherpaModelKind) => new SherpaAsr({
      kind,
      model: () => this.sherpaModel(engine),
      language: () => this.asrLanguage(),
      text: () => this.ui,
      threads: () => this.cfg.asr.threads,
      log: host.log,
      load: this.opts.loadSherpa,
    });
    this.funasr = sherpa('funasr', SENSEVOICE);
    this.whisper = sherpa('whisper', WHISPER);
    this.system = new SystemRecognizer({
      language: () => this.asrLanguage(),
      culture: () => SYSTEM_CULTURES[this.appLanguage] ?? '',
      text: () => this.ui,
      timeoutMs: () => this.cfg.asr.timeoutMs,
      log: host.log,
      spawnImpl: this.opts.spawnSystemRecognizer,
    });
    this.api = new TranscriptionApi({
      config: () => this.cfg.asr.api,
      key: () => this.opts.asrApiKey?.() ?? '',
      language: () => this.asrLanguage(),
      timeoutMs: () => this.cfg.asr.timeoutMs,
      text: () => this.ui,
      log: host.log,
    });
    this.cuaSeen = this.cfg.cua.enabled;
    if (this.cfg.asr.enabled) void this.startVoiceBackend();
    await this.syncHotkey();
    await this.syncTypeKey();
    this.prefsKey = this.prefsSignature();
    this.prefsTimer = setInterval(() => this.syncPrefs(), PREFS_SYNC_MS);
  }

  async stop(): Promise<void> {
    this.voiceGeneration++;
    this.runningEngine = null;
    this.status.clear();
    if (this.quiet) clearTimeout(this.quiet.timer);
    this.quiet = null;
    if (this.prefsTimer) clearInterval(this.prefsTimer);
    this.prefsTimer = null;
    this.savePosition();
    await this.importer?.cancel();
    if (this.packTimer) clearTimeout(this.packTimer);
    this.packTimer = null;
    if (this.touch) clearTimeout(this.touch.timer);
    this.touch = null;
    this.touchWoke = false;
    this.keyWatcher?.stop();
    this.keyWatcher = null;
    this.typeWatcher?.stop();
    this.typeWatcher = null;
    this.typeKeyKey = '';
    if (this.micReleaseTimer) clearTimeout(this.micReleaseTimer);
    this.micReleaseTimer = null;
    for (const c of this.confirms.values()) { clearTimeout(c.timer); c.resolve('unavailable'); }
    this.confirms.clear();
    for (const d of this.dialogs.values()) d({ unavailable: true });
    this.dialogs.clear();
    for (const w of this.walks.values()) { clearTimeout(w.timer); w.resolve(this.t.walkWorldStopped); }
    this.walks.clear();
    for (const s of this.voiceSockets) s.close('stopped');
    this.voiceSockets.clear();
    this.chat.closeAll('stopped');
    await this.windowHost?.stop();
    await this.funasr?.stop();
    await this.whisper?.stop();
    await this.system?.stop();
    await this.api?.stop();
    await this.server.stop();
    await this.cua.stop();
    this.host = null;
  }

  onTurnEnded(): void {
    this.touchWoke = false;
    this.cua.onTurnEnded();
  }

  /** Computer use is on and this system runs it. */
  private get cuaOn(): boolean {
    return this.cfg.cua.enabled && this.cua.unsupported() === null;
  }

  /** Computer use is off on a system that runs it, and the app can show its switch. */
  private get cuaCanOpen(): boolean {
    return !this.cfg.cua.enabled && this.cua.unsupported() === null && !!this.opts.controls?.openCuaSettings;
  }

  private openCuaSettings(): ToolOutcome {
    this.opts.controls?.openCuaSettings?.();
    return { text: this.t.cuaSettingsOpened(this.userName) };
  }

  outputTap(): OutputTap | undefined {
    if (!this.server.petConnected) return undefined;
    return {
      // the pet shows nothing of the stream itself; its tools act when they run
      externalizes: () => false,
      onEvent: (event) => this.status.onEvent(event),
    };
  }

  onRunPhase(phase: RunPhase): void {
    this.phase = phase;
    this.status.onPhase(phase);
    if (this.activity.observe(phase, Date.now())) this.chat.broadcast({ t: 'activity', steps: this.activity.steps, startedAt: this.activity.startedAt });
    if (phase.state === 'idle') void this.closeActivity();
    this.chat.broadcast({ t: 'phase', phase });
  }

  /**
   * A message that waited shows where the bot took it in: the steps done before that are recorded
   * first, then a `delivered` record the history places the message at.
   */
  onEventsSettled(events: readonly EventEnvelope[], outcome: 'delivered' | 'discarded'): void {
    const cursors = events
      .filter((e) => this.pendingChat.delete(e.cursor) || (e.cursor < this.startCursor && chatItem(e)?.kind === 'user'))
      .map((e) => e.cursor);
    if (!cursors.length) return;
    void (async () => {
      await this.closeActivity();
      const later = (this.host?.store.latestCursor() ?? 0) > Math.max(...cursors);
      const at = outcome === 'delivered' && later
        ? await this.record({ kind: 'delivered', cursors }, `送达了 ${cursors.map((c) => `#${c}`).join('、')}`)
        : null;
      this.chat.broadcast({ t: 'settled', cursors, outcome, ...(at !== null ? { at } : {}) });
    })();
  }

  /** The steps since the pet's last line become one record: before each line, when the loop goes idle, before a waiting message is placed. */
  private async closeActivity(): Promise<void> {
    const group = this.activity.take(Date.now());
    if (!group) return;
    this.chat.broadcast({ t: 'activity', steps: null });
    await this.record({ kind: 'activity', ...group }, `做了:${group.steps.join('、')}`);
  }

  /**
   * One frame from a chat page:
   * - `hello`: the history, the messages still pending, the loop's phase and the pause, and a draft the bubble carried
   * - `more { before }`: the history before that cursor
   * - `send { id, text, images }`: a message typed on the page, delivered with `preempt`; answered with `sent { id, cursor }` or `rejected { id, reason }`
   * - `now { cursor }`: a pending message delivered at once, stopping what the bot is doing (`interrupt`)
   * - `withdraw { cursor }`: a pending message taken back; answered with `withdrawn { cursor }` to every page, or `notice` when it was already delivered
   * - `answer { askId, index | text }`: the open `pet_ask` answered on the page
   *
   * `init` and `ask` frames carry the id of the question that can still be answered (`askId`, null
   * when none). `init` and `older` carry `refs`: the `withdrawn` and `delivered` records in that
   * stretch of history about messages before it, which the page applies to the pages it loads later.
   */
  private async onChat(msg: Record<string, unknown>, socket: WorldStreamSocket, language: Language): Promise<void> {
    const host = this.host;
    const s = petText(language).chat;
    switch (msg.t) {
      case 'hello': {
        const page = host ? this.chatPage() : { items: [], more: false };
        this.chat.send(socket, {
          t: 'init', ...page, pending: [...this.pendingChat], askId: this.ask?.id ?? null, phase: this.phase,
          activity: this.activity.steps.length ? { steps: this.activity.steps, startedAt: this.activity.startedAt } : null,
          paused: this.opts.controls?.isPaused?.() ?? false, user: this.userName, bot: this.botName(),
          imagesSeen: host?.modelFacts.accepts('image/jpeg') ?? false,
        });
        if (this.draft !== null) { this.chat.send(socket, { t: 'draft', ...this.draft }); this.draft = null; }
        return;
      }
      case 'more': {
        if (!host || typeof msg.before !== 'number') return;
        this.chat.send(socket, { t: 'older', ...this.chatPage(msg.before) });
        return;
      }
      case 'send': {
        const id = msg.id;
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, CHAT_TEXT_MAX) : '';
        const images = parseChatImages(msg.images, this.userName, s, this.t);
        if (!images.ok) { this.chat.send(socket, { t: 'rejected', id, reason: images.reason }); return; }
        if (!text && images.blobs.length === 0) return;
        if (!host) { this.chat.send(socket, { t: 'rejected', id, reason: s.offline }); return; }
        const e = await this.push('desktop-pet.message', 'desktop-pet.chat', this.t.typed(this.userName, text), 'preempt',
          { meta: { via: 'chat', text }, ...(images.blobs.length ? { blobs: images.blobs } : {}) });
        this.chat.send(socket, e ? { t: 'sent', id, cursor: e.cursor } : { t: 'rejected', id, reason: s.notSent });
        // the pet shows it beside Coo, as it shows what is typed or said there
        if (e) this.server.sendPet({ t: 'said', via: 'chat', text, images: images.blobs.length, cursor: e.cursor });
        return;
      }
      case 'now': {
        if (!host?.promotePending || typeof msg.cursor !== 'number') return;
        await host.promotePending(msg.cursor, 'interrupt');
        return;
      }
      case 'withdraw': {
        const cursor = msg.cursor;
        if (!host?.withdrawPending || typeof cursor !== 'number') return;
        if (!await host.withdrawPending(cursor)) {
          this.chat.send(socket, { t: 'notice', text: s.tooLate });
          return;
        }
        this.pendingChat.delete(cursor);
        void this.record({ kind: 'withdrawn', cursor }, `撤回了 #${cursor}`);
        this.chat.broadcast({ t: 'withdrawn', cursor });
        this.server.sendPet({ t: 'said-withdrawn', cursor });
        return;
      }
      case 'answer': return this.onAnswer(msg, 'chat');
    }
  }

  /**
   * The chat items of the last CHAT_PAGE_EVENTS events of this World, or of those before `before`,
   * and the records among them about messages further back.
   */
  private chatPage(before?: number): { items: ReturnType<typeof chatHistory>; refs: ReturnType<typeof chatRefs>; more: boolean; before: number | null } {
    const events = this.host!.store.range({ source: this.id, limit: CHAT_PAGE_EVENTS, ...(before !== undefined ? { toCursor: before - 1 } : {}) });
    const more = events.length === CHAT_PAGE_EVENTS;
    const first = events[0]?.cursor ?? 0;
    const refs = chatRefs(events);
    return {
      items: chatHistory(events),
      refs: { withdrawn: refs.withdrawn.filter((c) => c < first), delivered: refs.delivered.filter(([c]) => c < first) },
      more, before: more ? first : null,
    };
  }

  /** The open question changed: pages let only the one still open be answered. */
  private setAsk(ask: PendingAsk | null): void {
    this.ask = ask;
    this.chat.broadcast({ t: 'ask', askId: ask?.id ?? null });
  }

  /* ---------- window ---------- */

  get petUrl(): string {
    return `${this.server.origin}/pet`;
  }

  openWindow(): void {
    if (!this.windowHost || !this.server.port) return;
    const managed = this.store.electron.executable();
    this.windowHost.start(resolveHostCommand(this.server.windowUrl, this.cfg.window.electronFile, managed, this.t.window));
  }

  /* ---------- page protocol ---------- */

  private snapshot(): Record<string, unknown> {
    return {
      skin: this.cfg.skin,
      roam: this.quiet?.roam ?? this.cfg.roam,
      sound: this.quiet?.sound ?? this.cfg.sound,
      sounds: this.cfg.sounds,
      speech: speechFor(this.cfg.speech),
      theme: this.cfg.theme,
      rememberPosition: this.cfg.rememberPosition,
      // read by the page from `init` only
      startX: this.cfg.rememberPosition ? this.cfg.petX : null,
      startY: this.cfg.rememberPosition ? this.cfg.petY : null,
      hoverButtons: hoverButtonList(this.cfg.hoverButtons),
      doubleClickChat: this.cfg.doubleClickChat,
      scale: this.cfg.window.scale,
      bubbleSize: this.cfg.window.bubbleSize,
      fontSize: this.cfg.window.fontSize,
      bubbleSpeed: this.cfg.window.bubbleSpeed,
      glow: this.cfg.window.glow,
      frameRate: this.cfg.window.frameRate,
      lockFrameRate: this.cfg.window.lockFrameRate,
      hideWhenFullscreen: this.cfg.window.hideWhenFullscreen,
      language: this.appLanguage,
      user: this.userName,
      mic: this.micOpen(),
      voice: this.voiceBrief(),
      micDevice: this.cfg.asr.mic.deviceId,
      status: this.status.status,
      statusBubble: this.cfg.statusBubble,
      saidBubbles: this.cfg.saidBubbles,
      bot: this.botInfo(),
    };
  }

  private botName(): string {
    return this.opts.botName?.() ?? '';
  }

  private botInfo(): Record<string, unknown> {
    const c = this.opts.controls;
    let avatar: string | null = null;
    try { if (this.opts.avatarFile) avatar = String(statSync(this.opts.avatarFile).mtimeMs); } catch { /* no avatar yet */ }
    const pause = !!(c?.isPaused && c.setPaused);
    const label = typeof c?.quitLabel === 'function' ? c.quitLabel() : c?.quitLabel;
    const quitLabel = c?.quit ? label || this.ui.menu.quit : '';
    return {
      name: this.botName(),
      avatar,
      controls: !!c,
      buttons: { pause, settings: !!c?.openSettings, dress: !!c?.openDress, quit: !!c?.quit, chat: !!c?.openChat },
      // the typing box warns, as the chat page does, that the model gets only the count of pasted images
      imagesSeen: this.host?.modelFacts.accepts('image/jpeg') ?? false,
      paused: pause && c?.isPaused ? c.isPaused() : null,
      quitLabel,
      quitPrompt: quitLabel ? this.ui.menu.quitPrompt(quitLabel) : '',
    };
  }

  private prefsSignature(): string {
    const s = this.snapshot();
    delete s.status;
    // a talk key that opens the microphone sends each change by itself (setMicHeld): the signature keeps only that it does
    if (this.micOnPress()) s.mic = 'press';
    return JSON.stringify(s);
  }

  /** Config is a live object edited by the console; changes reach the pages within PREFS_SYNC_MS. */
  private syncPrefs(): void {
    this.segmenter.configure(this.segmentConfig());
    const turnedOn = this.cfg.asr.enabled && !this.voiceEnabled;
    this.voiceEnabled = this.cfg.asr.enabled;
    if (!this.cfg.asr.enabled && this.runningEngine) void this.stopVoiceBackend();
    else if (turnedOn || (this.cfg.asr.enabled && this.runningEngine && this.runningEngine !== this.engine())) void this.startVoiceBackend();
    // the system recognizer serves one language; a new one needs a new helper
    else if (this.cfg.asr.enabled && this.runningEngine === 'system' && this.system?.languageChanged) void this.startVoiceBackend();
    // the transcription service starts again for a new address or model, a failed one included; `setApi` starts it for a new API Key
    else if (this.cfg.asr.enabled && this.runningEngine === 'api' && this.api?.configChanged) void this.startVoiceBackend();
    // FunASR and Whisper load the model for one language and thread count
    else if (this.cfg.asr.enabled && this.runningEngine && this.runningEngine !== 'system' && this.runningEngine !== 'api' && this.sherpa(this.runningEngine)?.configChanged) void this.startVoiceBackend();
    // computer use switched off ends the engine process; the next call after it is switched on starts another
    if (this.cuaSeen && !this.cfg.cua.enabled) void this.cua.switchedOff();
    this.cuaSeen = this.cfg.cua.enabled;
    void this.syncHotkey();
    void this.syncTypeKey();
    // the person changed what a quiet holds back: theirs wins
    if (this.quiet && (this.cfg.sound !== this.quiet.base.sound || this.cfg.roam !== this.quiet.base.roam)) this.endQuiet();
    this.server.syncOverlay();
    const paused = this.opts.controls?.isPaused?.() ?? false;
    if (paused !== this.pausedShown) { this.pausedShown = paused; this.chat.broadcast({ t: 'paused', paused }); }
    const bot = this.botName();
    if (bot !== this.botShown) { this.botShown = bot; this.chat.broadcast({ t: 'bot', bot }); }
    const key = this.prefsSignature();
    if (key === this.prefsKey) return;
    this.prefsKey = key;
    this.server.broadcast({ t: 'prefs', ...this.snapshot() });
  }

  private micWanted(): boolean {
    const phase = this.backendState()?.phase;
    return this.cfg.asr.enabled && (phase === 'running');
  }

  /** Hold mode with `asr.mic.openOnPress`: the microphone is open only around a held talk key. */
  private micOnPress(): boolean {
    return this.cfg.asr.mic.mode === 'hold' && this.cfg.asr.mic.openOnPress;
  }

  /** The pet page keeps the microphone open: whenever voice input can hear, or only around a held talk key (`micOnPress`). */
  private micOpen(): boolean {
    return this.micWanted() && (!this.micOnPress() || this.micHeld);
  }

  private setMicHeld(on: boolean): void {
    if (this.micReleaseTimer) clearTimeout(this.micReleaseTimer);
    this.micReleaseTimer = null;
    if (this.micHeld === on) return;
    this.micHeld = on;
    this.server.sendPet({ t: 'prefs', mic: this.micOpen() });
  }

  private releaseMicSoon(): void {
    if (!this.micHeld || this.micReleaseTimer) return;
    this.micReleaseTimer = setTimeout(() => this.setMicHeld(false), MIC_RELEASE_MS);
  }

  /** What the pet's microphone button shows: switched on, able to hear, and why not. */
  private voiceBrief(): Record<string, unknown> {
    const b = this.backendState();
    const ready = b?.phase === 'running';
    return {
      enabled: this.cfg.asr.enabled,
      ready,
      detail: ready ? null : b?.phase === 'starting' ? this.ui.voice.starting : b?.detail ?? this.ui.voice.notRunning,
      hint: this.talkHint(),
      mode: this.cfg.asr.mic.mode,
      key: hotkeyBadge(this.cfg.asr.mic.hotkey),
    };
  }

  private saveSkin(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const skin = raw as PetSkin;
    this.opts.persist({ skin });
    this.syncPrefs();
  }

  private savePrefs(prefs: Record<string, unknown>): void {
    const patch: DeepPartial<DesktopPetConfigSection> = {};
    if (prefs.roam === 'free' || prefs.roam === 'calm' || prefs.roam === 'off') patch.roam = prefs.roam as RoamMode;
    if (typeof prefs.sound === 'boolean') patch.sound = prefs.sound;
    // the menu's sound or roam button during a quiet: the person's choice, kept, and the quiet is over
    if (this.quiet && (patch.roam !== undefined || patch.sound !== undefined)) this.endQuiet();
    if (prefs.theme === 'dark' || prefs.theme === 'light') patch.theme = prefs.theme as PetTheme;
    if (typeof prefs.mic === 'boolean') patch.asr = { enabled: prefs.mic };
    if (Array.isArray(prefs.hoverButtons)) {
      const ids = prefs.hoverButtons.filter((id): id is string => typeof id === 'string' && (PET_ACTIONS as readonly string[]).includes(id));
      patch.hoverButtons = hoverButtonList(ids.slice(0, MAX_HOVER_BUTTONS).join(',')).join(',');
    }
    const mic = prefs.micSettings as Record<string, unknown> | undefined;
    if (mic && typeof mic === 'object') {
      const m: { mode?: MicMode; hotkey?: string; deviceId?: string; openOnPress?: boolean } = {};
      if (mic.mode === 'hold' || mic.mode === 'toggle' || mic.mode === 'always') m.mode = mic.mode;
      if (typeof mic.hotkey === 'string' && parseHotkey(mic.hotkey)) m.hotkey = mic.hotkey;
      if (typeof mic.deviceId === 'string') m.deviceId = mic.deviceId;
      if (typeof mic.openOnPress === 'boolean') m.openOnPress = mic.openOnPress;
      patch.asr = { ...patch.asr, mic: m };
    }
    if (Object.keys(patch).length) this.opts.persist(patch);
    if (typeof prefs.mic === 'boolean' && prefs.mic) void this.startVoiceBackend();
    this.syncPrefs();
  }

  /**
   * Called only from `stop`, so config.json changes at most once a run: with `rememberPosition` on it
   * stores the last reported position, with it off it clears a stored one. A failed write leaves
   * the stored position as it was.
   */
  private savePosition(): void {
    const x = this.cfg.rememberPosition ? this.standX ?? this.cfg.petX : null;
    // a report without y comes from a body on the floor, which clears a saved height
    const y = !this.cfg.rememberPosition ? null : this.standX === null ? this.cfg.petY : this.standY;
    if (x === this.cfg.petX && y === this.cfg.petY) return;
    try {
      this.opts.persist({ petX: x, ...(y !== this.cfg.petY ? { petY: y } : {}) });
    } catch (err) {
      this.log?.warn(`桌宠位置没有保存:${(err as Error).message}`);
    }
  }

  private onPage(msg: PageMessage): void {
    switch (msg.t) {
      case 'figure': return this.onFigure(msg);
      case 'hello': {
        const s = msg.screen as { w?: unknown; h?: unknown } | undefined;
        if (s && typeof s.w === 'number' && typeof s.h === 'number') this.screen = { w: s.w, h: s.h };
        return;
      }
      case 'arrived':
      case 'interrupted': {
        const w = this.walks.get(String(msg.walkId));
        if (!w) return;
        this.walks.delete(String(msg.walkId));
        clearTimeout(w.timer);
        const t = this.t;
        const at = (typeof msg.x === 'number' ? pct(msg.x) : '?') + (typeof msg.y === 'number' ? t.downAt(pct(msg.y)) : '');
        // what stopped a figure's own move is its body's word, kept short
        const by = String(msg.by).slice(0, 40);
        const name = w.target;
        w.resolve(msg.t === 'arrived' ? (name === undefined ? t.walkArrived(at) : t.moveArrived(name, at))
          : w.stopping ? (name === undefined ? t.walkStopped(at) : t.moveStopped(name, at))
          : msg.by === 'drag' ? (name === undefined ? t.walkGrabbed(at, this.userName) : t.moveGrabbed(name, at, this.userName))
          : name === undefined ? t.walkReplaced(at, by) : t.moveFailed(name, at, by));
        return;
      }
      case 'answer': return this.onAnswer(msg, 'pet');
      case 'visibility': this.petHidden = msg.hidden === true; return;
      case 'text': {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
        const images = parseChatImages(msg.images, this.userName, petText(this.appLanguage).chat, this.t);
        if (!images.ok) { this.log?.warn(`打字框发来的图片没有收下:${images.reason}`); return; }
        if (!text && images.blobs.length === 0) return;
        void this.push('desktop-pet.message', 'desktop-pet.text', this.t.typed(this.userName, text), 'preempt',
          { meta: { via: 'bubble', text }, ...(images.blobs.length ? { blobs: images.blobs } : {}) });
        return;
      }
      case 'expand': {
        const text = typeof msg.text === 'string' ? msg.text.slice(0, CHAT_TEXT_MAX) : '';
        const images = draftImages(msg.images);
        this.draft = { text, images };
        if (this.chat.size) { this.chat.broadcast({ t: 'draft', text, images }); this.draft = null; }
        this.opts.controls?.openChat?.();
        return;
      }
      case 'touch': return this.onTouch(msg);
      case 'mic': {
        this.micState = { state: String(msg.state), detail: typeof msg.detail === 'string' ? msg.detail : null };
        // a closed microphone sends no more frames: the meter drops to silence
        if (this.micState.state !== 'on') {
          this.level = -100;
          this.voiceFrame({ type: 'level', level: this.level, speaking: false, open: this.gateOpen() });
        }
        return;
      }
      case 'prefs': return this.savePrefs(msg);
      case 'position': {
        if (typeof msg.x !== 'number' || !Number.isFinite(msg.x)) return;
        this.standX = Math.min(1, Math.max(0, msg.x));
        this.standY = typeof msg.y === 'number' && Number.isFinite(msg.y) ? Math.min(1, Math.max(0, msg.y)) : null;
        return;
      }
      case 'devices': {
        const list = Array.isArray(msg.list) ? msg.list : [];
        this.devices = list
          .filter((d): d is { id: string; label: string } => !!d && typeof (d as { id?: unknown }).id === 'string')
          .map((d) => ({ id: d.id, label: typeof d.label === 'string' ? d.label : '' }));
        return;
      }
      case 'confirmed': {
        const c = this.confirms.get(String(msg.id));
        if (!c) return;
        this.confirms.delete(String(msg.id));
        clearTimeout(c.timer);
        c.resolve(msg.index === 0 ? 'yes' : msg.index === c.choices - 1 ? 'no' : msg.index === 1 ? 'always' : 'dismissed');
        return;
      }
      case 'control': return this.onControl(String(msg.action));
      case 'dialog': {
        const settle = this.dialogs.get(String(msg.id));
        if (!settle) return;
        this.dialogs.delete(String(msg.id));
        settle(typeof msg.index === 'number' ? { index: msg.index }
          : typeof msg.text === 'string' ? { text: msg.text.slice(0, 2000) }
          : msg.alt ? { alt: true } : msg.closed ? { closed: true } : { done: true });
        return;
      }
      case 'commit': return this.commitSpeech();
      case 'cancel': return this.cancelSpeech();
    }
  }

  private onControl(action: string): void {
    const c = this.opts.controls;
    if (!c) return;
    if (action === 'pause' || action === 'resume') c.setPaused?.(action === 'pause');
    else if (action === 'settings') c.openSettings?.();
    else if (action === 'dress') c.openDress?.();
    else if (action === 'quit') c.quit?.();
    this.syncPrefs();
  }

  /**
   * Asks the person in a bubble with two choices, the first one meaning yes, or three, the middle one
   * meaning yes and from now on. Answers never reach the bot as events; the caller gets them.
   */
  confirm(question: string, choices: [yes: string, no: string] | [yes: string, always: string, no: string]): Promise<ConfirmResult> {
    const id = nextId('k');
    if (!this.server.sendPet({ t: 'confirm', id, question, options: choices })) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.confirms.delete(id); resolve('timeout'); }, CONFIRM_TIMEOUT_MS);
      this.confirms.set(id, { resolve, timer, choices: choices.length });
    });
  }

  /**
   * Shows one step of a conversation in the bubble; see `PetDialog`. Nothing reaches the bot: the
   * caller gets the answer. Steps wait for as long as the person takes; a step with nothing to
   * answer ends once its line has been read.
   */
  dialog(d: PetDialog): PetDialogHandle {
    const id = nextId('d');
    const vocab = this.vocab();
    const { actions } = parseActions(d.actions ?? [], vocab);
    // a card's words go through the same vocabulary as the line's
    const input = d.input?.kind === 'choices'
      ? { ...d.input, options: d.input.options.map((o) => (o.actions ? { ...o, actions: parseActions(o.actions, vocab).actions } : o)) }
      : d.input;
    let settle: (a: PetDialogAnswer) => void = () => {};
    const answer = new Promise<PetDialogAnswer>((resolve) => { settle = resolve; });
    if (!this.server.sendPet({ t: 'dialog', id, ...d, input, actions })) settle({ unavailable: true });
    else this.dialogs.set(id, settle);
    // a page that never reports back (a tab put to sleep) does not hold a line with nothing to answer forever
    if (!d.input && this.dialogs.has(id)) {
      const timer = setTimeout(() => this.dialogs.get(id)?.({ done: true }), 5000 + d.text.length / DIALOG_CPS * 1000);
      void answer.finally(() => { clearTimeout(timer); this.dialogs.delete(id); });
    }
    return {
      answer,
      update: (patch) => { if (this.dialogs.has(id)) this.server.sendPet({ t: 'dialog-update', id, ...patch }); },
      close: () => {
        const s = this.dialogs.get(id);
        this.dialogs.delete(id);
        this.server.sendPet({ t: 'dialog-close', id });
        s?.({ done: true });
      },
    };
  }

  /** Dresses the body in `patch` over the skin as it is, and saves it, as a pick on the dressing page does. */
  dress(patch: Partial<PetSkin>): void {
    this.saveSkin({ ...this.cfg.skin, ...patch });
  }

  private onPageGone(): void {
    this.log?.info('桌宠页面断开');
    for (const [id, d] of this.dialogs) { d({ unavailable: true }); this.dialogs.delete(id); }
    for (const [id, w] of this.walks) { clearTimeout(w.timer); w.resolve(this.t.walkWindowGone); this.walks.delete(id); }
    for (const [id, c] of this.confirms) { clearTimeout(c.timer); c.resolve('unavailable'); this.confirms.delete(id); }
    this.segmenter.flush();
    if (this.wasSpeaking) this.wasSpeaking = false;
  }

  /** An answer from the pet's bubble or the chat page; an answer from the page closes the bubble. */
  private onAnswer(msg: Record<string, unknown>, from: 'pet' | 'chat'): void {
    const ask = this.ask;
    if (!ask || ask.id !== msg.askId) return;
    const t = this.t;
    if (msg.dismissed) {
      this.setAsk(null);
      void this.push('desktop-pet.answer', 'desktop-pet.answer', t.answerClosed(this.userName, ask.question), 'debounce', { meta: { askId: ask.id, dismissed: true } });
      return;
    }
    const index = typeof msg.index === 'number' && ask.options[msg.index] !== undefined ? msg.index : null;
    const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
    if (index === null && !text) return;
    this.setAsk(null);
    if (from === 'chat') this.server.sendPet({ t: 'ask-close', id: ask.id });
    const line = index !== null
      ? t.answerPicked(this.userName, ask.question, index + 1, ask.options[index]!)
      : t.answerWrote(this.userName, ask.question, text);
    void this.push('desktop-pet.answer', 'desktop-pet.answer', line, 'flush',
      { meta: { askId: ask.id, ...(index !== null ? { index } : { text }) } });
  }

  private onTouch(msg: PageMessage): void {
    if (!this.cfg.touch.enabled) return;
    const kind = String(msg.kind);
    if (kind === 'grab') return;
    if (kind === 'crash' && this.touch && (this.touch.kind === 'throw' || this.touch.kind === 'drop')) {
      this.touch.crashed = true;
      return;
    }
    if (this.touch && this.touch.kind === kind && kind !== 'throw' && kind !== 'drop') {
      this.touch.count++;
      this.touch.woke ||= msg.woke === true;
      clearTimeout(this.touch.timer);
      this.touch.timer = setTimeout(() => this.flushTouch(), TOUCH_MERGE_MS);
      return;
    }
    if (this.touch) this.flushTouch();
    this.touch = {
      kind, count: 1, woke: msg.woke === true, asleep: msg.asleep === true, crashed: false,
      x: typeof msg.x === 'number' ? msg.x : null,
      timer: setTimeout(() => this.flushTouch(), TOUCH_MERGE_MS),
    };
  }

  private flushTouch(): void {
    const t = this.touch;
    this.touch = null;
    if (!t) return;
    clearTimeout(t.timer);
    const u = this.userName;
    const m = this.t;
    let text: string;
    switch (t.kind) {
      case 'poke': text = t.woke ? m.pokedAwake(u) : m.poked(u, t.count); break;
      case 'pet': text = t.asleep ? m.pettedAsleep(u) : m.petted(u, t.count); break;
      case 'throw': text = m.thrown(u, t.crashed); break;
      case 'drop': text = m.dropped(u, t.x !== null && this.screen ? pct(t.x / this.screen.w) : null, t.crashed); break;
      case 'crash': text = m.crashed; break;
      default: return;
    }
    const wakes = !this.touchWoke && touchWakes(this.cfg.touch, t.kind);
    if (wakes) this.touchWoke = true;
    void this.push('desktop-pet.touch', 'desktop-pet.touch', m.touch(text), wakes ? 'debounce' : 'piggyback',
      { meta: { touch: { kind: t.kind, count: t.count, woke: t.woke, crashed: t.crashed } } });
  }

  /**
   * The person's local time an event happened, before its text: `[HH:MM] `, and `[MM-DD <weekday> HH:MM] ` for the
   * first event of a run and the first on a new date, so the bot knows the date without a clock in its prefix.
   * The weekday is short, in the model-text language (周日, Sun).
   */
  private stamp(now = new Date()): string {
    const parts = Object.fromEntries(new Intl.DateTimeFormat(this.t.dateLocale, { timeZone: this.opts.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(now).map((p) => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const time = shortTime(this.opts.timezone, now);
    if (day === this.stampDay) return `[${time}] `;
    this.stampDay = day;
    return `[${parts.month}-${parts.day} ${parts.weekday} ${time}] `;
  }

  /**
   * Delivers an event to the bot. `meta` carries what the chat page shows of it; the person's
   * messages stay pending on the page until Core reports them delivered.
   */
  private async push(
    type: string, senderKey: string, text: string, trigger: TriggerMode,
    extra: { meta?: Record<string, unknown>; blobs?: BlobInput[] } = {},
  ): Promise<EventEnvelope | null> {
    const host = this.host;
    if (!host) return null;
    try {
      const e = await host.pushEvent({ type, source: this.id, senderKey, ts: nowIso(this.opts.timezone), text: this.stamp() + text, ...extra }, { trigger });
      const item = chatItem(e);
      if (!item) return e;
      const pending = item.kind === 'user' && e.contextDelivery === 'deliver';
      if (pending) this.pendingChat.add(e.cursor);
      this.chat.broadcast({ t: 'item', item, ...(pending ? { pending: true } : {}) });
      return e;
    } catch (err) {
      this.log?.warn(`事件没能送出:${(err as Error).message}`);
      return null;
    }
  }

  /** Stores what the pet said or did for the chat page; never delivered to the bot. Resolves to its cursor. */
  private async record(meta: Record<string, unknown>, text: string, blobs: BlobInput[] = []): Promise<number | null> {
    const host = this.host;
    if (!host) return null;
    try {
      const e = await host.pushEvent({ type: SELF_TYPE, source: this.id, senderKey: SELF_TYPE, ts: nowIso(this.opts.timezone), text, meta, ...(blobs.length ? { blobs } : {}) }, { deliver: false });
      const item = chatItem(e);
      if (item) this.chat.broadcast({ t: 'item', item });
      return e.cursor;
    } catch (err) {
      this.log?.warn(`对话记录没能保存:${(err as Error).message}`);
      return null;
    }
  }

  /* ---------- voice ---------- */

  /** The model files of a sherpa-onnx engine, or why they are not there. */
  private sherpaModel(engine: SherpaEngine): { paths: Record<string, string> } | { missing: string } {
    const slot = this.store[engine];
    if (slot.state().phase !== 'ready') return { missing: this.ui.voice.modelMissing(Math.round(slot.bytes / 1048576)) };
    return { paths: slot.paths() };
  }

  /** The engine in force (`asrEngineFor`). */
  engine(): AsrEngine {
    return asrEngineFor(this.cfg.asr.engine, this.appLanguage, systemRecognizerSupported());
  }

  /** The sherpa-onnx engine whose model voice input downloads: the one in force, else the app language's. */
  private modelEngine(): SherpaEngine {
    const engine = this.engine();
    return engine === 'system' || engine === 'api' ? asrEngineFor('', this.appLanguage, false) as SherpaEngine : engine;
  }

  private sherpa(engine: SherpaEngine): SherpaAsr | null {
    return engine === 'whisper' ? this.whisper : this.funasr;
  }

  private recognizer(engine = this.engine()): SherpaAsr | SystemRecognizer | TranscriptionApi | null {
    return engine === 'system' ? this.system : engine === 'api' ? this.api : this.sherpa(engine);
  }

  /** The recognition language: the set one, else the app language's ISO 639-1 code; FunASR and Whisper read a code they do not take as `auto`. */
  private asrLanguage(): string {
    return this.cfg.asr.language || this.appLanguage.split('-')[0]!;
  }

  private backendState(): BackendState | null {
    return this.recognizer()?.state() ?? null;
  }

  /** Starts the engine in force and stops the one that ran before. */
  async startVoiceBackend(): Promise<BackendState | null> {
    const generation = this.voiceGeneration;
    await this.voiceStopping;
    if (generation !== this.voiceGeneration || !this.cfg.asr.enabled) return this.backendState();
    const engine = this.engine();
    const recognizer = this.recognizer(engine);
    if (!recognizer) return null;
    if (this.runningEngine !== engine) {
      if (this.runningEngine) await this.recognizer(this.runningEngine)?.stop();
      if (generation !== this.voiceGeneration || !this.cfg.asr.enabled || engine !== this.engine()) return this.backendState();
      this.runningEngine = engine;
    }
    await recognizer.start();
    if (generation === this.voiceGeneration) this.syncPrefs();
    return this.backendState();
  }

  private stopVoiceBackend(): Promise<void> {
    this.voiceGeneration++;
    if (this.voiceStopping) return this.voiceStopping;
    const engine = this.runningEngine;
    this.runningEngine = null;
    const stopped = ((engine ? this.recognizer(engine)?.stop() : undefined) ?? Promise.resolve()).finally(() => {
      this.voiceStopping = null;
      this.syncPrefs();
    });
    this.voiceStopping = stopped;
    return stopped;
  }

  /* ---------- talk key ---------- */

  /** Audio reaches the segmenter only while this is true. */
  private gateOpen(): boolean {
    return this.cfg.asr.mic.mode === 'always' || this.talking;
  }

  /**
   * While the talk key is held everything counts as speech: the segmenter never waits for a
   * loud onset or cuts at a pause, and releasing the key ends the utterance.
   */
  private segmentConfig(): SegmentConfig {
    const seg = this.cfg.asr.segment;
    return this.cfg.asr.mic.mode === 'hold' ? { ...seg, thresholdDb: -Infinity, minSpeechMs: 0 } : seg;
  }

  /** Starts, restarts or stops the key watcher to match the configured mode and key. */
  private async syncHotkey(): Promise<void> {
    const { mode, hotkey } = this.cfg.asr.mic;
    const key = mode === 'always' || !this.host ? '' : `${mode}:${hotkey}`;
    if (key === this.hotkeyKey) return;
    this.hotkeyKey = key;
    this.keyWatcher?.stop();
    this.keyWatcher = null;
    this.hotkeyProblem = null;
    this.setTalking(false);
    if (!key) return;
    const parsed = parseHotkey(hotkey);
    const watch = this.opts.watchHotkey ?? watchHotkey;
    const watcher = parsed ? await watch(parsed, (down) => this.onTalkKey(down), HOTKEY_POLL_MS, () => this.onTalkTap(), this.ui.hotkey) : this.ui.voice.badKey(hotkey);
    if (key !== this.hotkeyKey) { if (typeof watcher !== 'string') watcher.stop(); return; }
    if (typeof watcher === 'string') {
      this.hotkeyProblem = watcher;
      this.log?.warn(`说话键不可用,暂不识别说话:${watcher}`);
    } else this.keyWatcher = watcher;
  }

  /** Starts, restarts or stops the typing key's watcher to match `typeKey`; a press opens the pet's typing box. */
  private async syncTypeKey(): Promise<void> {
    const { enabled, hotkey } = this.cfg.typeKey;
    const key = enabled && this.host ? hotkey : '';
    if (key === this.typeKeyKey) return;
    this.typeKeyKey = key;
    this.typeWatcher?.stop();
    this.typeWatcher = null;
    this.typeKeyProblem = null;
    if (!key) return;
    const parsed = parseHotkey(hotkey);
    const watch = this.opts.watchHotkey ?? watchHotkey;
    const text = { ...this.ui.hotkey, ...this.ui.typeKey };
    // a hidden pet stays hidden: its typing box would open out of sight
    const onPress = (down: boolean) => { if (down && !this.petHidden) this.server.sendPet({ t: 'type' }); };
    const watcher = parsed ? await watch(parsed, onPress, HOTKEY_POLL_MS, undefined, text) : this.ui.voice.badKey(hotkey);
    if (key !== this.typeKeyKey) { if (typeof watcher !== 'string') watcher.stop(); return; }
    if (typeof watcher === 'string') {
      this.typeKeyProblem = watcher;
      this.log?.warn(`打字键不可用:${watcher}`);
    } else this.typeWatcher = watcher;
  }

  /** One line telling the person how to be heard. */
  private talkHint(): string {
    const { hotkey } = this.cfg.asr.mic;
    const ui = this.ui, v = ui.voice;
    const key = comboLabel(hotkey, process.platform, ui), { taps } = splitTaps(hotkey);
    const mode = this.cfg.asr.mic.mode;
    if (mode === 'always') return v.always;
    if (this.hotkeyProblem) return v.keyProblem(this.hotkeyProblem);
    if (mode === 'toggle') return taps > 1 ? v.toggleTaps(hotkeyLabel(hotkey, process.platform, ui), taps) : v.toggle(key);
    return taps > 1 ? v.holdTaps(key, taps) : v.hold(key);
  }

  /** A quick tap before the held press: the pet perks up, so the hold that follows feels answered at once. */
  private onTalkTap(): void {
    if (this.talking || !this.cfg.asr.enabled || !this.micWanted()) return;
    this.server.sendPet({ t: 'listen', phase: 'ready' });
  }

  private onTalkKey(down: boolean): void {
    if (this.cfg.asr.mic.mode === 'hold') this.setTalking(down);
    else if (down) this.setTalking(!this.talking);
  }

  private setTalking(on: boolean): void {
    if (this.talking === on) return;
    this.talking = on;
    this.voiceFrame({ type: 'gate', open: on });
    if (!on) this.releaseMicSoon();
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    if (on) {
      this.listenOpen = true;
      // the microphone opens only now: the first frame that reaches the World starts the listening (onAudio)
      if (this.micOnPress()) this.setMicHeld(true);
      else this.server.sendPet({ t: 'listen', phase: 'start' });
      return;
    }
    const tail = this.segmenter.flush();
    if (tail) this.enqueue(tail);
    this.wasSpeaking = false;
    this.schedulePack();
  }

  /**
   * The listening bubble's cancel button (hold and toggle): what the bubble shows is dropped,
   * nothing goes to the bot, and the bubble closes. A held talk key's release that follows finds
   * nothing to send; a switched-on one is switched off.
   */
  private cancelSpeech(): void {
    if (this.cfg.asr.mic.mode === 'always' || (!this.talking && !this.listenOpen)) return;
    if (this.talking) {
      this.talking = false;
      this.voiceFrame({ type: 'gate', open: false });
      this.releaseMicSoon();
    }
    this.segmenter.flush();
    this.queue.length = 0;
    this.cancels++;
    this.packer.take();
    this.committing = false;
    this.partial = '';
    this.wasSpeaking = false;
    if (this.listenOpen) {
      this.listenOpen = false;
      this.server.sendPet({ t: 'listen', phase: 'none' });
    }
    this.log?.info('倾听气泡里点了取消,这次收音已丢弃');
  }

  /**
   * The pet's microphone button, held down: what was heard so far goes out now. The sentence
   * in progress is cut, and delivery waits only for transcription, not for the closing pause.
   * A switched-on talk key (toggle) is switched off: that sentence is finished.
   */
  private commitSpeech(): void {
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    this.committing = true;
    if (this.cfg.asr.mic.mode === 'toggle' && this.talking) this.setTalking(false);
    else {
      const tail = this.segmenter.flush();
      if (tail) this.enqueue(tail);
      this.wasSpeaking = false;
    }
    this.schedulePack();
  }

  private enqueue(u: Utterance): void {
    this.counts.utterances++;
    this.queue.push(u);
    this.server.sendPet({ t: 'listen', phase: 'transcribing' });
    void this.drain();
  }

  private onAudio(frame: Int16Array): void {
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    const open = this.gateOpen();
    if (open) for (const u of this.segmenter.push(frame)) this.enqueue(u);
    this.level = open ? this.segmenter.level : rmsDb(frame);
    const speaking = open && this.segmenter.active;
    if (speaking && !this.wasSpeaking) this.server.sendPet({ t: 'listen', phase: 'start' });
    this.wasSpeaking = speaking;
    const now = Date.now();
    if (now - this.lastLevelAt >= 100) {
      this.lastLevelAt = now;
      this.voiceFrame({ type: 'level', level: this.level, speaking, open });
    }
    if (open) this.schedulePack();
  }

  private async drain(): Promise<void> {
    if (this.transcribing) return;
    this.transcribing = true;
    try {
      while (this.queue.length) {
        const u = this.queue.shift()!;
        const cancels = this.cancels;
        const recognizer = this.recognizer();
        const res = u.result
          ? await u.result
          : recognizer
            ? await recognizer.transcribe(u.pcm)
            : { text: '', ms: 0, error: this.ui.voice.notRunning };
        if (cancels !== this.cancels) continue;
        let text = res.text;
        if (this.simplifies) text = toSimplified(text);
        if (res.error || looksHallucinated(text)) {
          this.counts.dropped++;
          this.remember({ text: res.error ? this.ui.voice.failedLine(res.error) : text, at: Date.now(), ms: res.ms, dropped: true });
          this.voiceFrame({ type: 'dropped', text: res.error ?? text, ms: res.ms });
          // the page was showing this sentence as it was heard: take it back
          if (u.result) this.showHeard();
          continue;
        }
        this.packer.add(text);
        this.remember({ text, at: Date.now(), ms: res.ms });
        this.voiceFrame({ type: 'text', text, ms: res.ms });
        this.pendingText(text);
        this.showHeard();
      }
    } finally {
      this.transcribing = false;
    }
    this.schedulePack();
  }

  private partial = '';
  private pendingText(add: string): string {
    this.partial = joinSpeech([this.partial, add]);
    return this.partial;
  }

  /* ---------- hearing as it is spoken ---------- */

  /** The sentence the recognizer is hearing now, and what it has made of it so far. */
  private sentence: SystemSentence | null = null;
  private interim = '';

  /** The segmenter hands each sentence's audio over as it arrives when the engine can take it. */
  private readonly sink: SegmentSink = {
    begin: (frames) => {
      this.sentence = null;
      this.interim = '';
      const recognizer = this.recognizer();
      if (!recognizer) return;
      const s: SystemSentence | null = recognizer.sentence((text) => {
        if (this.sentence !== s) return;
        this.interim = this.simplifies ? toSimplified(text) : text;
        this.showHeard();
      });
      this.sentence = s;
      if (s) for (const f of frames) s.write(f);
    },
    frame: (f) => this.sentence?.write(f),
    end: (kept) => {
      const s = this.sentence;
      this.sentence = null;
      if (!s) return undefined;
      const result = s.end();
      if (!kept && this.interim) { this.interim = ''; this.showHeard(); }
      else this.interim = '';
      return kept ? result : undefined;
    },
  };

  /** The listening bubble: sentences already transcribed, then the one being heard, greyed. */
  private showHeard(): void {
    this.server.sendPet({ t: 'listen', phase: 'partial', text: this.partial, interim: this.interim });
  }

  /** Delivers the packed text once nothing upstream is still open. */
  private schedulePack(): void {
    const upstream = this.transcribing || this.queue.length > 0;
    // a commit does not wait for the closing pause, nor for speech begun after it
    const hold = upstream || (!this.committing && (this.segmenter.active || this.segmenter.settleRemainingMs > 0));
    const text = this.committing && !upstream ? this.packer.take() : this.packer.due(hold);
    if (this.committing && !upstream && !text) {
      // nothing was heard: the committed episode closes empty, unless the talk key still holds it open
      this.committing = false;
      if (this.listenOpen && !this.talking && !this.segmenter.active) {
        this.listenOpen = false;
        this.partial = '';
        this.server.sendPet({ t: 'listen', phase: 'none' });
      }
    }
    if (text) {
      this.committing = false;
      this.partial = '';
      this.listenOpen = false;
      this.counts.delivered++;
      this.server.sendPet({ t: 'listen', phase: 'heard', text });
      void this.push('desktop-pet.speech', 'desktop-pet.voice', this.t.heard(this.userName, text), 'flush', { meta: { text } });
      return;
    }
    if (this.segmenter.active || this.transcribing || this.queue.length > 0) this.listenOpen = true;
    else if (!hold && !this.packer.pending && this.listenOpen && !this.talking) {
      // the episode ended with nothing worth delivering; an open talk key keeps it going
      this.listenOpen = false;
      this.partial = '';
      this.server.sendPet({ t: 'listen', phase: 'none' });
    }
    if (this.packer.pending && !this.packTimer) {
      this.packTimer = setTimeout(() => { this.packTimer = null; this.schedulePack(); }, Math.max(50, this.segmenter.settleRemainingMs || 100));
    }
  }

  /** A listening episode is open on the page (bubble shown) and has not been closed yet. */
  private listenOpen = false;

  private remember(line: HeardLine): void {
    this.heard.push(line);
    if (this.heard.length > 50) this.heard.shift();
  }

  private voiceFrame(frame: Record<string, unknown>): void {
    const text = JSON.stringify(frame);
    for (const s of this.voiceSockets) if (s.open) s.send(text);
  }

  /* ---------- tools ---------- */

  tools(): ToolDef[] {
    const handlers: Record<string, ToolDef['handler']> = {
      pet_say: (args) => this.say(args),
      pet_ask: (args) => this.askUser(args),
      pet_move_to: (args, ctx) => this.moveTo(args, ctx),
      pet_act: (args) => this.act(args),
      pet_set: (args) => this.setSettings(args),
      pet_quiet: (args) => this.setQuiet(args),
      pet_cua_open_settings: async () => this.openCuaSettings(),
    };
    const own = petToolDecls(this.appLanguage).map((decl) => ({ ...decl, handler: handlers[decl.name], ...(decl.name === 'pet_move_to' ? { interruptible: true } : {}) }));
    if (this.cuaOn) return [...own, ...this.cua.tools()];
    return this.cuaCanOpen ? [...own, ...CUA_OFF_TOOL_DECLS.map((decl) => ({ ...decl, handler: handlers[decl.name] }))] : own;
  }

  private notConnected(tool: string): ToolOutcome {
    const w = this.windowHost?.state();
    const detail = w && w.phase !== 'running' && w.detail ? w.detail : null;
    return { text: this.t.notConnected(tool, detail, this.userName), failed: true };
  }

  private async say(args: Record<string, unknown>): Promise<ToolOutcome> {
    const script = typeof args.script === 'string' ? args.script : '';
    const shown = this.shownImages(args.images);
    if (!shown.ok) return { text: shown.reason, failed: true };
    const { beats, dropped } = parseScript(script, this.vocab());
    const spoken = beats.some((b) => b.text || b.actions.length || b.anchors.length);
    if (!spoken && shown.blobs.length === 0) return { text: this.t.sayEmpty, failed: true };
    if (spoken && !this.server.sendPet({ t: 'say', id: nextId('s'), beats })) return this.notConnected('pet_say');
    void this.closeActivity();
    void this.record({ kind: 'say', beats: beats.map((b) => ({ text: b.text, ...moodOf(b.actions, this.vocab()) })) }, beats.map((b) => b.text).join(''), shown.blobs);
    if (!spoken) return { text: this.t.imagesShown(shown.blobs.length, this.chat.size > 0) };
    const now = Date.now();
    const selfSec = estimateSeconds(beats, this.cfg.window.bubbleSpeed, this.cfg.speech.enabled ? speechTextSteps : undefined);
    const waitSec = Math.max(0, (this.busyUntil - now) / 1000);
    this.busyUntil = Math.max(now, this.busyUntil) + selfSec * 1000;
    const replaced = this.ask?.question ?? null;
    if (this.ask) this.setAsk(null);
    return { text: this.t.sayReceipt({ waitSec, selfSec, chatOpen: this.chat.size > 0, replaced, dropped, images: shown.blobs.length }) };
  }

  /**
   * The images of a `pet_say`: each handle is read through the host and attached again as bytes,
   * so the stored line keeps the picture it showed after a Memory file changes.
   */
  private shownImages(raw: unknown): { ok: true; blobs: BlobInput[] } | { ok: false; reason: string } {
    if (raw === undefined) return { ok: true, blobs: [] };
    if (!Array.isArray(raw) || raw.some((h) => typeof h !== 'string')) return { ok: false, reason: this.t.imagesNotHandles };
    if (raw.length > IMAGES_MAX) return { ok: false, reason: this.t.tooManyImages(IMAGES_MAX) };
    const blobs: BlobInput[] = [];
    for (const [i, handle] of (raw as string[]).entries()) {
      const got = this.host?.blob(handle);
      if (!got) return { ok: false, reason: this.t.imageMissing(handle) };
      if (!got.mime.startsWith('image/')) return { ok: false, reason: this.t.imageNotImage(handle, got.mime) };
      blobs.push({ bytes: got.bytes, mime: got.mime, fallbackText: this.t.shownImage(i + 1, raw.length) });
    }
    return { ok: true, blobs };
  }

  private async askUser(args: Record<string, unknown>): Promise<ToolOutcome> {
    const question = typeof args.question === 'string' ? args.question.trim() : '';
    const raw = Array.isArray(args.options) ? args.options : [];
    const optionMax = capFor(ASK_OPTION_MAX, this.appLanguage);
    const options = raw.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => cutChars(o.trim(), optionMax)).slice(0, 3);
    const allowOwn = args.allowOwnAnswer !== false;
    if (!question) return { text: this.t.askEmpty, failed: true };
    if (options.length === 0 && !allowOwn) return { text: this.t.askNoWay, failed: true };
    const id = nextId('a');
    if (!this.server.sendPet({ t: 'ask', id, question, options, own: allowOwn })) return this.notConnected('pet_ask');
    const replaced = this.ask?.question ?? null;
    this.setAsk({ id, question, options });
    void this.closeActivity();
    void this.record({ kind: 'ask', askId: id, question, options, own: allowOwn }, question);
    return { text: this.t.askReceipt({ replaced, cut: raw.length > 3, chatOpen: this.chat.size > 0 }) };
  }

  /**
   * Interruptible: an interrupt stops the walk or the move where the pet stands, and the receipt says where.
   * A default target is walked to by the page; a target of the figure's own goes to its body as the call gave it
   * once its params check out against the pack's declaration (moves.ts). The body reports either way.
   */
  private async moveTo(args: Record<string, unknown>, ctx?: ToolCallContext): Promise<ToolOutcome> {
    const { language, t } = this;
    const pack = this.currentPack();
    const order = readMove(args, this.moves());
    if (order.kind === 'noTarget') return { text: t.moveNoTarget, failed: true };
    if (order.kind === 'badTarget') return { text: t.moveBadTarget(order.got, this.moves().map((m) => m.id)), failed: true };
    if (order.kind === 'badParams') return { text: t.moveBadParams(order.target?.id ?? null, order.target?.params.map((p) => `${p.id} ${p.min}–${p.max}`) ?? [], order.got), failed: true };
    if (order.kind === 'walk' && pack?.manifest.can.walk === false) return { text: t.walkCannot(modelName(pack.manifest.name, pack.id, language)), failed: true };
    const walkId = nextId('w');
    const sent = order.kind === 'walk' ? this.server.sendPet({ t: 'walk', id: walkId, to: order.to, run: order.run })
      : this.server.sendPet({ t: 'move', id: walkId, move: { to: order.to, run: order.run, params: order.params } });
    if (!sent) return this.notConnected('pet_move_to');
    const target = order.kind === 'move' ? modelName(order.target.name, order.target.id, language) : undefined;
    const text = await new Promise<string>((resolve) => {
      const onAbort = (): void => {
        if (!this.walks.has(walkId)) return;
        walk.stopping = true;
        this.server.sendPet({ t: 'walk-stop', id: walkId });
      };
      const done = (s: string): void => {
        ctx?.signal?.removeEventListener('abort', onAbort);
        resolve(s);
      };
      const timer = setTimeout(() => {
        this.walks.delete(walkId);
        done(target === undefined ? t.walkTimeout(WALK_TIMEOUT_MS / 1000) : t.moveTimeout(target, WALK_TIMEOUT_MS / 1000));
      }, WALK_TIMEOUT_MS);
      const walk: PendingWalk = { resolve: done, timer, ...(target === undefined ? {} : { target }) };
      this.walks.set(walkId, walk);
      ctx?.signal?.addEventListener('abort', onAbort, { once: true });
    });
    return { text };
  }

  private async setSettings(args: Record<string, unknown>): Promise<ToolOutcome> {
    const t = this.t;
    if (selfAdjustMode(this.cfg.selfAdjust) === 'off') return { text: t.selfAdjustOff('pet_set', this.userName), failed: true };
    const packs = this.packs();
    const { changes, errors } = planSettings(args, { ...this.cfg, user: this.userName }, packs, this.language, capFor(USER_MAX, this.appLanguage), this.appLanguage);
    if (errors.length) return { text: t.setErrors(errors), failed: true };
    if (!changes.length) return { text: t.setNothing };
    const lines: string[] = [];
    const apply = (list: SettingChange[]) => {
      for (const c of list) this.opts.persist(c.patch);
      const skin = this.cfg.skin;
      if (list.some((c) => c.key === 'figure' || c.key === 'scheme')) this.botLook = (skin.figure ?? COO) === COO ? COO : `${skin.figure}:${skin.scheme ?? ''}`;
      this.syncPrefs();
      this.opts.onBotChange?.();
    };
    const says = (list: SettingChange[]) => list.map((c) => c.say);
    const mine = changes.filter((c) => c.tier === 'self');
    if (mine.length) { apply(mine); lines.push(t.setDone(says(mine))); }
    const asked = changes.filter((c) => c.tier === 'ask');
    if (asked.length) {
      const c = this.ui.consent;
      const answer = await this.confirm(c.question(asked.map((x) => x.show)), c.choices);
      if (answer === 'always') {
        // these items stop being asked: the rest stay as they were, under `custom`; told to the app with the changes as the bot's own
        const keys = [...new Set(asked.map((x) => x.key))];
        this.opts.persist({ selfAdjust: 'custom', selfAdjustCustom: { ...directSettings(this.cfg), ...Object.fromEntries(keys.map((k) => [k, true])) } });
        apply(asked);
        lines.push(t.setAlways(this.userName, says(asked), keys.map((k) => t.settingNames[k])));
      } else if (answer === 'yes') { apply(asked); lines.push(t.setAgreed(this.userName, says(asked))); }
      else lines.push(t.setNotChanged(answer === 'unavailable' || answer === 'timeout' ? answer : 'no', this.userName, says(asked)));
    }
    if (mine.some((c) => c.key === 'figure' || c.key === 'scheme')) {
      lines.push(t.lookNow(this.bodyText(this.currentPack())));
      const note = this.vocabNote();
      if (note) lines.push(note);
    }
    return { text: lines.join('\n') };
  }

  private async setQuiet(args: Record<string, unknown>): Promise<ToolOutcome> {
    const t = this.t;
    const minutes = args.minutes;
    if (typeof minutes !== 'number' || !(minutes >= 0) || minutes > QUIET_MAX_MIN) return { text: t.quietBad(QUIET_MAX_MIN), failed: true };
    if (minutes === 0) {
      if (!this.quiet) return { text: t.quietNone };
      this.endQuiet();
      return { text: t.quietEnded };
    }
    if (selfAdjustMode(this.cfg.selfAdjust) === 'off') return { text: t.selfAdjustOff('pet_quiet', this.userName), failed: true };
    const sound = args.sound === true;
    const roam = args.roam === 'calm' ? 'calm' : 'off';
    const base = this.quiet?.base ?? { sound: this.cfg.sound, roam: this.cfg.roam };
    if (this.quiet) clearTimeout(this.quiet.timer);
    const until = Date.now() + minutes * 60_000;
    this.quiet = { sound, roam, until, base, timer: setTimeout(() => this.endQuiet(), minutes * 60_000) };
    this.syncPrefs();
    return { text: t.quietUntil(shortTime(this.opts.timezone, new Date(until)), sound, roam) };
  }

  private endQuiet(): void {
    if (!this.quiet) return;
    clearTimeout(this.quiet.timer);
    this.quiet = null;
    this.syncPrefs();
  }

  private async act(args: Record<string, unknown>): Promise<ToolOutcome> {
    const list = Array.isArray(args.actions) ? args.actions : typeof args.actions === 'string' ? [args.actions] : [];
    const vocab = this.vocab();
    const { actions, dropped } = parseActions(list, vocab);
    if (!actions.length) return { text: this.t.actNone(dropped), failed: true };
    if (!this.server.sendPet({ t: 'act', id: nextId('c'), actions })) return this.notConnected('pet_act');
    const lasting = actions.filter((a) => vocab.find((v) => v.id === a)?.lasting);
    return { text: this.t.actReceipt(actions, lasting, dropped) };
  }

  /* ---------- prompt ---------- */

  async envPromptVars(): Promise<Record<string, string>> {
    const { language, t } = this;
    const user = this.userName;
    const reply = this.opts.replyLanguage?.() ?? null;
    return {
      'pet.cua': this.cuaOn ? await this.cua.envPrompt() : this.cua.unsupported() === null ? t.cuaOff(user, this.cuaCanOpen) : '',
      'pet.user': user,
      'pet.vocab': vocabTable(this.vocab(), language),
      'pet.moves': moveTable(this.moves(), language),
      'pet.voice': this.cfg.asr.enabled ? t.on : t.off,
      'pet.body': this.bodyText(this.currentPack()),
      'pet.dress': dressTable(this.packs(), language),
      'pet.self': this.selfText(),
      'pet.chat': this.opts.controls?.openChat ? t.chatPage(user) : '',
      'pet.reply': reply ? t.reply(user, reply) : '',
    };
  }

  /** `{{pet.self}}`: which `pet_set` items change at once and which are asked first, or that none can change. */
  private selfText(): string {
    const t = this.t;
    if (selfAdjustMode(this.cfg.selfAdjust) === 'off') return t.selfNone(this.userName);
    const direct = directSettings(this.cfg);
    return t.selfTiers(this.userName, SELF_KEYS.filter((k) => direct[k]).map((k) => t.settingNames[k]), SELF_KEYS.filter((k) => !direct[k]).map((k) => t.settingNames[k]));
  }

  /** The environment prompt template of the model-text language. */
  private envPromptFile(): string {
    const file = ENV_PROMPT_FILES[this.language];
    return existsSync(file) ? file : ENV_PROMPT_FILES.zh;
  }

  /* ---------- WebUI ---------- */

  webUi(language: Language = 'zh'): WorldWebUiDecl {
    const w = this.windowHost?.state();
    const v = this.backendState();
    const c = petText(language).console;
    // the lamp is the window's: a browser page standing in for it is only mentioned
    const inWindow = this.server.petInWindow;
    const hint = w?.detail ?? c.notOpen;
    const lamps: WorldLamp[] = [
      {
        label: c.window,
        state: inWindow ? (this.bodyMissing === null ? 'online' : 'error') : w?.phase === 'running' ? 'loading' : w?.phase === 'missing' || w?.phase === 'error' ? 'error' : 'offline',
        hint: inWindow ? (this.bodyMissing === null ? c.connected : c.noBody(this.bodyMissing)) : this.server.petConnected ? c.alsoBrowser(hint) : hint,
      },
      {
        label: c.voice,
        state: !this.cfg.asr.enabled ? 'offline' : v?.phase === 'running' ? 'online' : v?.phase === 'starting' ? 'loading' : v?.phase === 'error' ? 'error' : 'offline',
        hint: v?.detail ?? v?.phase ?? c.notStarted,
      },
      ...(this.cfg.cua.enabled ? [this.cua.lamp(language)] : []),
    ];
    return {
      label: c.label,
      lamps,
      panels: desktopPetPanelDecls(language),
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      stream: (panel, socket) => {
        // `chat` has no panel: the embedding app draws its chat page from this stream
        if (panel === 'chat') { this.chat.add(socket, (msg, s) => void this.onChat(msg, s, language)); return; }
        if (panel !== 'voice') { socket.close('no stream'); return; }
        this.voiceSockets.add(socket);
        socket.onClose(() => this.voiceSockets.delete(socket));
      },
      links: this.server.port ? [{ label: c.viewInBrowser, href: this.petUrl }, { label: c.dress, href: `${this.server.origin}/dress` }] : [],
      config: desktopPetConfigGroups(language),
      promptDocs: [{
        key: `worlds.${DESKTOP_PET_ID}.envPrompt`,
        ...c.envPrompt,
        path: this.envPromptFile(),
        role: 'envPrompt',
        vars: ['pet.user', 'pet.vocab', 'pet.moves', 'pet.voice', 'pet.body', 'pet.dress', 'pet.self', 'pet.chat', 'pet.reply', 'pet.cua']
          .map((name) => ({ name, description: c.vars[name] ?? name, ...(name === 'pet.vocab' || name === 'pet.moves' || name === 'pet.dress' || name === 'pet.cua' ? { multiline: true } : {}) })),
      }],
    };
  }

  private async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel === 'pet') {
      switch (method) {
        case 'state': return this.petState();
        case 'openWindow': this.openWindow(); return this.petState();
        case 'closeWindow': await this.windowHost?.stop(); return this.petState();
        // hides the window as the pet's menu does; it stays connected and comes back with openWindow
        case 'hideWindow': this.server.sendPet({ t: 'hide' }); return this.petState();
        case 'installElectron': void this.store.electron.install(); return this.petState();
        // the Habits page's custom picks (/api/config writes no list or map): `custom` and its picks in one write, as the person's change
        case 'setWakeKinds': {
          const picked = Array.isArray(args[0]) ? args[0] as unknown[] : [];
          this.opts.persist({ touch: { wakeOn: 'custom', wakeKinds: TOUCH_KINDS.filter((k) => picked.includes(k)) } });
          return this.petState();
        }
        case 'setSelfAdjustCustom': {
          const raw = args[0] && typeof args[0] === 'object' ? args[0] as Record<string, unknown> : {};
          const custom = this.selfCustom();
          for (const k of SELF_KEYS) if (typeof raw[k] === 'boolean') custom[k] = raw[k] as boolean;
          this.opts.persist({ selfAdjust: 'custom', selfAdjustCustom: custom });
          return this.petState();
        }
        // the typing key, as the talk key is set through setMic: on or off, and a key `parseHotkey` reads
        case 'setTypeKey': {
          const raw = args[0] && typeof args[0] === 'object' ? args[0] as Record<string, unknown> : {};
          const typeKey: { enabled?: boolean; hotkey?: string } = {};
          if (typeof raw.enabled === 'boolean') typeKey.enabled = raw.enabled;
          if (typeof raw.hotkey === 'string' && parseHotkey(raw.hotkey)) typeKey.hotkey = raw.hotkey;
          this.opts.persist({ typeKey });
          await this.syncTypeKey();
          return this.petState();
        }
        case 'guide': {
          if (!this.opts.controls?.guide) throw new Error(this.ui.console.noGuide);
          this.opts.controls.guide();
          return this.petState();
        }
      }
    }
    if (panel === 'voice') {
      switch (method) {
        case 'state': return this.voiceState();
        case 'install': void this.installVoice(); return this.voiceState();
        case 'start': await this.startVoiceBackend(); return this.voiceState();
        case 'stop': await this.stopVoiceBackend(); return this.voiceState();
        case 'setEngine': {
          const engine = args[0];
          if (engine === 'funasr' || engine === 'whisper' || engine === 'system' || engine === 'api') this.opts.persist({ asr: { engine } });
          if (this.cfg.asr.enabled) await this.startVoiceBackend();
          return this.voiceState();
        }
        // the transcription service: address and model go to the config, the API Key to the deployment's secrets
        case 'setApi': {
          const raw = args[0] && typeof args[0] === 'object' ? args[0] as Record<string, unknown> : {};
          const api: { baseUrl?: string; model?: string } = {};
          if (typeof raw.baseUrl === 'string') api.baseUrl = raw.baseUrl.trim();
          if (typeof raw.model === 'string') api.model = raw.model.trim();
          if (Object.keys(api).length) this.opts.persist({ asr: { api } });
          if (typeof raw.key === 'string' && raw.key.trim()) this.opts.storeAsrApiKey?.(raw.key.trim());
          if (this.cfg.asr.enabled && this.engine() === 'api') await this.startVoiceBackend();
          return this.voiceState();
        }
        case 'setEnabled': this.savePrefs({ mic: args[0] === true }); return this.voiceState();
        case 'setMic': {
          this.savePrefs({ micSettings: args[0] });
          await this.syncHotkey();
          return this.voiceState();
        }
      }
    }
    throw new Error(this.ui.console.unknownMethod(`${panel}.${method}`));
  }

  /** Downloads the model of `modelEngine()`, chooses that engine, and starts it when voice input is on. */
  async installVoice(): Promise<void> {
    const engine = this.modelEngine();
    const slot = this.store[engine];
    if (slot.state().phase !== 'ready') await slot.install();
    if (slot.state().phase !== 'ready') { this.syncPrefs(); return; }
    // downloading the model is choosing it
    if (this.engine() !== engine) this.opts.persist({ asr: { engine } });
    if (this.cfg.asr.enabled) await this.startVoiceBackend();
    else this.syncPrefs();
  }

  petState(): Record<string, unknown> {
    return {
      connected: this.server.petConnected,
      /** The connected pet page is the window's, not a browser page standing in for it. */
      inWindow: this.server.petInWindow,
      /** The pet window is connected and shown (hidden from its menu or the tray, it stays connected). */
      onDesktop: this.server.petInWindow && !this.petHidden,
      url: this.server.port ? this.petUrl : null,
      dressUrl: this.server.port ? `${this.server.origin}/dress` : null,
      /** The OBS overlay page while `window.exportOverlay` is on. */
      overlayUrl: this.server.port && this.cfg.window.exportOverlay ? `${this.server.origin}/overlay` : null,
      skin: this.cfg.skin,
      /** What the person is called while `user` is empty, in the app language. */
      defaultUser: this.ui.defaultUser,
      window: this.windowHost?.state() ?? null,
      electron: { ...this.store.electron.state(), supported: this.store.electron.supported },
      screen: this.screen,
      /** The Habits page's two rows, legacy values read as they now mean. */
      wake: { wakeOn: this.cfg.touch.wakeOn, wakeKinds: this.cfg.touch.wakeKinds },
      selfAdjust: { mode: selfAdjustMode(this.cfg.selfAdjust), custom: this.selfCustom() },
      /** The Habits page's typing key: the setting, the keys named in the app language, and why it cannot be read. */
      typeKey: { ...this.cfg.typeKey, keyLabel: comboLabel(this.cfg.typeKey.hotkey, process.platform, this.ui), problem: this.typeKeyProblem },
    };
  }

  /** `selfAdjustCustom` with every item, the default's for one missing. */
  private selfCustom(): Record<SelfKey, boolean> {
    return directSettings({ selfAdjust: 'custom', selfAdjustCustom: this.cfg.selfAdjustCustom });
  }

  voiceState(): Record<string, unknown> {
    const modelEngine = this.modelEngine();
    const model = this.store[modelEngine];
    return {
      enabled: this.cfg.asr.enabled,
      engine: this.engine(),
      engineSetting: this.cfg.asr.engine,
      systemSupported: systemRecognizerSupported(),
      server: this.backendState(),
      model: { ...model.state(), bytes: model.bytes, engine: modelEngine },
      /** The transcription service's settings; of the API Key only whether one is saved. */
      api: { ...this.cfg.asr.api, keySaved: (this.opts.asrApiKey?.() ?? '') !== '' },
      mic: this.micState,
      input: {
        ...this.cfg.asr.mic,
        hotkeyLabel: hotkeyLabel(this.cfg.asr.mic.hotkey, process.platform, this.ui),
        /** The keys alone, and how many presses (the last one held): for a key cap that shows the taps. */
        keyLabel: comboLabel(this.cfg.asr.mic.hotkey, process.platform, this.ui),
        taps: splitTaps(this.cfg.asr.mic.hotkey).taps,
        hint: this.talkHint(),
        hotkeyProblem: this.hotkeyProblem,
        open: this.gateOpen(),
        devices: this.devices,
      },
      level: this.level,
      thresholdDb: this.cfg.asr.segment.thresholdDb,
      recent: this.heard.slice(-20),
      counts: { ...this.counts },
    };
  }
}

export const modelsDirFor = (root: string) => join(root, DESKTOP_PET_ID);
