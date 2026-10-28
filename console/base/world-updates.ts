/**
 * The World extensions a registry has a newer version of, for the settings window's rail: the list, the
 * install behind the badge, the switch that hides the badge and the packages whose update the person
 * dismissed.
 *
 * Both calls go through the public panel contract, to the `updates` panel of Core's Persona page
 * (`core/extension-updates.ts`); the normal mode reads no internal route for this.
 */
import { get, post } from './api.ts';
import { panelRoute, pageIdFor } from './protocol.ts';

/** The deployment's bot is Cormini (`core/companion.ts`); its Persona page carries the panel. */
const UPDATES_PAGE = pageIdFor('persona', 'cormini');
const PANEL = 'updates';

export interface WorldUpdate {
  name: string;
  /** The World the package provides; the rail matches it with the World page. */
  worldId: string;
  installedVersion: string;
  latestVersion: string;
}

/** `unknown`: not an installed World extension from a registry; `not-latest`: the registry has moved on. */
export type UpdateOutcome =
  | { ok: true; name: string; worldId: string; version: string }
  | { ok: false; reason: 'unknown' | 'not-latest' }
  | { ok: false; reason: 'failed'; detail: string };

/** Whether the rail draws the badge; on unless the person turned it off on the extensions page. */
const HINTS_KEY = 'companion.worldUpdates';
/** package name → the version whose badge the person closed. A newer version shows again. */
const DISMISSED_KEY = 'companion.worldUpdates.dismissed';
/** Fired when the switch changes, so the rail shows or hides the badges without a reload. */
export const HINTS_CHANGED = 'companion:world-updates';

export function updatesShown(): boolean {
  try { return localStorage.getItem(HINTS_KEY) !== 'off'; } catch { return true; }
}

export function setUpdatesShown(shown: boolean): void {
  try { localStorage.setItem(HINTS_KEY, shown ? 'on' : 'off'); } catch { /* Storage can be disabled. */ }
  window.dispatchEvent(new Event(HINTS_CHANGED));
}

function dismissed(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? saved as Record<string, string> : {};
  } catch { return {}; }
}

/** Closes the badge of this version; `isDismissed` reports it after a reload. */
export function dismissUpdate(update: WorldUpdate): void {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...dismissed(), [update.name]: update.latestVersion })); } catch { /* Optional state. */ }
}

export const isDismissed = (update: WorldUpdate): boolean => dismissed()[update.name] === update.latestVersion;

export async function listWorldUpdates(opts: { signal?: AbortSignal }): Promise<WorldUpdate[]> {
  const out = await get<{ updates?: WorldUpdate[] }>(panelRoute(UPDATES_PAGE, PANEL, 'list'), opts);
  return Array.isArray(out?.updates) ? out.updates : [];
}

export function applyWorldUpdate(update: WorldUpdate, opts: { signal?: AbortSignal }): Promise<UpdateOutcome> {
  return post<UpdateOutcome>(panelRoute(UPDATES_PAGE, PANEL, 'apply'), { args: [update.name, update.worldId, update.latestVersion] }, opts);
}
