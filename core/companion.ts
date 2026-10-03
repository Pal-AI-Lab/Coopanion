/**
 * The app's Core process: Cormini as the Persona, the terminal, desktop-pet and cua Worlds, Coo Pet
 * Provider (DeepSeek and the other model services Coo offers) next to Cortico's built-in providers,
 * and Worlds or providers installed from npm through the console's extension page.
 *
 * The two bundled Worlds are wired to each other and to the app: the header of the pet's right-click
 * menu pauses and resumes the run, opens the settings window and quits the app, as the console's rail
 * foot does; computer use
 * asks for permission in the pet's bubble, and falls back to its own system dialog while no
 * pet page is connected.
 *
 * The settings window's colours follow the pet's look (`console-theme.ts`): at start and whenever the
 * dressing page saves one.
 *
 * First start writes the files in `seed.ts`; after that every value is the operator's, edited in
 * the console. While the active endpoint has no key, event delivery starts paused. The first start
 * runs the introduction (`guide.ts`) in the pet's bubble, the key box included; after it, the pet
 * asks for a missing key in its bubble now and then, for as long as no key is set; with a key, a
 * run of failed model requests is told in the bubble with the upstream's reason. An introduction
 * walked through to the end tells Coo so in an internal event (`guideFinished`): the persona, the
 * names and the rest are now its to settle with the person, and the prompt page is where both of
 * them edit it.
 *
 * The parent (Electron main) gets `{ type: 'companion:ready', port, dataDir, keyMissing }` once the
 * console listens, `{ type: 'companion:open', path }` to show the settings window at a console
 * route, `{ type: 'companion:hide' }` to put it away (the introduction runs again on the desktop)
 * and `{ type: 'companion:quit' }` to quit the whole app; it asks for a clean stop with
 * `{ type: 'companion:shutdown' }`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
import { desktopPetDefinition, type DesktopPetWorld } from 'cortico-world-desktop-pet';
import { cuaDefinition } from 'cortico-world-cua';
import COO, { vendorOf } from 'cortico-provider-coo';
import { bundledConsoleAssets } from './bundled-panels.ts';
import { followPetLook } from './console-theme.ts';
import { askForKey, guideDone, markDone, runGuide, type GuideDeps } from './guide.ts';
import { CONSOLE_PORT, DEPLOYMENT, DISPLAY_NAME, SEED_DIR, seed } from './seed.ts';
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const GUIDE_FINISHED = (name: string) => [
  `[启动引导] ${name}刚在你的气泡里走完了启动引导:定了你怎么称呼对方(「${name}」)、你平时活泼到什么程度、用哪家模型服务,也看过了怎么语音输入、按钮和菜单在哪。`,
  `接下来可以和${name}商量你们之间的设定:你的性格和说话方式、你怎么称呼对方、对方想怎么叫你、希望你平时做什么不做什么。`,
  '- 你的人设是工作区里的 CONSTITUTION.md,每次开新 session 都放进你的系统前缀。商量出结果后你可以自己改它,下一次 session 生效。',
  '- 对方的称呼是设置窗口「习惯」页的「怎么称呼你」,由对方自己改;商量好的称呼和其他偏好可以记进你的工作区。',
  '- 设置窗口的「系统提示词」页能看到并编辑你的整份系统提示词,CONSTITUTION 也在里面。可以引导对方去那里按自己的喜好改;对方想改什么,你也可以替对方改。',
  '不用一次说完,看对方的兴致。',
].join('\n');

/** Tells Coo the introduction was walked through; delivered with the next batch (after the key is set, while events are held without one). */
function guideFinished(bus: WakeBus, name: string): void {
  bus.push({ deferred: { type: 'companion.guide-finished', source: 'companion', origin: 'internal', render: () => GUIDE_FINISHED(name) } });
}

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

const sha256 = (file: string) => existsSync(file) ? createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex') : null;

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
    cuaEnabled: at('worlds.cua.enabled'),
    cuaLevel: at('worlds.cua.permission'),
    personaChanged: sha256(join(workspace, 'CONSTITUTION.md')) !== sha256(join(SEED_DIR, 'CONSTITUTION.md')),
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
async function introduce(deps: GuideDeps, keySet: () => boolean, talked: (() => boolean) | null): Promise<void> {
  const first = !guideDone(deps.doneFile);
  if (first && keySet()) { markDone(deps.doneFile); return; }
  if (first) {
    const deadline = Date.now() + PET_WAIT_MS;
    while (!deps.pet()?.petState().connected && Date.now() < deadline) await sleep(1000);
    if (!deps.pet()?.petState().connected) process.send?.({ type: 'companion:open', path: '#/home' });
    await runGuide(deps);
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
  const DESKTOP_PET = desktopPetDefinition({
    // the menu's header lends pause/resume, settings and quit; its dress tile opens the settings window's dress page
    controls: {
      isPaused: () => bus?.isPaused() ?? false,
      setPaused: (paused) => bus?.setPaused(paused),
      openSettings: () => process.send?.({ type: 'companion:open', path: '' }),
      openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
      quit: () => process.send?.({ type: 'companion:quit' }),
      quitLabel: '退出应用',
      guide: () => {
        if (!guide) return;
        process.send?.({ type: 'companion:hide' });
        void runGuide(guide);
      },
    },
    onCreate: (world) => { pet = world; },
    onSkin: (skin) => followPetLook(join(deploymentRoot(), DEPLOYMENT), skin),
  });
  const CUA = cuaDefinition({
    askPermission: async (question) => {
      const answer = await pet?.confirm(question, ['可以', '这次不行']) ?? 'unavailable';
      if (answer !== 'unavailable') telemetry?.count('cuaAsked');
      if (answer === 'yes') telemetry?.count('cuaGranted');
      return answer === 'unavailable' ? null : answer === 'yes' || answer === 'timeout' ? answer : 'no';
    },
  });
  const home = deploymentRoot();
  seed(home);
  const cormini = await corminiDefinition();
  const base: BotDefinition<CoreConfig> = {
    ...cormini,
    declares: [TERMINAL.id, DESKTOP_PET.id, CUA.id],
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
  const bundled = [TERMINAL, DESKTOP_PET, CUA] as WorldDefinition<WorldSection>[];

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

  const deployDir = join(home, DEPLOYMENT);
  const loaded = loadDeployment(definition, deployDir, repoRoot(), join(repoRoot(), 'bots', 'cormini'), providersRoot());
  announceDataDir(loaded.dataDir);
  followPetLook(deployDir, getByPath(loaded.config as unknown as Record<string, unknown>, 'worlds.desktop-pet.skin') as { figure?: string; scheme?: string } | undefined);
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
    onFinish: (name) => guideFinished(bot.core.bus, name),
    track: (type, fields) => stats.event(type, fields),
  };
  guide = guideDeps;
  void introduce(guideDeps, () => hasKey(loaded.config), keyMissing ? watchTalk(bot.core.bus) : null).catch((err) => {
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
  process.on('message', (msg: { type?: string }) => { if (msg?.type === 'companion:shutdown') void shutdown('应用退出'); });
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
