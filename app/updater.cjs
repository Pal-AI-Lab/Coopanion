/**
 * Updates from the GitHub releases (electron-updater), where they can install themselves: the Windows
 * installer and the Linux AppImage. A macOS build is signed ad hoc, which Squirrel.Mac refuses to
 * install, and a deb belongs to the package manager; there the settings window's version line links
 * to a newer release.
 *
 * While automatic updates are enabled, a newer release downloads in the background. Each step goes
 * to the Core (`tell`), which says it in the bubble, and to the settings window's version line: downloading, downloaded
 * (restart now, or it installs when the app quits), or failed. Only a failed download points to the
 * releases page outright; while downloading, the bubble's second button shows that way on hover. What
 * the updater does is written to `updater.log` in the logs directory.
 * Turning updates off cancels the download, clears its notices and prevents installation on quit.
 */
const { createWriteStream, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const RELEASES_URL = 'https://github.com/Pal-AI-Lab/Coopanion/releases/latest';
/** Releases come out at most a few times a day; a run left open for days still hears of them the same day. */
const CHECK_EVERY_MS = 6 * 3600_000;

/** Whether this build can install an update by itself. */
function canUpdate() {
  const { app } = require('electron');
  return app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE));
}

/**
 * Starts with the saved preference. `tell(step)` reports downloading, ready or failed; `tell(null)`
 * clears a cancelled update. `setEnabled(false)` cancels downloads and prevents installation on quit.
 */
function startUpdater({ logDir, tell, enabled }) {
  const { autoUpdater } = require('electron-updater');
  mkdirSync(logDir, { recursive: true });
  const log = createWriteStream(join(logDir, 'updater.log'), { flags: 'a' });
  const line = (level) => (...args) => log.write(`${new Date().toISOString()} ${level} ${args.map(String).join(' ')}\n`);
  autoUpdater.logger = { info: line('info'), warn: line('warn'), error: line('error'), debug: line('debug') };
  // electron-updater emits `error` for failed checks, downloads and installer launches; without a listener the emit throws
  autoUpdater.on('error', line('error'));
  // the installer takes the directory registered for the app, or its default one when none is: an update goes
  // into the directory of the program that is running, so data beside it stays with it
  if (process.platform === 'win32') autoUpdater.installDirectory = dirname(process.execPath);

  return manageUpdates(autoUpdater, { tell, enabled });
}

/**
 * Serializes checks and downloads; a disabled generation cannot publish or install an update.
 * `installOnQuit(runAfter)` installs a ready update once; `runAfter` starts the updated app afterwards.
 */
function manageUpdates(autoUpdater, { tell, enabled: initial }) {
  // downloads start here, after the check, so that turning updates off can cancel them
  autoUpdater.autoDownload = false;
  // the app's own quit stops the Core first and then exits, which skips the quit event the updater waits for: installOnQuit does it
  autoUpdater.autoInstallOnAppQuit = false;
  let enabled = false;
  let generation = 0;
  let running = false;
  let requested = false;
  let timer = null;
  let cancellation = null;
  let ready = null;

  const check = async () => {
    if (!enabled) return;
    requested = true;
    if (running) return;
    running = true;
    try {
      while (requested && enabled) {
        requested = false;
        const current = generation;
        let downloading = null;
        try {
          const result = await autoUpdater.checkForUpdates();
          if (!enabled || current !== generation || !result?.isUpdateAvailable || ready === result.updateInfo.version) continue;
          cancellation = result.cancellationToken;
          downloading = result.updateInfo.version;
          tell({ phase: 'downloading', version: downloading });
          await autoUpdater.downloadUpdate(cancellation);
          if (!enabled || current !== generation) continue;
          ready = downloading;
          tell({ phase: 'ready', version: ready });
        } catch (err) {
          // a failed check (no network, GitHub out of reach) is only logged; a download that was under way is told
          if (enabled && current === generation && downloading) {
            tell({ phase: 'failed', version: downloading, reason: String(err?.message ?? err).split('\n')[0].slice(0, 200) });
          }
        } finally {
          cancellation = null;
        }
      }
    } finally {
      running = false;
    }
  };

  const setEnabled = (next) => {
    if (next === enabled) return;
    enabled = next;
    generation += 1;
    if (enabled) {
      void check();
      timer = setInterval(check, CHECK_EVERY_MS);
      timer.unref();
    } else {
      clearInterval(timer);
      timer = null;
      requested = false;
      cancellation?.cancel();
      ready = null;
      tell(null);
    }
  };
  setEnabled(initial);

  return {
    setEnabled,
    hasUpdate: () => !!ready,
    installOnQuit(runAfter = false) {
      if (!ready) return false;
      ready = null;
      autoUpdater.quitAndInstall(true, runAfter);
      return true;
    },
  };
}

module.exports = { canUpdate, startUpdater, manageUpdates, CHECK_EVERY_MS, RELEASES_URL };
