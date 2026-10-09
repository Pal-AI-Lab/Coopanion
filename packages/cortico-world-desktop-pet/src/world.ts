/**
 * DesktopPetWorld: the pet on the desktop as a World.
 *
 * Output goes through four tools that drive the pet page (bubble, options, walking,
 * expressions and motions). Input arrives as events: speech heard through the pet window's
 * microphone (transcribed by FunASR's SenseVoice in this process, or Windows' own recognizer), typed text, answers to `pet_ask`, and touches
 * (poke, petting, being thrown). The page reports what actually happened; receipts and
 * events state only that.
 *
 * Processes owned here: the page server (always, while mounted), the pet window (when
 * `window.enabled`) and the system recognizer's helper (voice input on, engine `system`). FunASR runs
 * in this process once its model is downloaded.
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
  BlobInput, EventEnvelope, Logger, OutputTap, RunPhase, ToolCallContext, ToolDef, ToolOutcome, TriggerMode, World, WorldConsoleDecl,
  WorldHost, WorldLamp, WorldPanelDecl, WorldStreamSocket,
} from 'cortico/core/types.ts';
import { nowIso, shortTime } from 'cortico/core/util.ts';
import type { Language } from 'cortico/core/language.ts';
import type { DeepPartial } from 'cortico/world.ts';
import {
  DESKTOP_PET_ID, MAX_HOVER_BUTTONS, PET_ACTIONS, SENSEVOICE_LANGUAGES, USER_MAX, desktopPetConfigGroups, hoverButtonList,
  type AsrEngine, type DesktopPetConfigSection, type MicMode, type PetSkin, type PetTheme, type RoamMode,
} from './config.ts';
import { capFor, cutChars, petText, type PetText } from './i18n/index.ts';
import { PetServer, type PageMessage } from './server.ts';
import { StatusTracker, type DescribeTool } from './status.ts';
import { WindowHost, resolveHostCommand } from './window-host.ts';
import { RuntimeStore, type ModelSpec } from './runtime/store.ts';
import { FunAsrRecognizer, type FunAsrState, type SherpaModule } from './asr/funasr.ts';
import { SystemRecognizer, systemRecognizerSupported, type SystemRecognizerState, type SystemSentence } from './asr/system-recognizer.ts';
import { Packer, Segmenter, rmsDb, type SegmentConfig, type SegmentSink, type Utterance } from './asr/segmenter.ts';
import { comboLabel, hotkeyBadge, hotkeyLabel, parseHotkey, splitTaps, watchHotkey, type KeyWatcher } from './asr/hotkey.ts';
import { joinSpeech, looksHallucinated } from './asr/result.ts';
import { toSimplified } from './asr/simplify.ts';
import { estimateSeconds, parseActions, parseScript, vocabChange, vocabTable, type VocabWord } from './script.ts';
import { ActivityGroup, ChatSockets, SELF_TYPE, chatHistory, chatItem, chatRefs } from './chat.ts';
import { ASK_OPTION_MAX, petToolDecls } from './tools.ts';
import { COO, figurePacks, lookOf, modelName, nameIn, packFor, type FigurePack, type PackScan } from './packs.ts';
import { PackImporter } from './pack-import.ts';
import { dressTable, planSettings, type SettingChange } from './self.ts';
import { MODEL_TEXT, type ModelLanguage, type ModelText } from './model-text.ts';

/** The console panels, titled in `language`. */
export function desktopPetPanelDecls(language: Language = 'zh'): WorldPanelDecl[] {
  const p = petText(language).console.panels;
  return [
    { id: 'pet', ...p.pet, getMethods: ['state'] },
    { id: 'voice', ...p.voice, getMethods: ['state'] },
    { id: 'chat', ...p.chat, getMethods: ['blob'] },
  ];
}

/** The culture of Windows' speech recognizer preferred for each app language, where its language has more than one. */
const SYSTEM_CULTURES: Readonly<Record<string, string>> = {
  zh: 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en-US', fr: 'fr-FR', de: 'de-DE', 'es-419': 'es-MX', 'pt-BR': 'pt-BR', it: 'it-IT', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR',
};

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
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
/** A message from the chat page: text cut to this, up to IMAGES_MAX images of at most IMAGE_MAX_BYTES each, as the terminal World takes them. */
const CHAT_TEXT_MAX = 4000;
const IMAGES_MAX = 8;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** How often config edits from the console reach the pages: short enough that the size slider moves the pet with it. */
const PREFS_SYNC_MS = 150;
/** Talk-key polling interval: well under the shortest key tap. */
const HOTKEY_POLL_MS = 30;

/**
 * Run controls an embedding app lends the pet's menu. Each button shows only when its control is
 * lent: pause/resume needs `isPaused` and `setPaused`, settings `openSettings`, the power button
 * `quit`. Without any the menu header shows only the avatar and the name.
 */
export interface PetBotControls {
  isPaused?(): boolean;
  setPaused?(paused: boolean): void;
  openSettings?(): void;
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
 * - `buttons`: a row of buttons, answered with the index; `keys` shows a key cap above them, pressed
 *   `taps` times over and over, the last press held (a talk key tapped, then held).
 * - `choices`: cards to try out before `confirm`, each with an optional level tag and icon (a web/ui.js
 *   `ICONS` name, or `image`, a `data:image/…` URL such as a service's logo); a card's `line` is typed when it is picked and
 *   its `motion` played (standing still, strolling, running about) until another is picked.
 * - `text`: a text box answered with the text; `secret` hides what is typed, `suggestions` are offered
 *   as the person types, `link` opens a page in the browser, `alt` is a second way out, answered as `{ alt: true }`.
 * - `progress`: a bar the app moves with `update({ progress })`; it ends when the app closes it.
 */
export type PetDialogInput =
  | { kind: 'buttons'; options: Array<{ label: string; primary?: boolean }>; keys?: string; taps?: number }
  | { kind: 'choices'; options: Array<{ label: string; level?: string; icon?: string; image?: string; line?: string; motion?: 'still' | 'walk' | 'run' }>; value?: number; confirm: string }
  | { kind: 'text'; submit: string; placeholder?: string; value?: string; secret?: boolean; maxLength?: number; suggestions?: string[]; link?: { label: string; url: string }; alt?: string }
  | { kind: 'progress'; label?: string };

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

/** How a confirmation ended: one of the two choices, closed, no answer in time, or no pet page to ask on. */
export type ConfirmResult = 'yes' | 'no' | 'dismissed' | 'timeout' | 'unavailable';

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
  /** The speech model to download; tests pass a small one. */
  funasrModel?: ModelSpec;
  /** Shown in the menu header. */
  botName?: string;
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
}

interface PendingWalk {
  resolve: (text: string) => void;
  timer: NodeJS.Timeout;
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

export class DesktopPetWorld implements World {
  readonly id = DESKTOP_PET_ID;
  private host: WorldHost | null = null;
  private log: Logger | null = null;
  private readonly cfg: DesktopPetConfigSection;
  private readonly server: PetServer;
  private windowHost: WindowHost | null = null;
  private readonly store: RuntimeStore;
  private funasr: FunAsrRecognizer | null = null;
  private system: SystemRecognizer | null = null;
  /** The engine the running backend belongs to; a config change starts the other one. */
  private runningEngine: AsrEngine | null = null;
  /** The person asked to send what was heard now, without waiting for the pause that ends a sentence. */
  private committing = false;
  private readonly segmenter: Segmenter;
  private readonly packer = new Packer({ joinGapMs: 0, maxHoldMs: 8000, minChars: 1 });
  private readonly queue: Utterance[] = [];
  private transcribing = false;
  private packTimer: NodeJS.Timeout | null = null;
  private wasSpeaking = false;
  private screen: { w: number; h: number } | null = null;
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
  private keyWatcher: KeyWatcher | null = null;
  /** Why the talk key cannot be read; the gate then stays open as in `always`. */
  private hotkeyProblem: string | null = null;
  private hotkeyKey = '';
  private level = -100;
  private readonly chat = new ChatSockets();
  private readonly activity = new ActivityGroup();
  /** What the status bubble shows. */
  private readonly status: StatusTracker;
  private phase: RunPhase | null = null;
  /** The person's messages (typed, spoken) not yet delivered to the bot, by cursor. */
  private readonly pendingChat = new Set<number>();
  /** The first cursor of this run: Core queues this World's undelivered events from before it again at start. */
  private startCursor = 0;
  /** Text the bubble's expand button carried, until a chat page takes it. */
  private draft: string | null = null;
  private pausedShown: boolean | null = null;

  /** Installs packs the dressing page sends, when the app named a directory for them. */
  private readonly importer: PackImporter | null;

  constructor(private readonly opts: DesktopPetWorldOptions) {
    this.cfg = opts.cfg;
    this.importer = opts.packDir ? new PackImporter({ packDir: opts.packDir, packs: () => this.packs(), text: () => this.ui }) : null;
    this.status = new StatusTracker((status) => this.server.sendPet({ t: 'status', status }), opts.describeTool, () => this.ui.busy);
    this.segmenter = new Segmenter(this.segmentConfig(), FRAME_MS);
    this.segmenter.setSink(this.sink);
    this.store = new RuntimeStore({ runtimesRoot: opts.runtimesRoot, modelsDir: opts.modelsDir, fetchImpl: opts.fetchImpl, funasrModel: opts.funasrModel, text: () => this.ui });
    this.server = new PetServer({
      port: () => this.cfg.port,
      webDir: WEB_DIR,
      snapshot: () => this.snapshot(),
      onPetMessage: (msg) => this.onPage(msg),
      onAudio: (frame) => this.onAudio(frame),
      onPetConnect: () => { this.log?.info('桌宠页面已连接'); },
      onPetDisconnect: () => this.onPageGone(),
      onSkin: (skin) => this.saveSkin(skin),
      onPrefs: (prefs) => this.savePrefs(prefs),
      avatarFile: opts.avatarFile,
      packs: () => this.packs(),
      packProblems: () => this.packScan().problems,
      importer: this.importer ?? undefined,
      language: () => this.appLanguage,
      text: () => this.ui,
    });
  }

  /* ---------- figures ---------- */

  /** Pack problems already logged, so a broken pack is reported once, not on every scan. */
  private readonly packProblems = new Set<string>();
  /** The figure (and a pack's pick, `id:scheme`) the pet page last said it shows, null before it said. */
  private figureShown: string | null = null;
  /** The figure the page said would not run, while the skin still names it: the page shows Coo meanwhile. */
  private figureFailed: string | null = null;
  /** The words each pack's body said it knows when the page last loaded it; a body that did not say is taken at its manifest's word. */
  private readonly bodyWords = new Map<string, ReadonlySet<string>>();
  /** The words the bot was last told it may use: its prompt's at start, then a `[形象]` event's or a `pet_set` receipt's. */
  private toldVocab: readonly VocabWord[] = [];
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

  /** How the words the bot may use changed since it was last told, or ''. From here the bot counts as told the words of now. */
  private vocabNote(): string {
    const now = this.vocab();
    const note = vocabChange(this.toldVocab, now, this.language);
    this.toldVocab = now;
    return note;
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
      // the page shows Coo instead, whose words then hold too
      const coo = packs.find((p) => p.id === COO) ?? null;
      const note = this.vocabNote();
      const name = modelName(pack?.manifest.name, id, this.language);
      void this.push('desktop-pet.figure', 'desktop-pet.figure', this.t.figureFailed(name, reason, this.bodyText(coo), note), 'flush');
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
    const shown = id === COO ? COO : `${id}:${typeof msg.scheme === 'string' ? msg.scheme : ''}`;
    this.figureShown = shown;
    let look: string | null = null;
    if (before !== null && before !== shown) {
      if (shown === this.botLook) this.botLook = null;
      else look = this.t.figureNow(this.bodyText(pack));
    }
    const note = this.vocabNote();
    const text = look && note ? `${look}\n${note}` : look ?? (note ? this.t.figureNote(note) : null);
    if (text) void this.push('desktop-pet.figure', 'desktop-pet.figure', text, 'debounce');
  }

  /* ---------- lifecycle ---------- */

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.startCursor = host.store.latestCursor() + 1;
    this.log = host.log;
    // the words the prompt is rendered with, until the bot is told otherwise
    this.toldVocab = this.vocab();
    await this.server.start();
    this.windowHost = new WindowHost(host.log, () => this.t.window);
    if (this.cfg.window.enabled) this.openWindow();
    this.funasr = new FunAsrRecognizer({
      model: () => this.funasrModel(),
      language: () => this.asrLanguage(),
      text: () => this.ui,
      threads: () => this.cfg.asr.threads,
      log: host.log,
      load: this.opts.loadSherpa,
    });
    this.system = new SystemRecognizer({
      language: () => this.asrLanguage(),
      culture: () => SYSTEM_CULTURES[this.appLanguage] ?? '',
      text: () => this.ui,
      timeoutMs: () => this.cfg.asr.timeoutMs,
      log: host.log,
      spawnImpl: this.opts.spawnSystemRecognizer,
    });
    if (this.cfg.asr.enabled) void this.startVoiceBackend();
    await this.syncHotkey();
    this.prefsKey = this.prefsSignature();
    this.prefsTimer = setInterval(() => this.syncPrefs(), PREFS_SYNC_MS);
  }

  async stop(): Promise<void> {
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
    await this.system?.stop();
    await this.server.stop();
    this.host = null;
  }

  onTurnEnded(): void {
    this.touchWoke = false;
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
          paused: this.opts.controls?.isPaused?.() ?? false, user: this.userName, bot: this.opts.botName ?? '',
          imagesSeen: host?.modelFacts.accepts('image/jpeg') ?? false,
        });
        if (this.draft !== null) { this.chat.send(socket, { t: 'draft', text: this.draft }); this.draft = null; }
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
    this.windowHost.start(resolveHostCommand(this.petUrl, this.cfg.window.electronFile, managed, this.t.window));
  }

  /* ---------- page protocol ---------- */

  private snapshot(): Record<string, unknown> {
    return {
      skin: this.cfg.skin,
      roam: this.quiet?.roam ?? this.cfg.roam,
      sound: this.quiet?.sound ?? this.cfg.sound,
      sounds: this.cfg.sounds,
      theme: this.cfg.theme,
      rememberPosition: this.cfg.rememberPosition,
      // read by the page from `init` only
      startX: this.cfg.rememberPosition ? this.cfg.petX : null,
      hoverButtons: hoverButtonList(this.cfg.hoverButtons),
      doubleClickChat: this.cfg.doubleClickChat,
      scale: this.cfg.window.scale,
      frameRate: this.cfg.window.frameRate,
      lockFrameRate: this.cfg.window.lockFrameRate,
      hideWhenFullscreen: this.cfg.window.hideWhenFullscreen,
      language: this.appLanguage,
      user: this.userName,
      mic: this.micWanted(),
      voice: this.voiceBrief(),
      micDevice: this.cfg.asr.mic.deviceId,
      status: this.status.status,
      statusBubble: this.cfg.statusBubble,
      bot: this.botInfo(),
    };
  }

  private botInfo(): Record<string, unknown> {
    const c = this.opts.controls;
    let avatar: string | null = null;
    try { if (this.opts.avatarFile) avatar = String(statSync(this.opts.avatarFile).mtimeMs); } catch { /* no avatar yet */ }
    const pause = !!(c?.isPaused && c.setPaused);
    const label = typeof c?.quitLabel === 'function' ? c.quitLabel() : c?.quitLabel;
    const quitLabel = c?.quit ? label || this.ui.menu.quit : '';
    return {
      name: this.opts.botName ?? '',
      avatar,
      controls: !!c,
      buttons: { pause, settings: !!c?.openSettings, dress: !!c?.openDress, quit: !!c?.quit, chat: !!c?.openChat },
      paused: pause && c?.isPaused ? c.isPaused() : null,
      quitLabel,
      quitPrompt: quitLabel ? this.ui.menu.quitPrompt(quitLabel) : '',
    };
  }

  private prefsSignature(): string {
    const s = this.snapshot();
    delete s.status;
    return JSON.stringify(s);
  }

  /** Config is a live object edited by the console; changes reach the pages within PREFS_SYNC_MS. */
  private syncPrefs(): void {
    this.segmenter.configure(this.segmentConfig());
    if (this.cfg.asr.enabled && this.runningEngine && this.runningEngine !== this.engine()) void this.startVoiceBackend();
    // the system recognizer serves one language; a new one needs a new helper
    else if (this.cfg.asr.enabled && this.runningEngine === 'system' && this.system?.languageChanged) void this.startVoiceBackend();
    // FunASR loads the model for one language and thread count
    else if (this.cfg.asr.enabled && this.runningEngine === 'funasr' && this.funasr?.configChanged) void this.startVoiceBackend();
    void this.syncHotkey();
    // the person changed what a quiet holds back: theirs wins
    if (this.quiet && (this.cfg.sound !== this.quiet.base.sound || this.cfg.roam !== this.quiet.base.roam)) this.endQuiet();
    const paused = this.opts.controls?.isPaused?.() ?? false;
    if (paused !== this.pausedShown) { this.pausedShown = paused; this.chat.broadcast({ t: 'paused', paused }); }
    const key = this.prefsSignature();
    if (key === this.prefsKey) return;
    this.prefsKey = key;
    this.server.broadcast({ t: 'prefs', ...this.snapshot() });
  }

  private micWanted(): boolean {
    const phase = this.backendState()?.phase;
    return this.cfg.asr.enabled && (phase === 'running');
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
      mode: this.micMode(),
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
      const m: { mode?: MicMode; hotkey?: string; deviceId?: string } = {};
      if (mic.mode === 'hold' || mic.mode === 'toggle' || mic.mode === 'always') m.mode = mic.mode;
      if (typeof mic.hotkey === 'string' && parseHotkey(mic.hotkey)) m.hotkey = mic.hotkey;
      if (typeof mic.deviceId === 'string') m.deviceId = mic.deviceId;
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
    if (x === this.cfg.petX) return;
    try {
      this.opts.persist({ petX: x });
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
        const at = typeof msg.x === 'number' ? pct(msg.x) : '?';
        const t = this.t;
        w.resolve(msg.t === 'arrived' ? t.walkArrived(at)
          : w.stopping ? t.walkStopped(at)
          : msg.by === 'drag' ? t.walkGrabbed(at, this.userName) : t.walkReplaced(at, String(msg.by)));
        return;
      }
      case 'answer': return this.onAnswer(msg, 'pet');
      case 'text': {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
        if (text) void this.push('desktop-pet.message', `desktop-pet.text`, this.t.typed(this.userName, text), 'preempt', { meta: { via: 'bubble', text } });
        return;
      }
      case 'expand': {
        const text = typeof msg.text === 'string' ? msg.text.slice(0, CHAT_TEXT_MAX) : '';
        this.draft = text;
        if (this.chat.size) { this.chat.broadcast({ t: 'draft', text }); this.draft = null; }
        this.opts.controls?.openChat?.();
        return;
      }
      case 'touch': return this.onTouch(msg);
      case 'mic': {
        this.micState = { state: String(msg.state), detail: typeof msg.detail === 'string' ? msg.detail : null };
        return;
      }
      case 'prefs': return this.savePrefs(msg);
      case 'position': {
        if (typeof msg.x === 'number' && Number.isFinite(msg.x)) this.standX = Math.min(1, Math.max(0, msg.x));
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
        c.resolve(msg.index === 0 ? 'yes' : msg.index === 1 ? 'no' : 'dismissed');
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
   * Asks the person in a bubble with two choices, the first one meaning yes. Answers never
   * reach the bot as events; the caller gets them.
   */
  confirm(question: string, choices: [yes: string, no: string]): Promise<ConfirmResult> {
    const id = nextId('k');
    if (!this.server.sendPet({ t: 'confirm', id, question, options: choices })) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.confirms.delete(id); resolve('timeout'); }, CONFIRM_TIMEOUT_MS);
      this.confirms.set(id, { resolve, timer });
    });
  }

  /**
   * Shows one step of a conversation in the bubble; see `PetDialog`. Nothing reaches the bot: the
   * caller gets the answer. Steps wait for as long as the person takes; a step with nothing to
   * answer ends once its line has been read.
   */
  dialog(d: PetDialog): PetDialogHandle {
    const id = nextId('d');
    const { actions } = parseActions(d.actions ?? [], this.vocab());
    let settle: (a: PetDialogAnswer) => void = () => {};
    const answer = new Promise<PetDialogAnswer>((resolve) => { settle = resolve; });
    if (!this.server.sendPet({ t: 'dialog', id, ...d, actions })) settle({ unavailable: true });
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
    const { wakeOn } = this.cfg.touch;
    const wakes = !this.touchWoke && (wakeOn === 'all' || (wakeOn === 'poke' && t.kind === 'poke'));
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
  private async record(meta: Record<string, unknown>, text: string): Promise<number | null> {
    const host = this.host;
    if (!host) return null;
    try {
      const e = await host.pushEvent({ type: SELF_TYPE, source: this.id, senderKey: SELF_TYPE, ts: nowIso(this.opts.timezone), text, meta }, { deliver: false });
      const item = chatItem(e);
      if (item) this.chat.broadcast({ t: 'item', item });
      return e.cursor;
    } catch (err) {
      this.log?.warn(`对话记录没能保存:${(err as Error).message}`);
      return null;
    }
  }

  /* ---------- voice ---------- */

  private funasrModel(): { model: string; tokens: string } | { missing: string } {
    if (this.store.funasr.state().phase !== 'ready') return { missing: this.ui.voice.modelMissing(Math.round(this.store.funasr.bytes / 1048576)) };
    return { model: this.store.funasr.file('model.int8.onnx'), tokens: this.store.funasr.file('tokens.txt') };
  }

  /**
   * The engine in force: Windows' own recognizer only where it exists, FunASR otherwise (and for older
   * settings). Unset, the app language picks: FunASR for a language SenseVoice hears, else the system one.
   */
  engine(): AsrEngine {
    const set = this.cfg.asr.engine || (this.appLanguage in SENSEVOICE_LANGUAGES ? 'funasr' : 'system');
    return set === 'system' && systemRecognizerSupported() ? 'system' : 'funasr';
  }

  /** The recognition language: the set one, else the app language's (its ISO 639-1 code for the system recognizer, `auto` for FunASR where SenseVoice does not hear it). */
  private asrLanguage(): string {
    if (this.cfg.asr.language) return this.cfg.asr.language;
    const app = this.appLanguage;
    return SENSEVOICE_LANGUAGES[app] ?? (this.engine() === 'system' ? app.split('-')[0]! : 'auto');
  }

  private backendState(): FunAsrState | SystemRecognizerState | null {
    return (this.engine() === 'system' ? this.system?.state() : this.funasr?.state()) ?? null;
  }

  /** Starts the engine in force and stops the other one. */
  async startVoiceBackend(): Promise<FunAsrState | SystemRecognizerState | null> {
    if (!this.funasr || !this.system) return null;
    const engine = this.engine();
    if (this.runningEngine !== engine) {
      if (this.runningEngine === 'system') await this.system.stop();
      else if (this.runningEngine === 'funasr') await this.funasr.stop();
      this.runningEngine = engine;
    }
    if (engine === 'system') await this.system.start();
    else await this.funasr.start();
    this.syncPrefs();
    return this.backendState();
  }

  private async stopVoiceBackend(): Promise<void> {
    if (this.engine() === 'system') await this.system?.stop();
    else await this.funasr?.stop();
    this.syncPrefs();
  }

  /* ---------- talk key ---------- */

  /** The mode in force: hold and toggle fall back to always while the talk key cannot be read. */
  private micMode(): MicMode {
    return this.hotkeyProblem ? 'always' : this.cfg.asr.mic.mode;
  }

  /** Audio reaches the segmenter only while this is true. */
  private gateOpen(): boolean {
    return this.micMode() === 'always' || this.talking;
  }

  /**
   * While the talk key is held everything counts as speech: the segmenter never waits for a
   * loud onset or cuts at a pause, and releasing the key ends the utterance.
   */
  private segmentConfig(): SegmentConfig {
    const seg = this.cfg.asr.segment;
    return this.micMode() === 'hold' ? { ...seg, thresholdDb: -Infinity, minSpeechMs: 0 } : seg;
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
      this.log?.warn(`按键收音不可用,改为一直收音:${watcher}`);
    } else this.keyWatcher = watcher;
    this.segmenter.configure(this.segmentConfig());
  }

  /** One line telling the person how to be heard. */
  private talkHint(): string {
    const { hotkey } = this.cfg.asr.mic;
    const ui = this.ui, v = ui.voice;
    const key = comboLabel(hotkey, process.platform, ui), { taps } = splitTaps(hotkey);
    const mode = this.micMode();
    if (mode === 'always') return this.hotkeyProblem ? v.fallback(this.hotkeyProblem) : v.always;
    if (mode === 'toggle') return taps > 1 ? v.toggleTaps(hotkeyLabel(hotkey, process.platform, ui), taps) : v.toggle(key);
    return taps > 1 ? v.holdTaps(key, taps) : v.hold(key);
  }

  /** A quick tap before the held press: the pet perks up, so the hold that follows feels answered at once. */
  private onTalkTap(): void {
    if (this.talking || !this.cfg.asr.enabled || !this.micWanted()) return;
    this.server.sendPet({ t: 'listen', phase: 'ready' });
  }

  private onTalkKey(down: boolean): void {
    if (this.micMode() === 'hold') this.setTalking(down);
    else if (down) this.setTalking(!this.talking);
  }

  private setTalking(on: boolean): void {
    if (this.talking === on) return;
    this.talking = on;
    this.voiceFrame({ type: 'gate', open: on });
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    if (on) {
      this.listenOpen = true;
      this.server.sendPet({ t: 'listen', phase: 'start' });
      return;
    }
    const tail = this.segmenter.flush();
    if (tail) this.enqueue(tail);
    this.wasSpeaking = false;
    this.schedulePack();
  }

  /**
   * The pet's microphone button, held down: what was heard so far goes out now. The sentence
   * in progress is cut, and delivery waits only for transcription, not for the closing pause.
   * A switched-on talk key (toggle) is switched off: that sentence is finished.
   */
  private commitSpeech(): void {
    if (!this.cfg.asr.enabled || !this.micWanted()) return;
    this.committing = true;
    if (this.micMode() === 'toggle' && this.talking) this.setTalking(false);
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
        const res = u.result
          ? await u.result
          : this.engine() === 'system' && this.system
            ? await this.system.transcribe(u.pcm)
            : this.funasr
              ? await this.funasr.transcribe(u.pcm)
              : { text: '', ms: 0, error: this.ui.voice.notRunning };
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
        this.packer.add(text, Date.now());
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
      const recognizer = this.engine() === 'system' ? this.system : this.funasr;
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
    const text = this.committing && !upstream ? this.packer.take() : this.packer.due(Date.now(), hold);
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
      pet_walk_to: (args, ctx) => this.walkTo(args, ctx),
      pet_act: (args) => this.act(args),
      pet_set: (args) => this.setSettings(args),
      pet_quiet: (args) => this.setQuiet(args),
    };
    return petToolDecls(this.appLanguage).map((decl) => ({ ...decl, handler: handlers[decl.name], ...(decl.name === 'pet_walk_to' ? { interruptible: true } : {}) }));
  }

  private notConnected(tool: string): ToolOutcome {
    const w = this.windowHost?.state();
    const detail = w && w.phase !== 'running' && w.detail ? w.detail : null;
    return { text: this.t.notConnected(tool, detail, this.userName), failed: true };
  }

  private async say(args: Record<string, unknown>): Promise<ToolOutcome> {
    const script = typeof args.script === 'string' ? args.script : '';
    const { beats, dropped } = parseScript(script, this.vocab());
    if (!beats.some((b) => b.text || b.actions.length || b.anchors.length)) {
      return { text: this.t.sayEmpty, failed: true };
    }
    const id = nextId('s');
    if (!this.server.sendPet({ t: 'say', id, beats })) return this.notConnected('pet_say');
    void this.closeActivity();
    void this.record({ kind: 'say', beats: beats.map((b) => ({ text: b.text, ...moodOf(b.actions, this.vocab()) })) }, beats.map((b) => b.text).join(''));
    const now = Date.now();
    const selfSec = estimateSeconds(beats);
    const waitSec = Math.max(0, (this.busyUntil - now) / 1000);
    this.busyUntil = Math.max(now, this.busyUntil) + selfSec * 1000;
    const replaced = this.ask?.question ?? null;
    if (this.ask) this.setAsk(null);
    return { text: this.t.sayReceipt({ waitSec, selfSec, chatOpen: this.chat.size > 0, replaced, dropped }) };
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

  /** Interruptible: an interrupt stops the walk where the pet stands, and the receipt says where. */
  private async walkTo(args: Record<string, unknown>, ctx?: ToolCallContext): Promise<ToolOutcome> {
    const run = args.run === true;
    const to = args.to;
    let target: number | 'cursor';
    if (typeof to === 'number' && Number.isFinite(to)) target = Math.max(0, Math.min(1, to));
    else if (typeof to === 'string') {
      const named: Record<string, number | 'cursor'> = { left: .05, center: .5, right: .95, cursor: 'cursor' };
      const n = Number(to);
      if (to in named) target = named[to];
      else if (to.trim() !== '' && Number.isFinite(n)) target = Math.max(0, Math.min(1, n));
      else return { text: this.t.walkBadTarget(JSON.stringify(to)), failed: true };
    } else return { text: this.t.walkNoTarget, failed: true };
    const pack = this.currentPack();
    if (pack?.manifest.can.walk === false) return { text: this.t.walkCannot(modelName(pack.manifest.name, pack.id, this.language)), failed: true };
    const walkId = nextId('w');
    if (!this.server.sendPet({ t: 'walk', id: walkId, to: target, run })) return this.notConnected('pet_walk_to');
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
        done(this.t.walkTimeout(WALK_TIMEOUT_MS / 1000));
      }, WALK_TIMEOUT_MS);
      const walk: PendingWalk = { resolve: done, timer };
      this.walks.set(walkId, walk);
      ctx?.signal?.addEventListener('abort', onAbort, { once: true });
    });
    return { text };
  }

  private async setSettings(args: Record<string, unknown>): Promise<ToolOutcome> {
    const t = this.t;
    if (!this.cfg.selfAdjust) return { text: t.selfAdjustOff('pet_set', this.userName), failed: true };
    const packs = this.packs();
    const { changes, errors } = planSettings(args, { ...this.cfg, user: this.userName }, packs, this.language, capFor(USER_MAX, this.appLanguage));
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
      const answer = await this.confirm(t.setQuestion(says(asked)), t.setChoices);
      if (answer === 'yes') { apply(asked); lines.push(t.setAgreed(this.userName, says(asked))); }
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
    if (!this.cfg.selfAdjust) return { text: t.selfAdjustOff('pet_quiet', this.userName), failed: true };
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

  envPromptVars(): Record<string, string> {
    const { language, t } = this;
    const user = this.userName;
    const reply = this.opts.replyLanguage?.() ?? null;
    return {
      'pet.user': user,
      'pet.vocab': vocabTable(this.vocab(), language),
      'pet.voice': this.cfg.asr.enabled ? t.on : t.off,
      'pet.body': this.bodyText(this.currentPack()),
      'pet.dress': dressTable(this.packs(), language),
      'pet.self': this.cfg.selfAdjust ? t.on : t.off,
      'pet.chat': this.opts.controls?.openChat ? t.chatPage(user) : '',
      'pet.reply': reply ? t.reply(user, reply) : '',
    };
  }

  /** The environment prompt template of the model-text language. */
  private envPromptFile(): string {
    const file = ENV_PROMPT_FILES[this.language];
    return existsSync(file) ? file : ENV_PROMPT_FILES.zh;
  }

  /* ---------- console ---------- */

  console(language: Language = 'zh'): WorldConsoleDecl {
    const w = this.windowHost?.state();
    const v = this.backendState();
    const c = petText(language).console;
    const lamps: WorldLamp[] = [
      {
        label: c.window,
        state: this.server.petConnected ? 'online' : w?.phase === 'running' ? 'loading' : w?.phase === 'missing' || w?.phase === 'error' ? 'error' : 'offline',
        hint: this.server.petConnected ? c.connected : w?.detail ?? c.notOpen,
      },
      {
        label: c.voice,
        state: !this.cfg.asr.enabled ? 'offline' : v?.phase === 'running' ? 'online' : v?.phase === 'starting' ? 'loading' : v?.phase === 'error' ? 'error' : 'offline',
        hint: v?.detail ?? v?.phase ?? c.notStarted,
      },
    ];
    return {
      label: c.label,
      lamps,
      panels: desktopPetPanelDecls(language),
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      stream: (panel, socket) => {
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
        vars: ['pet.user', 'pet.vocab', 'pet.voice', 'pet.body', 'pet.dress', 'pet.self', 'pet.chat', 'pet.reply']
          .map((name) => ({ name, description: c.vars[name] ?? name, ...(name === 'pet.vocab' || name === 'pet.dress' ? { multiline: true } : {}) })),
      }],
    };
  }

  private async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel === 'chat' && method === 'blob') {
      const handle = typeof args[0] === 'string' && args[0].startsWith('log:') ? args[0] : null;
      const blob = handle ? this.host?.blob(handle) : null;
      if (!blob) throw new Error(this.ui.console.noImage);
      return { $binary: { mime: blob.mime, base64: Buffer.from(blob.bytes).toString('base64') } };
    }
    if (panel === 'pet') {
      switch (method) {
        case 'state': return this.petState();
        case 'openWindow': this.openWindow(); return this.petState();
        case 'closeWindow': await this.windowHost?.stop(); return this.petState();
        case 'installElectron': void this.store.electron.install(); return this.petState();
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
          if (engine === 'funasr' || engine === 'system') this.opts.persist({ asr: { engine } });
          if (this.cfg.asr.enabled) await this.startVoiceBackend();
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

  /** Downloads the FunASR model, chooses FunASR, and starts it when voice input is on. */
  async installVoice(): Promise<void> {
    if (this.store.funasr.state().phase !== 'ready') await this.store.funasr.install();
    if (this.store.funasr.state().phase !== 'ready') { this.syncPrefs(); return; }
    // downloading the model is choosing it
    if (this.cfg.asr.engine !== 'funasr') this.opts.persist({ asr: { engine: 'funasr' } });
    if (this.cfg.asr.enabled) await this.startVoiceBackend();
    else this.syncPrefs();
  }

  petState(): Record<string, unknown> {
    return {
      connected: this.server.petConnected,
      url: this.server.port ? this.petUrl : null,
      dressUrl: this.server.port ? `${this.server.origin}/dress` : null,
      skin: this.cfg.skin,
      /** What the person is called while `user` is empty, in the app language. */
      defaultUser: this.ui.defaultUser,
      window: this.windowHost?.state() ?? null,
      electron: { ...this.store.electron.state(), supported: this.store.electron.supported },
      screen: this.screen,
    };
  }

  voiceState(): Record<string, unknown> {
    return {
      enabled: this.cfg.asr.enabled,
      engine: this.engine(),
      engineSetting: this.cfg.asr.engine,
      systemSupported: systemRecognizerSupported(),
      server: this.backendState(),
      model: { ...this.store.funasr.state(), bytes: this.store.funasr.bytes },
      mic: this.micState,
      input: {
        ...this.cfg.asr.mic,
        effectiveMode: this.micMode(),
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
