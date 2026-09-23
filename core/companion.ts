/**
 * The app's Core process: Cormini as the Persona, the terminal, desktop-pet and cua Worlds, the
 * DeepSeek provider next to Cortico's built-in Responses-compatible one, and Worlds or providers
 * installed from npm through the console's extension page.
 *
 * The two bundled Worlds are wired to each other and to the app: the pet's right-click menu
 * pauses and resumes event delivery, opens the settings window and quits the app; computer use
 * asks for permission in the pet's bubble, and falls back to its own system dialog while no
 * pet page is connected.
 *
 * First start writes the files in `seed.ts`; after that every value is the operator's, edited in
 * the console. While the active endpoint has no key, event delivery starts paused.
 *
 * The parent (Electron main) gets `{ type: 'companion:ready', port, dataDir, keyMissing }` once the
 * console listens, `{ type: 'companion:open', path }` to show the settings window at a console
 * route and `{ type: 'companion:quit' }` to quit; it asks for a clean stop with
 * `{ type: 'companion:shutdown' }`.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BotDefinition } from 'cortico/bot.ts';
import { createBot } from 'cortico/bot.ts';
import { announceDataDir, consumeBootFlags } from 'cortico/boot.ts';
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

async function corminiDefinition(): Promise<BotDefinition<CoreConfig>> {
  const file = join(repoRoot(), 'bots', 'cormini', 'index.ts');
  return (await import(pathToFileURL(file).href) as { default: BotDefinition<CoreConfig> }).default;
}

export async function main(): Promise<void> {
  // the pet's controls are created before the bot they drive
  let running: ReturnType<typeof createBot> | null = null;
  let pet: DesktopPetWorld | null = null;
  const DESKTOP_PET = desktopPetDefinition({
    controls: {
      isPaused: () => running?.core.bus.isPaused() ?? false,
      setPaused: (paused) => running?.core.bus.setPaused(paused),
      openSettings: () => process.send?.({ type: 'companion:open', path: '#/settings' }),
      quit: () => process.send?.({ type: 'companion:quit' }),
      quitLabel: '退出 CortiCompanion',
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
  running = bot;
  // without a key every model call fails: hold events until the home page saves one and resumes
  const keyMissing = !hasKey(loaded.config);
  if (keyMissing) bot.core.bus.setPaused(true);
  const { port } = await bot.start();
  process.send?.({ type: 'companion:ready', port, dataDir: loaded.dataDir, keyMissing });

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
