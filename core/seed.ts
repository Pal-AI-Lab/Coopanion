/** First-run files of the app's deployment. Imports nothing from Cortico, so it runs and tests on its own. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPLOYMENT = 'companion';
export const ENDPOINT = 'deepseek';
export const KEY_NAME = 'DEEPSEEK_API_KEY';
export const CONSOLE_PORT = 17788;
export const DISPLAY_NAME = 'Coo';
/** The name version 0.1.0 seeded. */
const OLD_DISPLAY_NAME = '可缇';
/** SHA-256 of the self-description versions 0.1.0 (after the rename) and 0.1.1 seeded, line endings as LF. */
const OLD_CONSTITUTION = 'cfcb7527cbf3518ab9f077ee711c86661a70613b9e5caeb992b30a603490e5cf';
const SEED_DIR = fileURLToPath(new URL('./seed/', import.meta.url));

/**
 * Writes the first-run files that are missing; existing files are left as the operator made them,
 * except the old seeded name, which becomes Coo in the config and in the self-description, and a
 * self-description still exactly as an older version seeded it, which becomes the current one.
 */
export function seed(home: string): void {
  const deploy = join(home, DEPLOYMENT);
  const endpoint = join(home, 'providers', ENDPOINT);
  const workspace = join(deploy, 'workspace');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(endpoint, { recursive: true });
  const write = (file: string, value: unknown) => { if (!existsSync(file)) writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
  write(join(deploy, 'deployment.json'), { bot: 'cormini' });
  write(join(deploy, 'config.json'), {
    displayName: DISPLAY_NAME,
    language: 'zh',
    activeProvider: ENDPOINT,
    providerSchemaVersion: 3,
    web: { port: CONSOLE_PORT },
  });
  write(join(endpoint, 'config.json'), {
    kind: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    secret: KEY_NAME,
    spec: { model: 'deepseek-flash', thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: true,
    pricing: [],
    options: {},
  });
  if (!existsSync(join(workspace, 'CONSTITUTION.md'))) copyFileSync(join(SEED_DIR, 'CONSTITUTION.md'), join(workspace, 'CONSTITUTION.md'));
  // the console shows it as the bot's avatar
  if (!existsSync(join(deploy, 'avatar.png'))) copyFileSync(join(SEED_DIR, 'avatar.png'), join(deploy, 'avatar.png'));
  renameOldSeed(deploy, workspace);
  upgradeSeededConstitution(workspace);
}

function renameOldSeed(deploy: string, workspace: string): void {
  const configFile = join(deploy, 'config.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8')) as { displayName?: string };
  if (config.displayName === OLD_DISPLAY_NAME) {
    config.displayName = DISPLAY_NAME;
    writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  }
  const constitution = join(workspace, 'CONSTITUTION.md');
  const text = readFileSync(constitution, 'utf8');
  if (text.includes(OLD_DISPLAY_NAME)) {
    writeFileSync(constitution, text.replaceAll(`我叫${OLD_DISPLAY_NAME}`, `我叫 ${DISPLAY_NAME}`).replaceAll(OLD_DISPLAY_NAME, DISPLAY_NAME));
  }
}

function upgradeSeededConstitution(workspace: string): void {
  const file = join(workspace, 'CONSTITUTION.md');
  const text = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (createHash('sha256').update(text).digest('hex') === OLD_CONSTITUTION) copyFileSync(join(SEED_DIR, 'CONSTITUTION.md'), file);
}
