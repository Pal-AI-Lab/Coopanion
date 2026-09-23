/** First-run files of the app's deployment. Imports nothing from Cortico, so it runs and tests on its own. */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPLOYMENT = 'companion';
export const ENDPOINT = 'deepseek';
export const KEY_NAME = 'DEEPSEEK_API_KEY';
export const CONSOLE_PORT = 17788;
export const DISPLAY_NAME = '可缇';
const SEED_DIR = fileURLToPath(new URL('./seed/', import.meta.url));

/** Writes the first-run files that are missing; existing files are left as the operator made them. */
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
}

