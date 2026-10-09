/** First-run files of the app's deployment. Imports nothing from Cortico, so it runs and tests on its own. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelLanguage, type ModelLanguage } from './language.ts';

export const DEPLOYMENT = 'companion';
export const ENDPOINT = 'deepseek';
export const KEY_NAME = 'DEEPSEEK_API_KEY';
export const CONSOLE_PORT = 17788;
export const DISPLAY_NAME = 'Coo';
/** The provider module of the app's endpoints (cortico-provider-coo). */
export const MODULE = 'coo';
/** The module the endpoints of versions up to 0.1.2 name; it became `coo`. */
const OLD_MODULE = 'deepseek';
/** SHA-256 of the self-description versions 0.1.0 (after the rename) and 0.1.1 seeded, line endings as LF. */
const OLD_CONSTITUTION = 'cfcb7527cbf3518ab9f077ee711c86661a70613b9e5caeb992b30a603490e5cf';
/** When computer use asks first (`worlds.cua.permission`): new installs get it written out, so a config without it is from before and keeps the default it had. */
const CUA_ASK = 'ask-once';
const OLD_CUA_ASK = 'ask-each-turn';
export const SEED_DIR = fileURLToPath(new URL('./seed/', import.meta.url));
/** The self-description seeded for each model-text language, in `SEED_DIR`. */
export const CONSTITUTION_SEEDS: Record<ModelLanguage, string> = { zh: 'CONSTITUTION.md', en: 'CONSTITUTION.en.md' };

/**
 * Writes the first-run files that are missing; existing files are left as the operator made them,
 * except a self-description still exactly as a version seeded it, which becomes the current one in
 * the model-text language of the config's `language` (`followLanguage`), endpoints of the old
 * `deepseek` module, which now belong to `coo`, and a config without `worlds.cua.permission`, which
 * keeps the `ask-each-turn` it had before new installs got `ask-once`.
 */
export function seed(home: string): void {
  const deploy = join(home, DEPLOYMENT);
  const endpoint = join(home, 'providers', ENDPOINT);
  const workspace = join(deploy, 'workspace');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(endpoint, { recursive: true });
  const write = (file: string, value: unknown) => { if (!existsSync(file)) writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
  write(join(deploy, 'deployment.json'), { bot: 'cormini' });
  const config = join(deploy, 'config.json');
  const upgrading = existsSync(config);
  write(config, {
    displayName: DISPLAY_NAME,
    language: 'zh',
    activeProvider: ENDPOINT,
    providerSchemaVersion: 3,
    web: { port: CONSOLE_PORT },
    worlds: { cua: { permission: CUA_ASK } },
  });
  write(join(endpoint, 'config.json'), {
    kind: MODULE,
    baseUrl: 'https://api.deepseek.com',
    secret: KEY_NAME,
    spec: { model: 'deepseek-flash', thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: true,
    pricing: [],
    options: {},
  });
  const language = modelLanguage((JSON.parse(readFileSync(config, 'utf8')) as { language?: unknown }).language);
  if (!existsSync(join(workspace, 'CONSTITUTION.md'))) copyFileSync(join(SEED_DIR, CONSTITUTION_SEEDS[language]), join(workspace, 'CONSTITUTION.md'));
  // the console shows it as the bot's avatar
  if (!existsSync(join(deploy, 'avatar.png'))) copyFileSync(join(SEED_DIR, 'avatar.png'), join(deploy, 'avatar.png'));
  followLanguage(workspace, language);
  moveEndpointsToCoo(join(home, 'providers'));
  if (upgrading) keepCuaAsking(config);
}

function keepCuaAsking(file: string): void {
  const config = JSON.parse(readFileSync(file, 'utf8')) as { worlds?: { cua?: { permission?: string } } };
  if (config.worlds?.cua?.permission !== undefined) return;
  config.worlds = { ...config.worlds, cua: { ...config.worlds?.cua, permission: OLD_CUA_ASK } };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

function moveEndpointsToCoo(providers: string): void {
  for (const dir of readdirSync(providers, { withFileTypes: true })) {
    const file = join(providers, dir.name, 'config.json');
    if (!dir.isDirectory() || !existsSync(file)) continue;
    const config = JSON.parse(readFileSync(file, 'utf8')) as { kind?: string };
    if (config.kind !== OLD_MODULE) continue;
    config.kind = MODULE;
    writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  }
}

/** SHA-256 of a file's text with line endings as LF; null when it is missing. */
const hashOf = (file: string) => (existsSync(file) ? createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex') : null);

/** The workspace's self-description is one this version seeds, in either language, as it was seeded. */
export function isSeededConstitution(workspace: string): boolean {
  const hash = hashOf(join(workspace, 'CONSTITUTION.md'));
  return hash !== null && Object.values(CONSTITUTION_SEEDS).some((name) => hashOf(join(SEED_DIR, name)) === hash);
}

/**
 * Puts the seed of `language` in place of a self-description still exactly as a version seeded it
 * (this version's in the other language, or an older one); one the person or Coo changed stays.
 * The bot reads the new one from its next session on.
 */
export function followLanguage(workspace: string, language: ModelLanguage): void {
  const file = join(workspace, 'CONSTITUTION.md');
  const seed = join(SEED_DIR, CONSTITUTION_SEEDS[language]);
  const hash = hashOf(file);
  if (hash === null || hash === hashOf(seed)) return;
  if (hash === OLD_CONSTITUTION || isSeededConstitution(workspace)) copyFileSync(seed, file);
}
