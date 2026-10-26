/**
 * Updating World extensions at start: which installed packages count, which newer versions are
 * skipped, and what one failed install leaves behind.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { autoUpdatePackages, autoUpdateWorldExtensions, worldPackages } from '../core/extension-update.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A temp data directory with an `extensions/` package.json and one installed package per call. */
function extensionsDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'coo-extension-update-'));
  roots.push(root);
  return join(root, 'extensions');
}

function install(dir: string, name: string, kind: 'world' | 'provider' | 'bot', spec: string, manifest: unknown = { kind, api: kind === 'bot' ? 7 : 6 }): void {
  const pkgFile = join(dir, 'package.json');
  const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')) as { dependencies: Record<string, string> } : { name: 'cortico-extensions', private: true, dependencies: {} as Record<string, string> };
  pkg.dependencies[name] = spec;
  mkdirSync(dir, { recursive: true });
  writeFileSync(pkgFile, JSON.stringify(pkg));
  const packageDir = join(dir, 'node_modules', ...name.split('/'));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', cortico: manifest }));
}

function configFile(selected: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'coo-extension-update-config-'));
  roots.push(root);
  const home = join(root, 'home', 'companion');
  mkdirSync(home, { recursive: true });
  const file = join(home, 'config.json');
  if (selected !== null) writeFileSync(file, JSON.stringify({ companion: { autoUpdateWorlds: selected } }));
  return file;
}

const update = (name: string, latestVersion: string, problems: string[] = []) =>
  ({ name, installedVersion: '1.0.0', latestVersion, problems });

describe('the package list', () => {
  it('is empty without a config file, and splits commas and newlines with surrounding spaces dropped', () => {
    expect(autoUpdatePackages(join(tmpdir(), 'no-such-config.json'))).toEqual(new Set());
    expect(autoUpdatePackages(configFile(null))).toEqual(new Set());
    expect(autoUpdatePackages(configFile(''))).toEqual(new Set());
    expect(autoUpdatePackages(configFile('world-a, world-b\nworld-c ,, '))).toEqual(new Set(['world-a', 'world-b', 'world-c']));
  });
});

describe('the packages it updates', () => {
  it('takes registry Worlds only: neither links, tarballs nor other kinds', () => {
    const dir = extensionsDir();
    install(dir, 'world-range', 'world', '^1.0.0');
    install(dir, 'world-exact', 'world', '1.2.3');
    install(dir, 'world-linked', 'world', 'link:../world-linked');
    install(dir, 'world-tarball', 'world', 'file:../world-tarball.tgz');
    install(dir, 'world-unreadable', 'world', '1.0.0', { kind: 'world' });
    install(dir, 'provider-range', 'provider', '^2.0.0');
    expect([...worldPackages(dir)].sort()).toEqual(['world-exact', 'world-range']);
  });
});

describe('one start', () => {
  it('installs each World update by itself, skipping incompatible versions and carrying on after a failure', async () => {
    const dir = extensionsDir();
    install(dir, 'world-a', 'world', '1.0.0');
    install(dir, 'world-c', 'world', '1.0.0');
    install(dir, 'world-d', 'world', '1.0.0');
    install(dir, 'world-e', 'world', '1.0.0');
    install(dir, 'world-f', 'world', '1.0.0');
    install(dir, 'provider-b', 'provider', '1.0.0');
    const installed: Array<[string, string]> = [];
    const report = await autoUpdateWorldExtensions({
      configFile: configFile('world-a, provider-b, world-c, world-d, world-e'),
      extensionsDir: dir,
      updates: async () => ({
        updates: [
          update('world-a', '1.1.0'),
          update('provider-b', '2.0.0'),
          update('world-c', '2.0.0', ['扩展要求契约 v9']),
          update('world-d', '1.1.0'),
          update('world-e', '1.1.0'),
          update('world-f', '1.1.0'),
        ],
        errors: [],
      }),
      check: async () => {},
      install: async (name, version) => {
        if (name === 'world-d') throw new Error('pnpm add 退出码 1');
        installed.push([name, version]);
      },
    });
    expect(installed).toEqual([['world-a', '1.1.0'], ['world-e', '1.1.0']]);
    expect(report).toEqual({
      installed: [
        { name: 'world-a', from: '1.0.0', to: '1.1.0' },
        { name: 'world-e', from: '1.0.0', to: '1.1.0' },
      ],
      skipped: [{ name: 'world-c', reason: '扩展要求契约 v9' }],
      failed: [{ name: 'world-d', error: 'pnpm add 退出码 1' }],
    });
  });

  it('does not check the registry while no package is selected', async () => {
    const dir = extensionsDir();
    install(dir, 'world-a', 'world', '1.0.0');
    let checks = 0;
    const report = await autoUpdateWorldExtensions({
      configFile: configFile(''),
      extensionsDir: dir,
      updates: async () => { checks++; return { updates: [update('world-a', '1.1.0')], errors: [] }; },
      check: async () => {},
      install: async () => { throw new Error('must not install'); },
    });
    expect(report).toBeNull();
    expect(checks).toBe(0);
  });

  it('goes on with the start when the registry check runs out of time', async () => {
    const dir = extensionsDir();
    install(dir, 'world-a', 'world', '1.0.0');
    const report = await autoUpdateWorldExtensions({
      configFile: configFile('world-a'),
      extensionsDir: dir,
      updates: () => new Promise(() => {}),
      check: async () => {},
      install: async () => { throw new Error('must not install'); },
      timeoutMs: 5,
    });
    expect(report).toBeNull();
  });

  it('does not install a version whose check fails, and carries on with the next World', async () => {
    const dir = extensionsDir();
    install(dir, 'world-a', 'world', '1.0.0');
    install(dir, 'world-b', 'world', '1.0.0');
    const installed: string[] = [];
    const report = await autoUpdateWorldExtensions({
      configFile: configFile('world-a,world-b'),
      extensionsDir: dir,
      updates: async () => ({ updates: [update('world-a', '2.0.0'), update('world-b', '1.1.0')], errors: [] }),
      check: async (name) => { if (name === 'world-a') throw new Error('扩展实际类型为 provider'); },
      install: async (name) => { installed.push(name); },
    });
    expect(installed).toEqual(['world-b']);
    expect(report?.failed).toEqual([{ name: 'world-a', error: '扩展实际类型为 provider' }]);
  });
});
