/**
 * World extensions with a newer version on the registry, and the install behind the arrow the settings
 * window's rail draws beside one.
 *
 * The rail asks with `list`, which is the only moment the registry is contacted: a start makes no request.
 * `apply` installs the exact version `list` reported for that package and refuses every other one, so a
 * click installs what the person saw. It writes the extensions directory and stops there; the new version
 * runs at the next start.
 *
 * The window reaches both through the public panel contract, as the `updates` panel of the Persona page.
 */
import type { ExtensionRecord } from 'cortico/extensions.ts';
import type { WebUiPanelDecl } from 'cortico/web/shared/webui-protocol.ts';

/** One World extension whose registry has a newer version than the installed one. */
export interface WorldUpdate {
  name: string;
  /** The World the package provides; the rail matches it with the World page. */
  worldId: string;
  installedVersion: string;
  latestVersion: string;
}

/** What the extension manager provides; a test stands in for the registry and pnpm. */
export interface UpdateSource {
  updates(): Promise<{ updates: Array<{ name: string; installedVersion: string; latestVersion: string; problems: string[] }> }>;
  install(target: { name: string; version: string }): Promise<string>;
}

export type UpdateOutcome =
  | { ok: true; name: string; worldId: string; version: string }
  | { ok: false; reason: 'unknown' | 'not-latest' }
  | { ok: false; reason: 'failed'; detail: string };

/** A package from a registry takes part; `link:`, `file:` and `workspace:` are the person's own build. */
const LOCAL_SPEC = /^(?:link|file|workspace):/;
/** A release number as npm writes one. A range, a tag or a URL is not something this may install. */
const RELEASE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The installed World extensions that a registry can update, by package name. */
function installable(records: readonly ExtensionRecord[]): Map<string, ExtensionRecord> {
  return new Map(records
    .filter((record) => record.kind === 'world' && !!record.worldId && !LOCAL_SPEC.test(record.spec))
    .map((record) => [record.name, record]));
}

export async function worldUpdates(source: UpdateSource, records: readonly ExtensionRecord[]): Promise<WorldUpdate[]> {
  const packages = installable(records);
  const { updates } = await source.updates();
  return updates.flatMap((update) => {
    const record = packages.get(update.name);
    // a release this framework cannot load is not offered here; the extensions page says why
    if (!record || update.problems.length) return [];
    return [{ name: update.name, worldId: record.worldId!, installedVersion: update.installedVersion, latestVersion: update.latestVersion }];
  });
}

/**
 * Installs the version `worldUpdates` reported for one package. A package that is not an installed World
 * extension from a registry, and a version that is no longer the registry's latest, are refused.
 */
export async function applyWorldUpdate(source: UpdateSource, records: readonly ExtensionRecord[], args: unknown[]): Promise<UpdateOutcome> {
  const [name, worldId, version] = args;
  if (typeof name !== 'string' || typeof worldId !== 'string' || typeof version !== 'string' || !RELEASE.test(version)) {
    throw new Error(`bad update request ${JSON.stringify(args)}`);
  }
  const record = installable(records).get(name);
  if (!record || record.worldId !== worldId) return { ok: false, reason: 'unknown' };
  const latest = (await worldUpdates(source, records)).find((update) => update.name === name);
  if (latest?.latestVersion !== version) return { ok: false, reason: 'not-latest' };
  try {
    await source.install({ name, version });
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, name, worldId, version };
}

/** The panel behind the arrow. It sits in a slot, so the Persona page has no tab for it. */
export const UPDATES_PANEL: WebUiPanelDecl = { id: 'updates', title: 'World updates', slot: 'updates', getMethods: ['list'] };

/** How long one reading of the registry stands: the rail asks each time the settings window opens. */
export const READING_TTL_MS = 10 * 60_000;

/** The panel's `list` (GET) and `apply` (POST), with the last reading kept for a while. */
export function updatesPanel(source: UpdateSource, records: readonly ExtensionRecord[], ttlMs = READING_TTL_MS) {
  let readAt = 0;
  let reading: WorldUpdate[] | null = null;
  const list = async (): Promise<WorldUpdate[]> => {
    if (!reading || Date.now() - readAt >= ttlMs) {
      reading = await worldUpdates(source, records);
      readAt = Date.now();
    }
    return reading;
  };
  return {
    panel: UPDATES_PANEL,
    async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
      if (panel !== UPDATES_PANEL.id) throw new Error(`no panel ${panel}`);
      if (method === 'list') return { updates: await list() };
      if (method !== 'apply') throw new Error(`no method ${method}`);
      const out = await applyWorldUpdate(source, records, args);
      // the version installed is no longer news
      if (out.ok) reading = null;
      return out;
    },
  };
}
