/**
 * The World extensions the rail may mark, and the install behind one arrow, against a fake registry:
 * which packages take part, what is installed, and what is refused.
 */
import { describe, expect, it } from 'vitest';
import type { ExtensionRecord } from 'cortico/extensions.ts';
import { UPDATES_PANEL, applyWorldUpdate, updatesPanel, worldUpdates, type UpdateSource } from '../core/extension-updates.ts';

function record(name: string, spec: string, worldId?: string, kind: ExtensionRecord['kind'] = 'world'): ExtensionRecord {
  return { name, spec, version: '1.0.0', kind, ...(worldId ? { worldId } : {}), webUiClient: false, loaded: true };
}

/** Stands in for the registry and pnpm: `latest` is what the registry reports, `installs` what pnpm was asked to add. */
function fake(latest: Record<string, string>, problems: Record<string, string[]> = {}) {
  const installs: Array<{ name: string; version: string }> = [];
  const source: UpdateSource = {
    updates: async () => ({
      updates: Object.entries(latest).map(([name, version]) => ({ name, installedVersion: '1.0.0', latestVersion: version, problems: problems[name] ?? [] })),
    }),
    install: async (target) => {
      installs.push(target);
      return `${target.name}@${target.version}`;
    },
  };
  return { source, installs };
}

const A = record('cortico-world-a', '^1.0.0', 'a');

describe('World extension updates', () => {
  it('lists only installed World extensions from a registry, and leaves out a release this framework cannot load', async () => {
    const records = [
      A,
      record('cortico-world-local', 'file:../local.tgz', 'local'),
      record('cortico-world-linked', 'link:../linked', 'linked'),
      record('cortico-world-broken', '2.0.0', 'broken'),
      record('cortico-provider-x', '^1.0.0', 'x', 'provider'),
    ];
    const { source } = fake(
      { 'cortico-world-a': '1.2.0', 'cortico-world-local': '1.1.0', 'cortico-world-linked': '1.1.0', 'cortico-world-broken': '2.0.0', 'cortico-provider-x': '1.1.0' },
      { 'cortico-world-broken': ['需要更新的框架'] },
    );
    expect(await worldUpdates(source, records)).toEqual([
      { name: 'cortico-world-a', worldId: 'a', installedVersion: '1.0.0', latestVersion: '1.2.0' },
    ]);
  });

  it('installs the version it was shown', async () => {
    const { source, installs } = fake({ 'cortico-world-a': '1.2.0' });
    expect(await applyWorldUpdate(source, [A], ['cortico-world-a', 'a', '1.2.0']))
      .toEqual({ ok: true, name: 'cortico-world-a', worldId: 'a', version: '1.2.0' });
    expect(installs).toEqual([{ name: 'cortico-world-a', version: '1.2.0' }]);
  });

  it('refuses a version the registry no longer reports and a package that is not an installed World from a registry', async () => {
    const local = record('cortico-world-local', 'file:../local.tgz', 'local');
    const { source, installs } = fake({ 'cortico-world-a': '1.3.0', 'cortico-world-local': '1.1.0' });
    expect(await applyWorldUpdate(source, [A, local], ['cortico-world-a', 'a', '1.2.0'])).toEqual({ ok: false, reason: 'not-latest' });
    expect(await applyWorldUpdate(source, [A, local], ['cortico-world-local', 'local', '1.1.0'])).toEqual({ ok: false, reason: 'unknown' });
    expect(await applyWorldUpdate(source, [A, local], ['cortico-world-a', 'another-world', '1.3.0'])).toEqual({ ok: false, reason: 'unknown' });
    expect(installs).toEqual([]);
  });

  it('says what pnpm said when the install fails, and refuses a value that is not a release number', async () => {
    const source: UpdateSource = {
      updates: async () => ({ updates: [{ name: 'cortico-world-a', installedVersion: '1.0.0', latestVersion: '1.2.0', problems: [] }] }),
      install: async () => { throw new Error('ERR_PNPM_FETCH_404'); },
    };
    expect(await applyWorldUpdate(source, [A], ['cortico-world-a', 'a', '1.2.0']))
      .toEqual({ ok: false, reason: 'failed', detail: 'ERR_PNPM_FETCH_404' });
    await expect(applyWorldUpdate(source, [A], ['cortico-world-a', 'a', '^1.2.0'])).rejects.toThrow();
    await expect(applyWorldUpdate(source, [A], ['cortico-world-a', 'a', 'https://elsewhere.test/a.tgz'])).rejects.toThrow();
  });

  it('answers the rail from one reading of the registry, and reads again after an install changed the disk', async () => {
    let reads = 0;
    const source: UpdateSource = {
      updates: async () => {
        reads++;
        return { updates: [{ name: 'cortico-world-a', installedVersion: '1.0.0', latestVersion: '1.2.0', problems: [] }] };
      },
      install: async () => 'added',
    };
    const panel = updatesPanel(source, [A]);
    const listed = { updates: [{ name: 'cortico-world-a', worldId: 'a', installedVersion: '1.0.0', latestVersion: '1.2.0' }] };
    expect(await panel.invoke(UPDATES_PANEL.id, 'list', [])).toEqual(listed);
    expect(await panel.invoke(UPDATES_PANEL.id, 'list', [])).toEqual(listed);
    expect(reads).toBe(1);
    expect(await panel.invoke(UPDATES_PANEL.id, 'apply', ['cortico-world-a', 'a', '1.2.0'])).toMatchObject({ ok: true });
    const afterInstall = reads;
    await panel.invoke(UPDATES_PANEL.id, 'list', []);
    expect(reads).toBeGreaterThan(afterInstall);
    await expect(panel.invoke('another', 'list', [])).rejects.toThrow();
    await expect(panel.invoke(UPDATES_PANEL.id, 'delete', [])).rejects.toThrow();
  });
});
