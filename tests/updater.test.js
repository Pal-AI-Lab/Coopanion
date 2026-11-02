import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AUTO_UPDATE_DEFAULT } from '../core/update-settings.ts';

const require = createRequire(import.meta.url);
const { AppUpdater } = require('electron-updater/out/AppUpdater.js');
const updaterRequire = createRequire(require.resolve('electron-updater'));
const { CancellationError } = updaterRequire('builder-util-runtime');
const { manageUpdates, CHECK_EVERY_MS } = require('../app/updater.cjs');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

/** The real updater's check/download lifecycle with an in-memory release feed and a local installer. */
class FixtureUpdater extends AppUpdater {
  constructor(root) {
    super(null, { version: '1.0.0', isPackaged: true, whenReady: async () => {}, userDataPath: root });
    this.logger = null;
    this.root = root;
    this.checks = 0;
    this.downloads = 0;
    this.installs = [];
    this.info = { version: '1.1.0', files: [{ url: 'update.bin', sha512: 'fixture' }] };
  }

  async getUpdateInfoAndProvider() {
    this.checks += 1;
    if (this.checkGate) await this.checkGate.promise;
    return { info: this.info, provider: {} };
  }

  async doDownloadUpdate({ cancellationToken }) {
    this.downloads += 1;
    this.token = cancellationToken;
    if (this.downloadGate) {
      const gate = this.downloadGate;
      cancellationToken.onCancel(() => { if (!this.ignoreCancellation) gate.reject(new CancellationError()); });
      await gate.promise;
    }
    if (this.downloadError) throw this.downloadError;
    const file = join(this.root, 'update.bin');
    writeFileSync(file, this.info.version);
    this.dispatchUpdateDownloaded({ ...this.info, downloadedFile: file });
    return [file];
  }

  quitAndInstall(_silent, runAfter) {
    copyFileSync(join(this.root, 'update.bin'), join(this.root, 'installed'));
    this.installs.push({ version: readFileSync(join(this.root, 'installed'), 'utf8'), runAfter });
  }
}

let root, updater, controller, steps;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  root = mkdtempSync(join(tmpdir(), 'coo-updater-'));
  updater = new FixtureUpdater(root);
  steps = [];
});
afterEach(() => {
  controller?.setEnabled(false);
  controller = null;
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});
const start = (enabled = AUTO_UPDATE_DEFAULT) => {
  controller = manageUpdates(updater, { enabled, tell: (step) => steps.push(step) });
  return controller;
};

describe('automatic updates', () => {
  it('downloads by default and installs once on quit, preserving the restart choice', async () => {
    const run = start();
    await expect.poll(() => run.hasUpdate()).toBe(true);
    expect(steps.map((s) => s.phase)).toEqual(['downloading', 'ready']);
    expect(run.installOnQuit(true)).toBe(true);
    expect(run.installOnQuit()).toBe(false);
    expect(updater.installs).toEqual([{ version: updater.info.version, runAfter: true }]);
  });

  it('performs no checks or downloads while disabled, then checks immediately when enabled', async () => {
    const run = start(false);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(updater.checks).toBe(0);
    expect(updater.downloads).toBe(0);
    expect(run.installOnQuit()).toBe(false);
    run.setEnabled(true);
    await expect.poll(() => run.hasUpdate()).toBe(true);
    expect(updater.checks).toBe(1);
    expect(updater.downloads).toBe(1);
  });

  it('checks once per interval and does not redownload an already ready version', async () => {
    start();
    await expect.poll(() => controller.hasUpdate()).toBe(true);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(updater.checks).toBe(3);
    expect(updater.downloads).toBe(1);
    controller.setEnabled(false);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(updater.checks).toBe(3);
  });

  it('does not download a check that finishes after automatic updates are disabled', async () => {
    updater.checkGate = deferred();
    const run = start();
    await expect.poll(() => updater.checks).toBe(1);
    run.setEnabled(false);
    updater.checkGate.resolve();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(updater.downloads).toBe(0);
    expect(steps).toEqual([null]);
    expect(run.installOnQuit()).toBe(false);
  });

  it('cancels an active download without a failure notice and resumes after a rapid re-enable', async () => {
    const gate = deferred();
    updater.downloadGate = gate;
    const run = start();
    await expect.poll(() => updater.downloads).toBe(1);
    run.setEnabled(false);
    expect(updater.token.cancelled).toBe(true);
    updater.downloadGate = null;
    run.setEnabled(true);
    await expect.poll(() => run.hasUpdate()).toBe(true);
    expect(steps.map((s) => s?.phase ?? null)).toEqual(['downloading', null, 'downloading', 'ready']);
    expect(updater.downloads).toBe(2);
  });

  it('ignores a download that finishes after cancellation and cannot install it on quit', async () => {
    updater.downloadGate = deferred();
    updater.ignoreCancellation = true;
    const run = start();
    await expect.poll(() => updater.downloads).toBe(1);
    run.setEnabled(false);
    updater.downloadGate.resolve();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(steps.map((s) => s?.phase ?? null)).toEqual(['downloading', null]);
    expect(run.hasUpdate()).toBe(false);
    expect(run.installOnQuit()).toBe(false);
    expect(updater.installs).toEqual([]);
  });

  it('prevents installation of an already downloaded update until enabled again', async () => {
    const run = start();
    await expect.poll(() => run.hasUpdate()).toBe(true);
    run.setEnabled(false);
    expect(steps.at(-1)).toBeNull();
    expect(run.hasUpdate()).toBe(false);
    expect(run.installOnQuit()).toBe(false);
    run.setEnabled(true);
    await expect.poll(() => run.hasUpdate()).toBe(true);
    expect(run.installOnQuit()).toBe(true);
    expect(updater.installs).toEqual([{ version: updater.info.version, runAfter: false }]);
  });

  it('reports a download failure and can retry after toggling the preference', async () => {
    updater.downloadError = new Error('Download interrupted');
    const run = start();
    await expect.poll(() => steps.at(-1)?.phase).toBe('failed');
    expect(run.installOnQuit()).toBe(false);
    expect(steps.at(-1).reason).toBe(updater.downloadError.message);
    run.setEnabled(false);
    updater.downloadError = null;
    run.setEnabled(true);
    await expect.poll(() => run.hasUpdate()).toBe(true);
  });
});
