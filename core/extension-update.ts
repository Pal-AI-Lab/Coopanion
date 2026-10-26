/**
 * Updates installed World extensions at start, before they are loaded.
 *
 * The choice is `companion.autoUpdateWorlds` in the deployment config, a comma-separated list of
 * package names; it is read from the file because the extensions load before the deployment is
 * merged. Packages installed from a folder, a tarball or a URL never update, and a newer version
 * whose manifest this framework cannot load is skipped. Each package is installed on its own, so
 * one failure leaves the others as they were.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getByPath } from 'cortico/core/config-schema.ts';
import { readInstalled } from 'cortico/extensions.ts';
import { parseExtensionManifest } from 'cortico/extensions/manifest.ts';
import type { ExtensionUpdateResult } from 'cortico/web/server.ts';

export const EXTENSION_AUTO_UPDATE_KEY = 'companion.autoUpdateWorlds';
/** The registry lookups of every installed package; the start goes on without them once this passes. */
const CHECK_TIMEOUT_MS = 10_000;

/** What one start did; `skipped` is a newer version that cannot load, `failed` a package that would not check or install. */
export interface AutoUpdateReport {
  installed: Array<{ name: string; from: string; to: string }>;
  skipped: Array<{ name: string; reason: string }>;
  failed: Array<{ name: string; error: string }>;
}

export interface AutoUpdateOptions {
  /** The deployment's config.json, before the deployment is merged. */
  configFile: string;
  extensionsDir: string;
  updates(): Promise<ExtensionUpdateResult>;
  /** The WebUI's install check, with `world` expected; it throws when the new version is not a World this framework can load. */
  check(name: string): Promise<unknown>;
  install(name: string, version: string): Promise<unknown>;
  timeoutMs?: number;
}

/** The packages the config file names, split on commas and newlines; a missing or unreadable file selects none. */
export function autoUpdatePackages(configFile: string): Set<string> {
  if (!existsSync(configFile)) return new Set();
  try {
    const raw = getByPath(JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, unknown>, EXTENSION_AUTO_UPDATE_KEY);
    const names = typeof raw === 'string' ? raw.split(/[,\n]/).map((name) => name.trim()).filter(Boolean) : [];
    return new Set(names);
  } catch {
    return new Set();
  }
}

/**
 * Installed World packages that came from the registry. A `link:`, `file:` or `workspace:` spec, a
 * URL, a git spec or an npm alias names something the registry's `latest` does not update.
 */
export function worldPackages(extensionsDir: string): Set<string> {
  const worlds = new Set<string>();
  for (const { name, spec } of readInstalled(extensionsDir)) {
    if (!/^(?:\^|~|>=|>|<=|<|=)?\s*[0-9]/.test(spec) && spec !== 'latest' && spec !== '*') continue;
    const pkgFile = join(extensionsDir, 'node_modules', ...name.split('/'), 'package.json');
    if (!existsSync(pkgFile)) continue;
    try {
      const parsed = parseExtensionManifest(JSON.parse(readFileSync(pkgFile, 'utf8')));
      if (parsed.ok && parsed.manifest.kind === 'world') worlds.add(name);
    } catch {
      // a package with no readable manifest has nothing to load after an update either
    }
  }
  return worlds;
}

/**
 * Checks every installed package and installs the newer version of each selected World that can
 * load. Null when nothing is selected or the check ran out of time.
 */
export async function autoUpdateWorldExtensions(opts: AutoUpdateOptions): Promise<AutoUpdateReport | null> {
  const selected = autoUpdatePackages(opts.configFile);
  const worlds = worldPackages(opts.extensionsDir);
  const targets = new Set([...worlds].filter((name) => selected.has(name)));
  if (!targets.size) return null;
  let checked: ExtensionUpdateResult | null;
  try {
    checked = await within(opts.updates(), opts.timeoutMs ?? CHECK_TIMEOUT_MS);
  } catch {
    // a check that cannot finish is the same as one with nothing to install
    return null;
  }
  if (!checked) return null;
  const report: AutoUpdateReport = { installed: [], skipped: [], failed: [] };
  for (const update of checked.updates) {
    if (!targets.has(update.name)) continue;
    if (update.problems.length) {
      report.skipped.push({ name: update.name, reason: update.problems.join(' ') });
      continue;
    }
    try {
      // the WebUI's install check first: the new version is still a World this framework can load
      await opts.check(update.name);
      await opts.install(update.name, update.latestVersion);
      report.installed.push({ name: update.name, from: update.installedVersion, to: update.latestVersion });
    } catch (err) {
      report.failed.push({ name: update.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}

/** The promise's value, or null once `ms` passes without one. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => done(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); done(value); },
      (err) => { clearTimeout(timer); fail(err); },
    );
  });
}
