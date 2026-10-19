/**
 * Updates from the GitHub releases (electron-updater), where they can install themselves: the Windows
 * installer and the Linux AppImage. A macOS build is signed ad hoc, which Squirrel.Mac refuses to
 * install, and a deb belongs to the package manager; there the settings window's version line links
 * to a newer release.
 *
 * A newer release downloads in the background. Each step is handed to the Core (`tell`), which says
 * it in Coo's bubble, and to the settings window's version line: found and downloading, downloaded
 * (restart now, or it installs when the app quits), or failed. Only a failed download points to the
 * releases page outright; while downloading, the bubble's second button shows that way on hover. What
 * the updater does is written to `updater.log` in the logs directory.
 */
const { app } = require('electron');
const { createWriteStream, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const RELEASES_URL = 'https://github.com/Pal-AI-Lab/Coopanion/releases/latest';
/** Releases come out at most a few times a day; a run left open for days still hears of them the same day. */
const CHECK_EVERY_MS = 6 * 3600_000;

/** Whether this build can install an update by itself. */
function canUpdate() {
  return app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE));
}

/**
 * Starts checking. `tell({ phase: 'downloading' | 'ready' | 'failed', version, reason? })` reports each
 * step. Returns `hasUpdate()`, whether one is downloaded, and `installOnQuit(runAfter)`, true when a downloaded
 * update was started for installing as the app quits; `runAfter` starts the updated app once installed.
 */
function startUpdater({ logDir, tell }) {
  if (!canUpdate()) return { hasUpdate: () => false, installOnQuit: () => false };
  const { autoUpdater } = require('electron-updater');
  mkdirSync(logDir, { recursive: true });
  const log = createWriteStream(join(logDir, 'updater.log'), { flags: 'a' });
  const line = (level) => (...args) => log.write(`${new Date().toISOString()} ${level} ${args.map(String).join(' ')}\n`);
  autoUpdater.logger = { info: line('info'), warn: line('warn'), error: line('error'), debug: line('debug') };
  autoUpdater.autoDownload = true;
  // the app's own quit stops the Core first and then exits, which skips the quit event the updater waits for: installOnQuit does it
  autoUpdater.autoInstallOnAppQuit = false;
  // the installer takes the directory registered for the app, or its default one when none is: an update goes
  // into the directory of the program that is running, so data beside it stays with it
  if (process.platform === 'win32') autoUpdater.installDirectory = dirname(process.execPath);

  let downloading = null;
  let ready = null;
  autoUpdater.on('update-available', (info) => {
    if (downloading === info.version || ready === info.version) return;
    downloading = info.version;
    tell({ phase: 'downloading', version: info.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    downloading = null;
    if (ready === info.version) return;
    ready = info.version;
    tell({ phase: 'ready', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    // a failed check (no network, GitHub out of reach) is only logged; a download that was under way is told
    if (!downloading) return;
    tell({ phase: 'failed', version: downloading, reason: String(err?.message ?? err).split('\n')[0].slice(0, 200) });
    downloading = null;
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => { /* logged by the updater */ });
  check();
  setInterval(check, CHECK_EVERY_MS).unref();

  return {
    hasUpdate: () => !!ready,
    installOnQuit(runAfter = false) {
      if (!ready) return false;
      ready = null;
      autoUpdater.quitAndInstall(true, runAfter);
      return true;
    },
  };
}

module.exports = { canUpdate, startUpdater, RELEASES_URL };
