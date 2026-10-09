/**
 * The app's Core process: Cormini as the Persona, the terminal, desktop-pet, cua and coopanion Worlds, Coo Pet
 * Provider (DeepSeek and the other model services Coo offers) next to Cortico's built-in providers,
 * and Worlds or providers installed from npm through the console's extension page.
 *
 * The two bundled Worlds are wired to each other and to the app: the header of the pet's right-click
 * menu pauses and resumes the run, opens the settings window and quits the app, as the console's rail
 * foot does; computer use
 * asks for permission in the pet's bubble, and falls back to its own system dialog while no
 * pet page is connected.
 *
 * The `coopanion` World (`notice.ts`) tells Coo what the app has to say: the release notes after
 * an update, and the settings the person changes.
 *
 * The app language (`config.language`) picks the language of what Coo reads (`language.ts`): the
 * bundled Worlds' events, receipts and environment prompts, and the seeded persona file, which is
 * swapped for the other language's while it is still exactly as seeded. Each read takes the language
 * as it is then; the prompt follows at the next prefix rebuild.
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
 * The parent (Electron main) gets `{ type: 'companion:ready', port, dataDir, keyMissing }` once the
 * console listens, `{ type: 'companion:open', path }` to show the settings window at a console
 * route, `{ type: 'companion:hide' }` to put it away (the introduction runs again on the desktop)
 * and `{ type: 'companion:quit' }` to quit the whole app; it asks for a clean stop with
 * `{ type: 'companion:shutdown' }`.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BotDefinition } from 'cortico/bot.ts';
import { createBot } from 'cortico/bot.ts';
import { announceDataDir, consumeBootFlags } from 'cortico/boot.ts';
import type { WakeBus } from 'cortico/core/bus.ts';
import { getByPath, type ConfigGroup } from 'cortico/core/config-schema.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import { pick } from 'cortico/core/language.ts';
import { secretReader } from 'cortico/core/secrets.ts';
import type { Core } from 'cortico/core/core.ts';
import type { CoreConfig, UsageRecord } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { loadExtensions, readInstalled, type ExtensionSet } from 'cortico/extensions.ts';
import { deploymentRoot, providersRoot, repoRoot } from 'cortico/paths.ts';
import { providerModules, registerProviderModules } from 'cortico/providers/registry.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { TERMINAL } from 'cortico/worlds/terminal/definition.ts';
import { desktopPetDefinition, figurePacks, type DesktopPetWorld } from 'cortico-world-desktop-pet';
import { cuaDefinition } from 'cortico-world-cua';
import COO, { vendorOf } from 'cortico-provider-coo';
import { bundledConsoleAssets } from './bundled-panels.ts';
import { followPetLook } from './console-theme.ts';
import { askForKey, guideDone, markDone, runGuide, type GuideDeps } from './guide.ts';
import { noticeDefinition, type NoticeWorld } from './notice.ts';
import { describePetTool } from './pet-status.ts';
import { isAppLanguage, modelLanguage, replyLanguage } from './language.ts';
import { CONSOLE_PORT, DEPLOYMENT, DISPLAY_NAME, followLanguage, isSeededConstitution, seed } from './seed.ts';
import { crashFields, describeEndpoint, publicExtensionName, Telemetry, type Counter } from './telemetry.ts';

/** The active endpoint's key is set in the process environment or the endpoint's `.env`. */
function hasKey(config: CoreConfig): boolean {
  const entry = config.providers[config.activeProvider];
  if (!entry) return false;
  if (!entry.secret) return true;
  return secretReader(join(providersRoot(), config.activeProvider, '.env'))(entry.secret) !== '';
}

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
/** How often the app language is compared with the last look, for the persona file. */
const LANGUAGE_LOOK_MS = 1000;

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
const COMPANION_GROUP: ConfigGroup = {
  id: 'companion',
  owner: 'persona',
  schema: {
    type: 'object',
    title: 'Coopanion',
    properties: {
      [TELEMETRY_KEY]: {
        type: 'boolean',
        title: '匿名使用统计',
        description: '发送不含对话内容的使用次数与设置,帮助改进 Coopanion。字段见 docs/TELEMETRY.md。',
      },
      // Cormini copies `rounds` when the bot is built, so a change applies from the next start
      'rounds.soft': {
        type: 'integer',
        title: '收尾提醒',
        minimum: 1,
        'x-suffix': '次',
        'x-hot': false,
        description: '一次唤醒里请求模型到这么多次,提醒 Coo 做完手上的事就结束这一轮。',
      },
      'rounds.hard': {
        type: 'integer',
        title: '单次唤醒上限',
        minimum: 1,
        'x-suffix': '次',
        'x-hot': false,
        description: '一次唤醒里最多请求模型这么多次,到了就结束这一轮。',
      },
    },
  },
};

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
    else if (input.tool.startsWith('cua_')) telemetry.count('cuaActions');
    return write(input);
  };
  const append = usageLog.append.bind(usageLog);
  usageLog.append = (rec: UsageRecord) => {
    // the endpoint the try went to; usage a World reports has no try and goes under the active one
    const endpoint = config.providers[rec.attempt?.origin.instance ?? config.activeProvider];
    telemetry.usage(describeEndpoint(endpoint, rec.model, vendorOf), {
      promptTokens: rec.promptTokens, completionTokens: rec.completionTokens, cacheHitTokens: rec.cacheHitTokens, attempt: rec.attempt,
    });
    append(rec);
  };
}

/** Model requests failed in a row before the pet says so: Cortico's own alert threshold (`STALL_ALERT_THRESHOLD` in src/core/loop.ts), where the run of failures only reaches the log. */
const FAILURES_BEFORE_HINT = 5;
/** The upstream's reason is cut to this many characters: a gateway's error page is a whole HTML document. */
const REASON_MAX = 200;

const FAILURE_HINT = {
  zh: {
    text: (n: number, status: number, reason: string) => `我连着 ${n} 次没能从模型那里拿到回复。错误${status ? ` ${status}` : ''}:${reason}。请在设置的「开始」页检查模型名和 API Key,那里可以测试连接。`,
    open: '打开设置',
    ok: '知道了',
  },
  en: {
    text: (n: number, status: number, reason: string) => `My last ${n} requests to the model failed. Error${status ? ` ${status}` : ''}: ${reason}. Check the model name and API key on the Start page in settings, where you can test the connection.`,
    open: 'Open settings',
    ok: 'OK',
  },
};

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
  return { status: err instanceof GenerationError ? err.status : 0, reason: reason.slice(0, REASON_MAX).replace(/[。.!！\s]+$/, '') };
}

/**
 * After `FAILURES_BEFORE_HINT` model requests in a row fail, the pet says why in its bubble, once
 * per run of failures, with a button to the settings window's home page, where the model and key
 * are set and tested. Any answered request ends the run; a request cut off by newer input or by
 * shutdown neither counts nor ends it.
 */
function hintFailures(core: Core<CoreConfig>, config: CoreConfig, pet: () => DesktopPetWorld | null): void {
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
      if (!options?.signal?.aborted && ++failures >= FAILURES_BEFORE_HINT && !shown) {
        const p = pet();
        if (p?.petState().connected) {
          const S = pick(config.language ?? 'zh', FAILURE_HINT);
          const { status, reason } = failureOf(err);
          shown = true;
          void p.dialog({
            text: S.text(failures, status, reason), actions: ['sad'], closable: true,
            input: { kind: 'buttons', options: [{ label: S.open, primary: true }, { label: S.ok }] },
          }).answer.then((a) => {
            if ('index' in a && a.index === 0) process.send?.({ type: 'companion:open', path: '#/home' });
            // the page went away before it showed: the next failure tries again
            if ('unavailable' in a) shown = false;
          });
        }
      }
      throw err;
    }
  };
}

const UPDATE_TEXT = {
  zh: {
    downloading: (v: string) => `发现新版本 ${v},正在后台下载,下好了我再告诉你。下载卡住的话,也可以去 GitHub 手动下载安装。`,
    ready: (v: string) => `新版本 ${v} 下载好了。现在重启更新吗?不急的话,下次退出应用时会自动装上。`,
    failed: (v: string, why: string) => `新版本 ${v} 没能下载下来:${why}。可以去 GitHub 手动下载安装。`,
    ok: '好', github: '去 GitHub 下载', install: '现在重启更新', later: '下次再说', gotIt: '知道了',
  },
  en: {
    downloading: (v: string) => `Version ${v} is out and downloading in the background; I'll tell you when it's ready. If the download stalls, you can get it from GitHub yourself.`,
    ready: (v: string) => `Version ${v} is downloaded. Restart to update now? Otherwise it installs the next time you quit the app.`,
    failed: (v: string, why: string) => `Version ${v} did not download: ${why}. You can get it from GitHub yourself.`,
    ok: 'OK', github: 'Download from GitHub', install: 'Restart and update', later: 'Later', gotIt: 'OK',
  },
};

interface UpdateStep { phase: 'downloading' | 'ready' | 'failed'; version: string; reason?: string }

/**
 * Says the updater's steps (app/updater.cjs) in the pet's bubble: once each, when the pet page is
 * there and the introduction is not running; a newer step replaces one not yet said.
 */
function sayUpdates(config: CoreConfig, pet: () => DesktopPetWorld | null, guiding: () => boolean): (step: UpdateStep) => void {
  let pending: UpdateStep | null = null;
  const said = new Set<string>();
  const S = () => pick(config.language ?? 'zh', UPDATE_TEXT);
  setInterval(() => {
    const p = pet();
    if (!pending || guiding() || !p?.petState().connected) return;
    const step = pending;
    pending = null;
    const s = S();
    const [text, options] = step.phase === 'downloading' ? [s.downloading(step.version), [{ label: s.ok, primary: true }, { label: s.github }]]
      : step.phase === 'ready' ? [s.ready(step.version), [{ label: s.install, primary: true }, { label: s.later }]]
        : [s.failed(step.version, step.reason ?? '?'), [{ label: s.github, primary: true }, { label: s.gotIt }]];
    void p.dialog({ text, actions: [step.phase === 'failed' ? 'sad' : 'happy'], closable: true, input: { kind: 'buttons', options } }).answer.then((a) => {
      if ('unavailable' in a) { pending ??= step; return; }
      if (!('index' in a)) return;
      const github = (step.phase === 'downloading' && a.index === 1) || (step.phase === 'failed' && a.index === 0);
      if (github) process.send?.({ type: 'companion:releases' });
      if (step.phase === 'ready' && a.index === 0) process.send?.({ type: 'companion:update-install' });
    });
  }, 2000).unref();
  return (step) => {
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
function snapshotOf(config: CoreConfig, workspace: string): Record<string, unknown> {
  const at = (path: string) => getByPath(config as unknown as Record<string, unknown>, path) ?? null;
  const active = config.providers[config.activeProvider];
  const endpoint = describeEndpoint(active, active?.spec?.model ?? '', vendorOf);
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
    userNamed: !['伙伴', '主人'].includes(String(at('worlds.desktop-pet.user'))),
    cuaEnabled: at('worlds.cua.enabled'),
    cuaLevel: at('worlds.cua.permission'),
    personaChanged: !isSeededConstitution(workspace),
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

async function corminiDefinition(): Promise<BotDefinition<CoreConfig>> {
  const file = join(repoRoot(), 'bots', 'cormini', 'index.ts');
  return (await import(pathToFileURL(file).href) as { default: BotDefinition<CoreConfig> }).default;
}

export async function main(): Promise<void> {
  let pet: DesktopPetWorld | null = null;
  /** Set once the bot exists; the pet's menu reads it only after the pet page connects. */
  let bus: WakeBus | null = null;
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
  const DESKTOP_PET = desktopPetDefinition({
    describeTool: describePetTool,
    // the menu's header lends pause/resume, settings and quit; its dress tile opens the settings window's dress page, the typing bubble's expand button its chat page
    controls: {
      isPaused: () => bus?.isPaused() ?? false,
      setPaused: (paused) => bus?.setPaused(paused),
      openSettings: () => process.send?.({ type: 'companion:open', path: '' }),
      openChat: () => process.send?.({ type: 'companion:open', path: '#/chat' }),
      openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
      quit: () => process.send?.({ type: 'companion:quit' }),
      quitLabel: '退出应用',
      guide: () => {
        if (!guide) return;
        process.send?.({ type: 'companion:hide' });
        void guideRun(guide);
      },
    },
    modelLanguage: () => modelLanguage(config?.language),
    replyLanguage: () => replyLanguage(config?.language),
    onCreate: (world) => { pet = world; },
    onBotChange: () => (notice as NoticeWorld | null)?.acceptCurrent(),
    onSkin: (skin) => followPetLook(join(deploymentRoot(), DEPLOYMENT), skin, (pet as DesktopPetWorld | null)?.packs() ?? []),
  });
  const CUA = cuaDefinition({
    askPermission: async (question) => {
      const answer = await pet?.confirm(question, ['可以', '这次不行']) ?? 'unavailable';
      if (answer !== 'unavailable') telemetry?.count('cuaAsked');
      if (answer === 'yes') telemetry?.count('cuaGranted');
      return answer === 'unavailable' ? null : answer === 'yes' || answer === 'timeout' ? answer : 'no';
    },
    modelLanguage: () => modelLanguage(config?.language),
  });
  const home = deploymentRoot();
  // the system's language, as the Electron main process read it; Chinese when the Core runs without it
  const system = process.env.COOPANION_SYSTEM_LANGUAGE;
  seed(home, isAppLanguage(system) ? system : 'zh');
  const deployDir = join(home, DEPLOYMENT);
  const NOTICE = noticeDefinition({
    version: process.env.COOPANION_VERSION ?? 'dev',
    notesDir: join(APP_ROOT, 'docs', 'releases'),
    stateFile: join(deployDir, NOTICE_FILE),
    alarmsFile: join(deployDir, 'alarms.json'),
    newInstall: () => !guideDone(join(deployDir, GUIDE_FILE)) && (config === null || !hasKey(config)),
    read: (path) => (config ? getByPath(config as unknown as Record<string, unknown>, path) : undefined),
    petConnected: () => (pet as DesktopPetWorld | null)?.petState().connected === true,
    guiding: () => guiding,
    onCreate: (world) => { notice = world; },
  });
  const cormini = await corminiDefinition();
  const base: BotDefinition<CoreConfig> = {
    ...cormini,
    declares: [TERMINAL.id, DESKTOP_PET.id, CUA.id, NOTICE.id],
    defaults: () => ({
      ...cormini.defaults(),
      displayName: DISPLAY_NAME,
      web: { port: CONSOLE_PORT, theme: 'mint' },
      // Cormini's 6/12 end a computer-use task partway through; 20/40 are the caps the cua and
      // desktop-pet e2e harnesses give their persona
      rounds: { soft: 20, hard: 40 },
      companion: { telemetry: true },
    }),
    build: (loaded, worlds) => {
      const parts = cormini.build(loaded, worlds);
      return { ...parts, console: { ...parts.console, configGroups: [...parts.console?.configGroups ?? [], COMPANION_GROUP] } };
    },
  };
  const bundled = [TERMINAL, DESKTOP_PET, CUA, NOTICE] as WorldDefinition<WorldSection>[];

  // extension providers must be registered before endpoints are resolved
  const extensions = await loadExtensions(repoRoot(), {
    reserved: bundled.map((w) => w.id),
    reservedProviders: [...providerModules.map((m) => m.id), COO.id],
  });
  registerProviderModules([COO, ...extensions.providers]);
  extensions.consoleAssets.push(...bundledConsoleAssets([
    { id: DESKTOP_PET.id, packageName: 'cortico-world-desktop-pet' },
    { id: CUA.id, packageName: 'cortico-world-cua' },
  ]));
  const definition = withWorlds(base, [...bundled, ...extensions.worlds]);

  const loaded = loadDeployment(definition, deployDir, repoRoot(), join(repoRoot(), 'bots', 'cormini'), providersRoot());
  config = loaded.config;
  announceDataDir(loaded.dataDir);
  followPetLook(deployDir, getByPath(loaded.config as unknown as Record<string, unknown>, 'worlds.desktop-pet.skin') as { figure?: string; scheme?: string } | undefined,
    figurePacks([join(loaded.dataDir, 'figures')]).packs);
  consumeBootFlags(loaded.dataDir);

  const bot = createBot(loaded, definition, { extensions });
  bus = bot.core.bus;
  const stats = new Telemetry({
    dir: deployDir,
    version: process.env.COOPANION_VERSION ?? 'dev',
    // development runs point it at a local telemetry-server
    url: process.env.COOPANION_TELEMETRY_URL || undefined,
    enabled: () => getByPath(loaded.config as unknown as Record<string, unknown>, TELEMETRY_KEY) !== false,
    snapshot: () => snapshotOf(loaded.config, loaded.memoryDir),
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
  const { port } = await bot.start();
  stats.start();
  process.send?.({ type: 'companion:ready', port, dataDir: loaded.dataDir, keyMissing });
  const guideDeps: GuideDeps = {
    pet: () => pet,
    console: `http://127.0.0.1:${port}`,
    doneFile: join(deployDir, GUIDE_FILE),
    openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
    onEnd: (end) => (notice as NoticeWorld | null)?.guideEnded(end),
    track: (type, fields) => stats.event(type, fields),
    language: () => loaded.config.language ?? 'zh',
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
  // a language change made while the app runs reaches the persona file as one made before a start does
  let personaLanguage = modelLanguage(loaded.config.language);
  setInterval(() => {
    const language = modelLanguage(loaded.config.language);
    if (language === personaLanguage) return;
    personaLanguage = language;
    followLanguage(loaded.memoryDir, language);
  }, LANGUAGE_LOOK_MS).unref();
  process.on('message', (msg: { type?: string } & Partial<UpdateStep>) => {
    if (msg?.type === 'companion:shutdown') void shutdown('应用退出');
    else if (msg?.type === 'companion:update' && typeof msg.version === 'string' && (msg.phase === 'downloading' || msg.phase === 'ready' || msg.phase === 'failed')) {
      update({ phase: msg.phase, version: msg.version, reason: typeof msg.reason === 'string' ? msg.reason : undefined });
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
}
