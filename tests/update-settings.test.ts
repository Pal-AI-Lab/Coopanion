import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createBot, type Bot, type BotDefinition } from 'cortico/bot.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { withWorlds, type WorldDefinition } from 'cortico/world.ts';
import { CONSOLE } from 'cortico/worlds/console/definition.ts';
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { CorminiConfig } from '../vendor/cortico/bots/cormini/index.ts';
import { AUTO_UPDATE_DEFAULT, AUTO_UPDATE_KEY, autoUpdateProperties, watchAutoUpdate, type UpdateConfig } from '../core/update-settings.ts';

type Config = CorminiConfig & UpdateConfig;
const CORTICO = resolve(import.meta.dirname, '../vendor/cortico');
let dir: string;
let bot: Bot<Config>;
let definition: BotDefinition<Config>;
let base: string;
const changes: boolean[] = [];

beforeAll(async () => {
  vi.stubEnv('COOPANION_SELF_UPDATE', '1');
  dir = mkdtempSync(join(tmpdir(), 'coo-update-settings-'));
  mkdirSync(join(dir, 'providers', 'fixture'), { recursive: true });
  writeFileSync(join(dir, 'providers', 'fixture', 'config.json'), JSON.stringify({ kind: 'openai-responses-compat', baseUrl: 'http://127.0.0.1:9/v1', spec: { model: 'test-model', thinking: false } }));
  // An existing deployment has other companion preferences and no automatic-update key.
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ activeProvider: 'fixture', companion: { telemetry: false } }));
  const cormini = (await import(join(CORTICO, 'bots', 'cormini', 'index.ts'))).default as BotDefinition<CorminiConfig>;
  definition = withWorlds<Config>({
    ...cormini,
    defaults: () => ({ ...cormini.defaults(), companion: { autoUpdate: AUTO_UPDATE_DEFAULT } }),
    build: (loaded, worlds) => {
      const parts = cormini.build(loaded, worlds);
      const group: ConfigGroup = { id: 'companion', owner: 'persona', schema: { type: 'object', title: 'Coopanion', properties: autoUpdateProperties('en') } };
      return { ...parts, webUi: { ...parts.webUi, configGroups: [group] } };
    },
  }, [CONSOLE] as WorldDefinition[]);
  const loaded = loadDeployment(definition, dir, CORTICO);
  loaded.config.web.port = 0;
  watchAutoUpdate(loaded.config, (enabled) => changes.push(enabled));
  bot = createBot(loaded, definition);
  bot.core.bus.setPaused(true);
  base = `http://127.0.0.1:${(await bot.start()).port}`;
});

afterAll(async () => {
  await bot?.stop();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function values(): Promise<Record<string, unknown>> {
  const result = await (await fetch(`${base}/api/config`)).json() as { groups: { group: { id: string }; values: Record<string, unknown> }[] };
  return result.groups.find((g) => g.group.id === 'companion')!.values;
}
async function save(enabled: boolean): Promise<void> {
  const response = await fetch(`${base}/api/config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group: 'companion', values: { [AUTO_UPDATE_KEY]: enabled } }),
  });
  expect(response.status).toBe(200);
}

describe('the saved automatic-update preference', () => {
  it('defaults an existing deployment to enabled and reports the initial preference', async () => {
    expect((await values())[AUTO_UPDATE_KEY]).toBe(AUTO_UPDATE_DEFAULT);
    expect(changes).toEqual([AUTO_UPDATE_DEFAULT]);
  });

  it('applies API changes immediately and preserves a disabled preference after reload', async () => {
    await save(false);
    expect((await values())[AUTO_UPDATE_KEY]).toBe(false);
    expect(changes.at(-1)).toBe(false);
    const persisted = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(persisted.companion).toMatchObject({ autoUpdate: false, telemetry: false });
    const loaded = loadDeployment(definition, dir, CORTICO);
    const afterReload: boolean[] = [];
    watchAutoUpdate(loaded.config, (enabled) => afterReload.push(enabled));
    expect(afterReload).toEqual([false]);

    await save(true);
    expect((await values())[AUTO_UPDATE_KEY]).toBe(true);
    expect(changes).toEqual([AUTO_UPDATE_DEFAULT, false, true]);
    expect(loadDeployment(definition, dir, CORTICO).config.companion.autoUpdate).toBe(true);
  });

  it('offers no switch in a build that cannot install its own updates', () => {
    vi.stubEnv('COOPANION_SELF_UPDATE', '0');
    expect(autoUpdateProperties('en')).toEqual({});
    vi.stubEnv('COOPANION_SELF_UPDATE', '1');
    expect(autoUpdateProperties('en')[AUTO_UPDATE_KEY]).toMatchObject({ type: 'boolean', 'x-hot': true });
  });
});
