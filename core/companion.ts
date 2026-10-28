/**
 * The app's Core process: Cormini as the Persona, the console, desktop-pet and coopanion Worlds, Coo Pet
 * Provider (DeepSeek and the other model services Coo offers) and its `chatgpt` module (a ChatGPT plan,
 * signed in) next to Cortico's built-in providers, and Worlds or providers installed from npm through
 * the console's extension page.
 *
 * The desktop-pet World is wired to the app: the header of the pet's right-click menu pauses and
 * resumes the run, opens the settings window and quits the app, as the console's rail foot does.
 *
 * The `coopanion` World (`notice.ts`) tells Coo what the app has to say: the release notes after
 * an update, and the settings the person changes.
 *
 * The app language (`config.language`, `language.ts`) picks the text people read and the language of
 * what Coo reads: the bundled Worlds' events, receipts and environment prompts, and the seeded persona
 * file, which is swapped for the other language's while it is still exactly as seeded. Each read takes
 * the language as it is then; the prompt follows at the next prefix rebuild. A change, written on the
 * 「习惯」 page through the WebUI config API, goes out from `watchLanguage` the moment the live
 * config takes it: to the persona file, to Coopanion's config group titles, to the Electron main
 * process (tray menu, settings window), to the pet's pages, and to the settings window's colour scheme names.
 * `companion.autoUpdate` is sent to the main process at load and on change (`update-settings.ts`).
 *
 * The settings window's colours follow the pet's look (`console-theme.ts`): at start and whenever the
 * dressing page saves one.
 *
 * First start writes the files in `seed.ts`; after that every value is the operator's, edited in
 * the console. While the active endpoint has no key, event delivery starts paused. The first start
 * runs the introduction (`guide.ts`) in the pet's bubble, the key box included; after it, the pet
 * asks for a missing key in its bubble now and then, for as long as no key is set; with a key, a
 * run of failed model requests is told in the bubble with the upstream's reason. However the
 * introduction ends, the `coopanion` World hands Coo its record; walked through to the end, also
 * that the persona, the names and the rest are now its to settle with the person, and the prompt
 * page is where both of them edit it.
 *
 * The parent (Electron main) gets `{ type: 'companion:ready', port, dataDir, keyMissing, language }` once the
 * console listens, `{ type: 'companion:language', language }` after the app language changes, `{ type: 'companion:open', path }` to show the settings window at a console
 * route, `{ type: 'companion:browse', url }` to open the ChatGPT sign-in page in the system browser,
 * `{ type: 'companion:hide' }` to put it away (the introduction runs again on the desktop)
 * and `{ type: 'companion:quit' }` to quit the whole app; it asks for a clean stop with
 * `{ type: 'companion:shutdown' }`. A start that cannot go on says why before it exits:
 * `{ type: 'companion:locked', pid, file }` when another process holds the data directory, and
 * `{ type: 'companion:ports-busy', from, to }` when every console port Cortico tried could not be listened on.
 */
import { readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BotDefinition } from 'cortico/bot.ts';
import { createBot } from 'cortico/bot.ts';
import { announceDataDir, consumeBootFlags } from 'cortico/boot.ts';
import type { WakeBus } from 'cortico/core/bus.ts';
import { getByPath, type ConfigGroup } from 'cortico/core/config-schema.ts';
import { LANGUAGES, LANGUAGE_NAMES, isLanguage, type Language } from 'cortico/core/language.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import { secretReader } from 'cortico/core/secrets.ts';
import type { Core } from 'cortico/core/core.ts';
import type { CoreConfig, UsageRecord } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { loadExtensions, readInstalled, type ExtensionSet } from 'cortico/extensions.ts';
import { deploymentRoot, providersRoot, repoRoot } from 'cortico/paths.ts';
import { providerModules, registerProviderModules } from 'cortico/providers/registry.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { InstanceLockedError } from 'cortico/core/instance-lock.ts';
import { CONSOLE } from 'cortico/worlds/console/definition.ts';
import { desktopPetDefinition, figurePacks, type DesktopPetWorld, type PetDialogHandle } from 'cortico-world-desktop-pet';
import COO, { CHATGPT, CHATGPT_PROVIDER, signedIn, usageLimited, vendorOf } from 'cortico-provider-coo';
import { appWebUiAsset, bundledWebUiAssets } from './bundled-panels.ts';
import { followPetLook } from './console-theme.ts';
import { askForKey, guideDone, markDone, runGuide, type GuideDeps } from './guide.ts';
import { NOTICE_ID, noticeDefinition, type NoticeWorld } from './notice.ts';
import { coreText } from './i18n/index.ts';
import { petToolDescriber } from './pet-status.ts';
import { appLanguage, modelLanguage, replyLanguage } from './language.ts';
import { CONSOLE_PORT, DEPLOYMENT, DISPLAY_NAME, followLanguage as followPersonaLanguage, personaOf, seed } from './seed.ts';
import { coopanionPersona, type CoopanionPersona } from './persona.ts';
import type { Cormini } from '../vendor/cortico/bots/cormini/persona/persona.ts';
import type { contextStageConfigGroup } from '../vendor/cortico/bots/cormini/persona/config.ts';
import type { CorminiConfig } from '../vendor/cortico/bots/cormini/index.ts';
import { crashFields, describeEndpoint, publicExtensionName, Telemetry, type Counter } from './telemetry.ts';
import { AUTO_UPDATE_DEFAULT, autoUpdateProperties, watchAutoUpdate, type UpdateConfig } from './update-settings.ts';

/** The active endpoint's key is set in the process environment or the endpoint's `.env`; a ChatGPT plan's endpoint is signed in. */
function hasKey(config: CoreConfig): boolean {
  const entry = config.providers[config.activeProvider];
  if (!entry) return false;
  if (entry.kind === CHATGPT_PROVIDER.id) return signedIn(join(providersRoot(), config.activeProvider));
  if (!entry.secret) return true;
  return secretReader(join(providersRoot(), config.activeProvider, '.env'))(entry.secret) !== '';
}

/** The app's version, as the Electron main process passes it; `dev` in a development run. */
const APP_VERSION = process.env.COOPANION_VERSION ?? 'dev';
/** The program directory; crash reports name files relative to it. */
const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
/** How long the pet page gets to show up on a first start before the settings window opens instead. */
const PET_WAIT_MS = 60_000;
/** Pet events that mean the person is talking to Coo. */
const TALK_EVENTS = new Set(['desktop-pet.message', 'desktop-pet.speech']);
/** After an introduction where the key was put off, the first ask waits this long (talking to Coo asks sooner). */
const ASK_AFTER_GUIDE_MS = 20 * 60_000;
/** Written in the deployment directory once the introduction has run. */
const GUIDE_FILE = 'guide.json';
/** The last version the `coopanion` World told Coo about, in the deployment directory. */
const NOTICE_FILE = 'notice.json';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Notes the person talking to Coo on the bus; the returned check reports it once and resets. */
function watchTalk(bus: WakeBus): () => boolean {
  let heard = false;
  const push = bus.push.bind(bus);
  bus.push = (item, opts) => {
    if (item.event && TALK_EVENTS.has(item.event.type)) heard = true;
    push(item, opts);
  };
  return () => { const was = heard; heard = false; return was; };
}

/** The switch for anonymous usage statistics, on the 「习惯」 page and in the advanced settings. */
const TELEMETRY_KEY = 'companion.telemetry';
/** Whether the Chat page shows the context ring; set on the 「习惯」 page. */
const CONTEXT_RING_KEY = 'companion.contextRing';
/** The `x-options` kind of the app language setting: the eleven languages, each named in itself. */
const LANGUAGE_OPTIONS = 'coopanion.language';

/**
 * Coopanion's own settings: the app language, automatic updates, statistics, the context ring and the round
 * caps. A Persona's config group is not asked for per request, so it is titled in the app language,
 * which the settings window follows; `main` retitles the object in place when the language changes.
 */
function companionGroup(language: Language): ConfigGroup {
  const s = coreText(language).settings;
  return {
    id: 'companion',
    owner: 'persona',
    schema: {
      type: 'object',
      title: 'Coopanion',
      properties: {
        language: { type: 'string', title: s.language.title, description: s.language.description, enum: [...LANGUAGES], 'x-options': LANGUAGE_OPTIONS, 'x-hot': true },
        [TELEMETRY_KEY]: { type: 'boolean', title: s.telemetry.title, description: s.telemetry.description },
        [CONTEXT_RING_KEY]: { type: 'boolean', title: s.contextRing.title, description: s.contextRing.description, 'x-hot': true },
        ...autoUpdateProperties(language),
        // Cormini copies `rounds` when the bot is built, so a change applies from the next start
        'rounds.soft': { type: 'integer', title: s.roundsSoft.title, minimum: 1, 'x-suffix': s.roundsSoft.suffix, 'x-hot': false, description: s.roundsSoft.description },
        'rounds.hard': { type: 'integer', title: s.roundsHard.title, minimum: 1, 'x-suffix': s.roundsHard.suffix, 'x-hot': false, description: s.roundsHard.description },
      },
    },
  };
}

/**
 * Makes `config.language` an accessor on the live config object, so `onChange` runs right after any write
 * that changes the app language: the WebUI config API and a World's persist both set it there.
 * `config.json` is written by those paths from their own values, so the accessor only watches.
 */
function watchLanguage(config: CoreConfig, onChange: (language: Language) => void): void {
  let value: unknown = config.language;
  Object.defineProperty(config, 'language', {
    enumerable: true,
    configurable: true,
    get: () => value,
    set: (next: unknown) => {
      const was = appLanguage(value);
      value = next;
      if (appLanguage(next) !== was) onChange(appLanguage(next));
    },
  });
}

/** Pet events counted for statistics, and whether they are a message to Coo. */
const EVENT_COUNTERS: Record<string, [Counter, boolean]> = {
  'desktop-pet.message': ['messagesText', true],
  'desktop-pet.speech': ['messagesVoice', true],
  'desktop-pet.touch': ['touches', false],
  'desktop-pet.answer': ['answers', false],
};

/** Counts the person's events, Coo's lines, computer-use actions and model calls for `telemetry`. */
function countUse(core: Core<CoreConfig>, config: CoreConfig, telemetry: Telemetry): void {
  const { bus, toolLog, usageLog } = core;
  const push = bus.push.bind(bus);
  bus.push = (item, opts) => {
    const hit = item.event ? EVENT_COUNTERS[item.event.type] : undefined;
    if (hit) { telemetry.count(hit[0]); telemetry.interacted(hit[1]); }
    push(item, opts);
  };
  const write = toolLog.write.bind(toolLog);
  toolLog.write = (input) => {
    if (input.tool === 'pet_say') telemetry.count('petReplies');
    else if (input.tool.startsWith('pet_cua_')) telemetry.count('cuaActions');
    return write(input);
  };
  const append = usageLog.append.bind(usageLog);
  usageLog.append = (rec: UsageRecord) => {
    // the endpoint the try went to; usage a World reports has no try and goes under the active one
    const endpoint = config.providers[rec.attempt?.origin.instance ?? config.activeProvider];
    telemetry.usage(describeEndpoint(endpoint, rec.model, endpointVendor(endpoint)), {
      promptTokens: rec.promptTokens, completionTokens: rec.completionTokens, cacheHitTokens: rec.cacheHitTokens, attempt: rec.attempt,
    });
    append(rec);
  };
}

/** Reads an endpoint's service for the statistics: a ChatGPT plan by its module, the others by base URL. */
const endpointVendor = (entry: { kind: string } | undefined) => (url: string | undefined) => (entry?.kind === CHATGPT_PROVIDER.id ? CHATGPT : vendorOf(url));

/** Model requests failed in a row before the pet says so: Cortico's own alert threshold (`STALL_ALERT_THRESHOLD` in src/core/loop.ts), where the run of failures only reaches the log. */
const FAILURES_BEFORE_HINT = 5;
/** The upstream's reason is cut to this many characters: a gateway's error page is a whole HTML document. */
const REASON_MAX = 200;
/** What Cortico's Responses provider appends to a 400 that asks for reasoning while `sendSyntheticReasoning` is off. */
const SYNTHETIC_REASONING_OFF = 'sendSyntheticReasoning is off';

/**
 * The upstream's own words: `error.message` of a JSON body, else the body; without a body (no
 * connection, a timeout), the message of the innermost cause, such as `getaddrinfo ENOTFOUND <host>`.
 */
function failureOf(err: unknown): { status: number; reason: string } {
  let root = err;
  while (root instanceof Error && root.cause instanceof Error) root = root.cause;
  let said = err instanceof GenerationError ? err.body.trim() : '';
  try {
    const body = JSON.parse(said) as { error?: { message?: unknown }; message?: unknown };
    const message = body.error?.message ?? body.message;
    if (typeof message === 'string') said = message;
  } catch { /* not JSON: the body as it came */ }
  const reason = said || (root instanceof Error ? root.message : String(root));
  // the line it goes into ends the sentence itself
  return { status: err instanceof GenerationError ? err.status : 0, reason: reason.slice(0, REASON_MAX).replace(/[\s.,!?;:。．，！？；：、]+$/, '') };
}

/**
 * After `FAILURES_BEFORE_HINT` model requests in a row fail, the pet says why in its bubble, once
 * per run of failures. The last failure's status picks what follows the upstream's reason: 401 and
 * 403 point at the key and 404 at the model name, each with a button to the settings window's home
 * page, where both are set and tested; 429 and 5xx say the service is in trouble or limiting
 * requests; any other status, 0 included, adds nothing. Any answered request ends the run; a
 * request cut off by newer input or by shutdown neither counts nor ends it, and neither does one
 * refused for a ChatGPT plan's usage limit, which only reaches the log. A 400 the vendor preset
 * caused by turning `sendSyntheticReasoning` off is said as that, with no settings button: nothing
 * the person can set fixes it.
 */
export function hintFailures(core: Core<CoreConfig>, config: CoreConfig, pet: () => DesktopPetWorld | null): void {
  const { llm } = core;
  const respond = llm.respond.bind(llm);
  let failures = 0;
  let shown = false;
  llm.respond = async (request, options) => {
    try {
      const answered = await respond(request, options);
      failures = 0;
      shown = false;
      return answered;
    } catch (err) {
      if (!options?.signal?.aborted && !usageLimited(err) && ++failures >= FAILURES_BEFORE_HINT && !shown) {
        const p = pet();
        if (p?.petState().connected) {
          const S = coreText(appLanguage(config.language)).failure;
          const { status, reason } = failureOf(err);
          const replay = err instanceof Error && err.message.includes(SYNTHETIC_REASONING_OFF);
          const advice = status === 401 || status === 403 ? S.advice.key
            : status === 404 ? S.advice.model
            : status === 429 || status >= 500 ? S.advice.later
            : '';
          const settings = status === 401 || status === 403 || status === 404;
          shown = true;
          void p.dialog({
            text: replay ? S.reasoningReplay(failures) : S.text(failures, status, reason, advice), actions: ['sad'], closable: true,
            input: { kind: 'buttons', options: settings ? [{ label: S.open, primary: true }, { label: S.ok }] : [{ label: S.ok, primary: true }] },
          }).answer.then((a) => {
            if (settings && 'index' in a && a.index === 0) process.send?.({ type: 'companion:open', path: '#/home' });
            // the page went away before it showed: the next failure tries again
            if ('unavailable' in a) shown = false;
          });
        }
      }
      throw err;
    }
  };
}

interface UpdateStep { phase: 'downloading' | 'ready' | 'failed'; version: string; reason?: string }

/**
 * Says the updater's steps (app/updater.cjs) in the pet's bubble: once each, when the pet page is
 * there and the introduction is not running; a newer step replaces one not yet said.
 */
function sayUpdates(config: CoreConfig, pet: () => DesktopPetWorld | null, guiding: () => boolean): (step: UpdateStep | null) => void {
  let pending: UpdateStep | null = null;
  let dialog: PetDialogHandle | null = null;
  const said = new Set<string>();
  const S = () => coreText(appLanguage(config.language)).update;
  setInterval(() => {
    const p = pet();
    if (!pending || guiding() || !p?.petState().connected) return;
    const step = pending;
    pending = null;
    const s = S();
    const [text, options] = step.phase === 'downloading' ? [s.downloading(step.version), [{ label: s.ok, primary: true }, { label: s.trouble, hover: s.githubByHand }]]
      : step.phase === 'ready' ? [s.ready(step.version), [{ label: s.install, primary: true }, { label: s.later }]]
        : [s.failed(step.version, step.reason ?? '?'), [{ label: s.github, primary: true }, { label: s.gotIt }]];
    dialog?.close();
    const shown = p.dialog({ text, actions: [step.phase === 'failed' ? 'sad' : 'happy'], closable: true, input: { kind: 'buttons', options } });
    dialog = shown;
    void shown.answer.then((a) => {
      if (dialog !== shown) return;
      dialog = null;
      if ('unavailable' in a) { pending ??= step; return; }
      if (!('index' in a)) return;
      const github = (step.phase === 'downloading' && a.index === 1) || (step.phase === 'failed' && a.index === 0);
      if (github) process.send?.({ type: 'companion:releases' });
      if (step.phase === 'ready' && a.index === 0) process.send?.({ type: 'companion:update-install' });
    });
  }, 2000).unref();
  return (step) => {
    if (!step) {
      pending = null;
      said.clear();
      dialog?.close();
      dialog = null;
      return;
    }
    const key = `${step.phase}:${step.version}`;
    if (said.has(key)) return;
    said.add(key);
    pending = step;
  };
}

/** Files in the workspace (Coo's memory), `.git` left out; stops counting at `cap`. */
function countFiles(dir: string, cap = 10_000): number {
  let n = 0;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (n >= cap) return;
      if (e.name === '.git') continue;
      if (e.isDirectory()) walk(join(d, e.name));
      else n += 1;
    }
  };
  try { walk(dir); } catch { /* unreadable: what was counted so far */ }
  return n;
}

/** The settings and state sent with each day's statistics (docs/TELEMETRY.md, the day record). */
function snapshotOf(config: CoreConfig, workspace: string, git: () => boolean): Record<string, unknown> {
  const at = (path: string) => getByPath(config as unknown as Record<string, unknown>, path) ?? null;
  const active = config.providers[config.activeProvider];
  const endpoint = describeEndpoint(active, active?.spec?.model ?? '', endpointVendor(active));
  return {
    vendor: endpoint.vendor,
    model: endpoint.model,
    endpointKind: endpoint.endpointKind,
    language: config.language ?? null,
    autostart: process.env.COOPANION_AUTOSTART === '1',
    figure: at('worlds.desktop-pet.skin.figure'),
    scheme: at('worlds.desktop-pet.skin.scheme'),
    roam: at('worlds.desktop-pet.roam'),
    voiceInput: at('worlds.desktop-pet.asr.enabled'),
    asrEngine: at('worlds.desktop-pet.asr.engine'),
    micMode: at('worlds.desktop-pet.asr.mic.mode'),
    talkKey: at('worlds.desktop-pet.asr.mic.hotkey'),
    sound: at('worlds.desktop-pet.sound'),
    sounds: at('worlds.desktop-pet.sounds'),
    theme: at('worlds.desktop-pet.theme'),
    scale: at('worlds.desktop-pet.window.scale'),
    lockFrameRate: at('worlds.desktop-pet.window.lockFrameRate'),
    hoverButtons: at('worlds.desktop-pet.hoverButtons'),
    doubleClickChat: at('worlds.desktop-pet.doubleClickChat'),
    rememberPosition: at('worlds.desktop-pet.rememberPosition'),
    // empty is the app language's default; the others were the defaults of earlier versions
    userNamed: !['', '伙伴', '主人'].includes(String(at('worlds.desktop-pet.user') ?? '')),
    cuaEnabled: at('worlds.desktop-pet.cua.enabled'),
    cuaLevel: at('worlds.desktop-pet.cua.permission'),
    persona: personaOf(workspace) ?? 'custom',
    personaChanged: personaOf(workspace) === null,
    gitAvailable: git(),
    memoryFiles: countFiles(workspace),
  };
}

/** Installed extensions as reported: a package from a registry by name, anything else as `private`. */
function reportedExtensions(extensions: ExtensionSet): Array<{ name: string; version: string | null; kind: string | null }> {
  const records = new Map(extensions.records.map((r) => [r.name, r]));
  return readInstalled(extensions.dir).map(({ name, spec }) => {
    const shown = publicExtensionName(name, spec);
    const r = records.get(name);
    return { name: shown, version: shown === 'private' ? null : r?.version ?? null, kind: r?.kind ?? null };
  });
}

/**
 * The introduction on a first start, then the key asks while no key is set. An install that already
 * has a key (one from before the introduction existed) counts as introduced. When no pet page shows
 * up on a first start, the settings window opens at the home page instead, since nothing else would
 * tell the person why Coo stays silent.
 */
async function introduce(deps: GuideDeps, run: (deps: GuideDeps) => Promise<void>, keySet: () => boolean, talked: (() => boolean) | null): Promise<void> {
  const first = !guideDone(deps.doneFile);
  if (first && keySet()) { markDone(deps.doneFile); return; }
  if (first) {
    const deadline = Date.now() + PET_WAIT_MS;
    while (!deps.pet()?.petState().connected && Date.now() < deadline) await sleep(1000);
    if (deps.pet()?.petState().connected) deps.track?.('pet_shown', { ms: Math.round(process.uptime() * 1000) });
    else {
      deps.track?.('pet_missing', {});
      process.send?.({ type: 'companion:open', path: '#/home' });
    }
    await run(deps);
  }
  if (!talked) return;
  // the introduction just asked for the key and the person put it off: the next ask waits
  await askForKey(deps, keySet, talked, first ? ASK_AFTER_GUIDE_MS : 0);
}

/** Cormini's bot definition, its Persona class and its context config group, from the staged Cortico. */
async function cormini() {
  const load = <T>(...path: string[]) => import(pathToFileURL(join(repoRoot(), 'bots', 'cormini', ...path)).href) as Promise<T>;
  const [definition, persona, config] = await Promise.all([
    load<{ default: BotDefinition<CorminiConfig> }>('index.ts'),
    load<{ Cormini: typeof Cormini }>('persona', 'persona.ts'),
    load<{ contextStageConfigGroup: typeof contextStageConfigGroup }>('persona', 'config.ts'),
  ]);
  return { definition: definition.default, Persona: coopanionPersona(persona.Cormini), contextGroup: config.contextStageConfigGroup('cormini') };
}

export async function main(): Promise<void> {
  let pet: DesktopPetWorld | null = null;
  /** Set once the bot exists; the pet's menu reads it only after the pet page connects. */
  let bus: WakeBus | null = null;
  /** Set once the bot exists. */
  let core: Core<CoreConfig> | null = null;
  /** Set once the console listens. */
  let guide: GuideDeps | null = null;
  /** Set once the deployment is loaded. */
  let telemetry: Telemetry | null = null;
  let config: CoreConfig | null = null;
  let notice: NoticeWorld | null = null;
  /** The introduction is running: the settings it makes are not told as changes. */
  let guiding = false;
  const guideRun = async (deps: GuideDeps) => {
    guiding = true;
    try { await runGuide(deps); } finally { guiding = false; }
  };
  /** The app language as the live config has it, Chinese before the config is loaded. */
  const language = () => appLanguage(config?.language);
  /** Figure pack directories besides the data directory's `figures/`, from the main process (the Steam Workshop's, app/steam.cjs). */
  const packRoots = (process.env.COOPANION_PACK_ROOTS ?? '').split(delimiter).filter(Boolean);
  const DESKTOP_PET = desktopPetDefinition({
    // `displayName` of the live config: a rename reaches the menu header, the chat page and computer use's question without a restart
    botName: () => config?.displayName ?? DISPLAY_NAME,
    packRoots: () => packRoots,
    describeTool: petToolDescriber(language),
    // the menu's header lends pause/resume, settings and quit; its dress tile opens the settings window's dress page, the typing bubble's expand button its chat page
    controls: {
      isPaused: () => bus?.isPaused() ?? false,
      setPaused: (paused) => bus?.setPaused(paused),
      openSettings: () => process.send?.({ type: 'companion:open', path: '' }),
      openChat: () => process.send?.({ type: 'companion:open', path: '#/chat' }),
      openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
      openCuaSettings: () => process.send?.({ type: 'companion:open', path: '#/pet?cua=enable' }),
      quit: () => process.send?.({ type: 'companion:quit' }),
      quitLabel: () => coreText(language()).quit,
      guide: () => {
        if (!guide) return;
        process.send?.({ type: 'companion:hide' });
        void guideRun(guide);
      },
    },
    modelLanguage: () => modelLanguage(config?.language),
    replyLanguage: () => replyLanguage(config?.language),
    language,
    onCreate: (world) => { pet = world; },
    onCuaAnswer: (answer) => {
      telemetry?.count('cuaAsked');
      if (answer === 'yes') telemetry?.count('cuaGranted');
    },
    onBotChange: () => (notice as NoticeWorld | null)?.acceptCurrent(),
    onSkin: (skin) => followPetLook(join(deploymentRoot(), DEPLOYMENT), skin, (pet as DesktopPetWorld | null)?.packs() ?? [], language()),
  });
  const home = deploymentRoot();
  // the system's language, as the Electron main process read it; Chinese when the Core runs without it
  const system = process.env.COOPANION_SYSTEM_LANGUAGE;
  seed(home, isLanguage(system) ? system : 'zh');
  const deployDir = join(home, DEPLOYMENT);
  const NOTICE = noticeDefinition({
    version: APP_VERSION,
    notesDir: join(APP_ROOT, 'docs', 'releases'),
    stateFile: join(deployDir, NOTICE_FILE),
    alarmsFile: join(deployDir, 'alarms.json'),
    newInstall: () => !guideDone(join(deployDir, GUIDE_FILE)) && (config === null || !hasKey(config)),
    read: (path) => (config ? getByPath(config as unknown as Record<string, unknown>, path) : undefined),
    petConnected: () => (pet as DesktopPetWorld | null)?.petState().connected === true,
    guiding: () => guiding,
    refreshTools: async () => { if (core?.loop.modulePrefixDrift().length) await core.loop.reloadSystemPrefix(); },
    onCreate: (world) => { notice = world; },
    label: () => coreText(language()).noticeLabel,
  });
  /** Coopanion's config group; the console reads this object, retitled in place when the app language changes. */
  const settingsGroup = companionGroup('zh');
  const base = await cormini();
  /** Coo's Persona, once the bot is built. */
  let coo: CoopanionPersona | null = null;
  const definitionBase: BotDefinition<CorminiConfig & UpdateConfig> = {
    ...base.definition,
    declares: [CONSOLE.id, DESKTOP_PET.id, NOTICE.id],
    // Cormini's tools under the same names; the memory differs by PARTNER.md and the version history
    describe: {
      tools: base.definition.describe?.tools ?? [],
      memory: {
        form: {
          zh: '工作区目录里的文本文件,有 Git 时每次改动存为一个版本;CONSTITUTION.md、PARTNER.md 与文件清单进系统前缀,其余按需用文件工具读写。',
          en: 'Text files in a workspace directory, each change kept as a version where Git is available; CONSTITUTION.md, PARTNER.md and the file listing are in the system prefix, the rest is read and written with the file tools.',
        },
      },
    },
    defaults: () => ({
      ...base.definition.defaults(),
      displayName: DISPLAY_NAME,
      web: { port: CONSOLE_PORT, theme: 'mint' },
      // Cormini's 6/12 end a computer-use task partway through; 20/40 are the caps the desktop-pet
      // e2e harnesses give their persona
      rounds: { soft: 20, hard: 40 },
      context: { ...base.definition.defaults().context, maxTokens: 128_000, keepRatio: 0.25 },
      companion: { telemetry: true, contextRing: false, autoUpdate: AUTO_UPDATE_DEFAULT },
    }),
    // Cormini's own build with Coo's Persona class; the workspace is snapshotted before Coo can write to it
    build: (loaded, worlds) => {
      const cfg = loaded.config;
      const persona = new base.Persona({
        memoryDir: loaded.memoryDir,
        context: () => cfg.context,
        rounds: { ...cfg.rounds },
        worlds,
        orientationOverrideFile: join(loaded.rootDir, 'prompts', 'ORIENTATION.md'),
        firstTurnDir: join(loaded.rootDir, 'prompts'),
        tickDelayMs: () => (cfg.tick.intervalMinutes === null ? null : cfg.tick.intervalMinutes * 60_000),
      });
      persona.snapshot(APP_VERSION);
      coo = persona;
      return {
        persona,
        onStart: () => persona.startRhythm(),
        onStop: () => persona.stopRhythm(),
        webUi: {
          configGroups: [base.contextGroup, settingsGroup],
          status: () => ({ context: { maxTokens: cfg.context.maxTokens, softRatio: cfg.context.softRatio } }),
          configOptions: (kind) => (kind === LANGUAGE_OPTIONS ? LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] })) : []),
        },
      };
    },
  };
  const bundled = [CONSOLE, DESKTOP_PET, NOTICE] as WorldDefinition<WorldSection>[];

  // extension providers must be registered before endpoints are resolved
  const extensions = await loadExtensions(repoRoot(), {
    reserved: bundled.map((w) => w.id),
    reservedProviders: [...providerModules.map((m) => m.id), COO.id, CHATGPT_PROVIDER.id],
  });
  registerProviderModules([COO, CHATGPT_PROVIDER, ...extensions.providers]);
  extensions.webUiAssets.push(...bundledWebUiAssets([
    { id: DESKTOP_PET.id, packageName: 'cortico-world-desktop-pet' },
  ]), ...appWebUiAsset(NOTICE_ID, join(APP_ROOT, 'build', 'panels', 'coopanion'), APP_VERSION));
  const definition = withWorlds(definitionBase, [...bundled, ...extensions.worlds]);

  const loaded = loadDeployment(definition, deployDir, repoRoot(), join(repoRoot(), 'bots', 'cormini'), providersRoot());
  config = loaded.config;
  watchAutoUpdate(loaded.config, (enabled) => process.send?.({ type: 'companion:auto-update', enabled }));
  Object.assign(settingsGroup, companionGroup(language()));
  watchLanguage(loaded.config, (next) => {
    Object.assign(settingsGroup, companionGroup(next));
    followPersonaLanguage(loaded.memoryDir, next);
    process.send?.({ type: 'companion:language', language: next });
    (pet as DesktopPetWorld | null)?.refresh();
    followPetLook(deployDir, getByPath(loaded.config as unknown as Record<string, unknown>, 'worlds.desktop-pet.skin') as { figure?: string; scheme?: string } | undefined,
      (pet as DesktopPetWorld | null)?.packs() ?? [], next);
  });
  announceDataDir(loaded.dataDir);
  followPetLook(deployDir, getByPath(loaded.config as unknown as Record<string, unknown>, 'worlds.desktop-pet.skin') as { figure?: string; scheme?: string } | undefined,
    figurePacks([join(loaded.dataDir, 'figures'), ...packRoots]).packs, language());
  consumeBootFlags(loaded.dataDir);

  const bot = createBot(loaded, definition, { extensions });
  bus = bot.core.bus;
  core = bot.core;
  const stats = new Telemetry({
    dir: deployDir,
    version: APP_VERSION,
    // development runs point it at a local telemetry-server
    url: process.env.COOPANION_TELEMETRY_URL || undefined,
    enabled: () => getByPath(loaded.config as unknown as Record<string, unknown>, TELEMETRY_KEY) !== false,
    snapshot: () => snapshotOf(loaded.config, loaded.memoryDir, () => coo?.gitAvailable() ?? false),
    extensions: () => reportedExtensions(extensions),
  });
  telemetry = stats;
  countUse(bot.core, loaded.config, stats);
  hintFailures(bot.core, loaded.config, () => pet);
  // set by app/core-host.cjs when this Core replaces one that exited unasked
  const exited = process.env.COOPANION_CORE_EXIT;
  delete process.env.COOPANION_CORE_EXIT;
  if (exited) {
    const code = Number(exited);
    stats.event('crash', { where: 'core-exit', exitCode: Number.isInteger(code) ? code : null, signal: Number.isInteger(code) ? null : exited.slice(0, 20) });
  }
  // without a key every model call fails: hold events until the home page saves one and resumes
  const keyMissing = !hasKey(loaded.config);
  if (keyMissing) bot.core.bus.setPaused(true);
  const { port } = await bot.start().catch(async (err: unknown) => {
    const tell = (msg: object) => new Promise<void>((done) => { if (!process.send?.(msg, () => done())) done(); });
    // the app says why, rather than restarting this Core into the same wall: another process holds the data
    // directory, or the console found no port to listen on (Cortico throws the last candidate's listen error)
    if (err instanceof InstanceLockedError) await tell({ type: 'companion:locked', pid: err.pid, file: err.file });
    const { code, port: last } = (err ?? {}) as { code?: string; port?: number };
    const from = loaded.config.web.port;
    if ((code === 'EADDRINUSE' || code === 'EACCES') && typeof last === 'number' && last >= from) await tell({ type: 'companion:ports-busy', from, to: last });
    throw err;
  });
  stats.start();
  process.send?.({ type: 'companion:ready', port, dataDir: loaded.dataDir, keyMissing, language: language() });
  const guideDeps: GuideDeps = {
    pet: () => pet,
    console: `http://127.0.0.1:${port}`,
    doneFile: join(deployDir, GUIDE_FILE),
    workspace: loaded.memoryDir,
    whale: process.env.COOPANION_CHANNEL !== 'steam',
    openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
    onEnd: (end) => (notice as NoticeWorld | null)?.guideEnded(end),
    track: (type, fields) => stats.event(type, fields),
    language,
    modelLanguage: () => modelLanguage(loaded.config.language),
  };
  guide = guideDeps;
  void introduce(guideDeps, guideRun, () => hasKey(loaded.config), keyMissing ? watchTalk(bot.core.bus) : null).catch((err) => {
    bot.core.runlog.logger('process').emit('error', '引导出错', { event: 'guide-error', err });
  });

  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    const done = await Promise.race([
      Promise.all([bot.shutdown(reason), stats.stop()]).then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 30_000)),
    ]);
    process.exit(done ? 0 : 1);
  };
  const update = sayUpdates(loaded.config, () => pet, () => guiding);
  process.on('message', (msg: { type?: string; step?: UpdateStep | null }) => {
    if (msg?.type === 'companion:shutdown') void shutdown('应用退出');
    else if (msg?.type === 'companion:update') {
      const step = msg.step;
      if (step === null) update(null);
      else if (step && typeof step.version === 'string' && (step.phase === 'downloading' || step.phase === 'ready' || step.phase === 'failed')) update(step);
    }
  });
  process.on('disconnect', () => void shutdown('应用进程已退出'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  const log = bot.core.runlog.logger('process');
  // a rejection that repeats on a timer would fill the event queue and push the other events out: each distinct one is reported once a run
  const reported = new Set<string>();
  const crash = (where: string, err: unknown) => {
    const fields = { where, ...crashFields(err, APP_ROOT, [extensions.dir]) };
    const key = JSON.stringify(fields);
    if (reported.has(key)) return;
    reported.add(key);
    stats.event('crash', fields);
  };
  process.on('uncaughtException', (err) => {
    log.emit('error', '未捕获异常,正在关机', { event: 'uncaught-exception', err });
    crash('core', err);
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.emit('error', '未处理的 promise 拒绝', { event: 'unhandled-rejection', err: reason });
    crash('core-rejection', reason);
  });
  // an exited main loop delivers nothing more; the app restarts a Core process that exits on its own
  bot.core.runlog.onWrite((entry) => {
    if (entry.event !== 'loop-exit') return;
    crash('core-loop', entry.err && Object.assign(new Error(entry.err.message), entry.err));
    void shutdown('主循环异常退出');
  });
}
