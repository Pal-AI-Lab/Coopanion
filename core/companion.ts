/**
 * The app's Core process: Cormini as the Persona, the terminal, desktop-pet and cua Worlds, the
 * DeepSeek provider next to Cortico's built-in Responses-compatible one, and Worlds or providers
 * installed from npm through the console's extension page.
 *
 * The two bundled Worlds are wired to each other and to the app: the header of the pet's right-click
 * menu pauses and resumes the run, opens the settings window and quits the app, as the console's rail
 * foot does; computer use
 * asks for permission in the pet's bubble, and falls back to its own system dialog while no
 * pet page is connected.
 *
 * First start writes the files in `seed.ts`; after that every value is the operator's, edited in
 * the console. While the active endpoint has no key, event delivery starts paused and the pet asks
 * in its bubble whether to open the settings window for it, and asks again later for as long as no
 * key is set.
 *
 * The parent (Electron main) gets `{ type: 'companion:ready', port, dataDir, keyMissing }` once the
 * console listens, `{ type: 'companion:open', path }` to show the settings window at a console
 * route and `{ type: 'companion:quit' }` to quit the whole app; it asks for a clean stop with
 * `{ type: 'companion:shutdown' }`.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BotDefinition } from 'cortico/bot.ts';
import { createBot } from 'cortico/bot.ts';
import { announceDataDir, consumeBootFlags } from 'cortico/boot.ts';
import type { WakeBus } from 'cortico/core/bus.ts';
import { secretReader } from 'cortico/core/secrets.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { loadExtensions } from 'cortico/extensions.ts';
import { deploymentRoot, providersRoot, repoRoot } from 'cortico/paths.ts';
import { providerModules, registerProviderModules } from 'cortico/providers/registry.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { TERMINAL } from 'cortico/worlds/terminal/definition.ts';
import { desktopPetDefinition, type DesktopPetWorld } from 'cortico-world-desktop-pet';
import { cuaDefinition } from 'cortico-world-cua';
import DEEPSEEK from 'cortico-provider-deepseek';
import { bundledConsoleAssets } from './bundled-panels.ts';
import { CONSOLE_PORT, DEPLOYMENT, DISPLAY_NAME, seed } from './seed.ts';

/** The active endpoint's key is set in the process environment or the endpoint's `.env`. */
function hasKey(config: CoreConfig): boolean {
  const entry = config.providers[config.activeProvider];
  if (!entry) return false;
  if (!entry.secret) return true;
  return secretReader(join(providersRoot(), config.activeProvider, '.env'))(entry.secret) !== '';
}

/** How long the pet page gets to show up before the settings window opens without asking. */
const PET_WAIT_MS = 60_000;
/** Without a key the pet asks again this long after its last ask (answered, closed or ignored). */
const ASK_AGAIN_MS = 20 * 60_000;
/** Talking to Coo without a key asks again sooner, but not within this long of the last ask. */
const ASK_TALKED_MS = 90_000;
/** How often the loop looks at the key (it reads the endpoint's `.env`). */
const POLL_MS = 2000;
/** Pet events that mean the person is talking to Coo. */
const TALK_EVENTS = new Set(['desktop-pet.message', 'desktop-pet.speech']);

const ASK = {
  first: '我还没连上模型,填好 DeepSeek 的 API Key 我才能和你说话。现在去填吗?',
  talked: '我听到了,可还没连上模型,没法回你。现在去填 DeepSeek 的 API Key 吗?',
  again: '还是没连上模型呢,填好 DeepSeek 的 API Key 我才能陪你聊天。现在去填吗?',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A start shows only the pet, so the pet asks for the missing key in its bubble; "yes" opens the
 * home page, where the key goes. The question comes back for as long as no key is set: a while
 * after each ask, or sooner once the person talks to Coo (what they said waits, undelivered, for
 * the key). Without a pet page on the first ask the home page opens anyway, since nothing else
 * would tell the person why Coo stays silent; later asks wait for the pet page.
 */
async function askForKey(pet: () => DesktopPetWorld | null, keySet: () => boolean, talked: () => boolean): Promise<void> {
  const deadline = Date.now() + PET_WAIT_MS;
  while (!pet()?.petState().connected && Date.now() < deadline) await sleep(1000);
  let lastAsk = 0;
  while (!keySet()) {
    const since = Date.now() - lastAsk;
    const spoke = talked();
    const due = lastAsk === 0 || since >= ASK_AGAIN_MS || (spoke && since >= ASK_TALKED_MS);
    const world = pet();
    if (due && (lastAsk === 0 || world?.petState().connected)) {
      const question = lastAsk === 0 ? ASK.first : spoke ? ASK.talked : ASK.again;
      const answer = await world?.confirm(question, ['去填', '等会儿']) ?? 'unavailable';
      if (keySet()) return;
      if (answer === 'yes' || (lastAsk === 0 && answer === 'unavailable')) process.send?.({ type: 'companion:open', path: '#/home' });
      lastAsk = Date.now();
      talked(); // what was said while the bubble was up got its answer there
    }
    await sleep(POLL_MS);
  }
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

async function corminiDefinition(): Promise<BotDefinition<CoreConfig>> {
  const file = join(repoRoot(), 'bots', 'cormini', 'index.ts');
  return (await import(pathToFileURL(file).href) as { default: BotDefinition<CoreConfig> }).default;
}

export async function main(): Promise<void> {
  let pet: DesktopPetWorld | null = null;
  /** Set once the bot exists; the pet's menu reads it only after the pet page connects. */
  let bus: WakeBus | null = null;
  const DESKTOP_PET = desktopPetDefinition({
    // the menu's header lends pause/resume, settings and quit; its dress tile opens the settings window's dress page
    controls: {
      isPaused: () => bus?.isPaused() ?? false,
      setPaused: (paused) => bus?.setPaused(paused),
      openSettings: () => process.send?.({ type: 'companion:open', path: '' }),
      openDress: () => process.send?.({ type: 'companion:open', path: '#/dress' }),
      quit: () => process.send?.({ type: 'companion:quit' }),
      quitLabel: '退出应用',
    },
    onCreate: (world) => { pet = world; },
  });
  const CUA = cuaDefinition({
    askPermission: async (question) => {
      const answer = await pet?.confirm(question, ['可以', '这次不行']) ?? 'unavailable';
      return answer === 'unavailable' ? null : answer === 'yes' || answer === 'timeout' ? answer : 'no';
    },
  });
  const home = deploymentRoot();
  seed(home);
  const cormini = await corminiDefinition();
  const base: BotDefinition<CoreConfig> = {
    ...cormini,
    declares: [TERMINAL.id, DESKTOP_PET.id, CUA.id],
    defaults: () => ({ ...cormini.defaults(), displayName: DISPLAY_NAME, web: { port: CONSOLE_PORT, theme: 'mint' } }),
  };
  const bundled = [TERMINAL, DESKTOP_PET, CUA] as WorldDefinition<WorldSection>[];

  // extension providers must be registered before endpoints are resolved
  const extensions = await loadExtensions(repoRoot(), {
    reserved: bundled.map((w) => w.id),
    reservedProviders: [...providerModules.map((m) => m.id), DEEPSEEK.id],
  });
  registerProviderModules([DEEPSEEK, ...extensions.providers]);
  extensions.consoleAssets.push(...bundledConsoleAssets([
    { id: DESKTOP_PET.id, packageName: 'cortico-world-desktop-pet' },
    { id: CUA.id, packageName: 'cortico-world-cua' },
  ]));
  const definition = withWorlds(base, [...bundled, ...extensions.worlds]);

  const deployDir = join(home, DEPLOYMENT);
  const loaded = loadDeployment(definition, deployDir, repoRoot(), join(repoRoot(), 'bots', 'cormini'), providersRoot());
  announceDataDir(loaded.dataDir);
  consumeBootFlags(loaded.dataDir);

  const bot = createBot(loaded, definition, { extensions });
  bus = bot.core.bus;
  // without a key every model call fails: hold events until the home page saves one and resumes
  const keyMissing = !hasKey(loaded.config);
  if (keyMissing) bot.core.bus.setPaused(true);
  const { port } = await bot.start();
  process.send?.({ type: 'companion:ready', port, dataDir: loaded.dataDir, keyMissing });
  if (keyMissing) void askForKey(() => pet, () => hasKey(loaded.config), watchTalk(bot.core.bus));

  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    const done = await Promise.race([bot.shutdown(reason).then(() => true), new Promise<false>((r) => setTimeout(() => r(false), 30_000))]);
    process.exit(done ? 0 : 1);
  };
  process.on('message', (msg: { type?: string }) => { if (msg?.type === 'companion:shutdown') void shutdown('应用退出'); });
  process.on('disconnect', () => void shutdown('应用进程已退出'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  const log = bot.core.runlog.logger('process');
  process.on('uncaughtException', (err) => {
    log.emit('error', '未捕获异常,正在关机', { event: 'uncaught-exception', err });
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.emit('error', '未处理的 promise 拒绝', { event: 'unhandled-rejection', err: reason });
  });
}
