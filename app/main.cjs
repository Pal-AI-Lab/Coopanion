/**
 * Coopanion main process.
 *
 * Two modes share this executable:
 * - the app: tray icon, the settings window (the Cortico console served by the Core child on
 *   127.0.0.1), and the Core child process (`core-host.cjs`). A start shows the pet and the tray
 *   icon only; the settings window opens from the tray, the pet's menu, or when the pet asks for
 *   a missing model key (`core/companion.ts`). Starting it again while it runs brings the pet back;
 * - `--pet-host --pet-url=… --parent-pid=…`: the desktop pet's transparent window, started by
 *   the desktop-pet World through `CORTICO_DESKTOP_PET_HOST`. It uses its own profile directory.
 *
 * Every file the app writes lives under one data directory: on Windows `<install dir>\data` when
 * packaged (the uninstaller leaves it, and nothing goes to AppData); on macOS
 * `~/Library/Application Support/Coopanion`, since the .app is not a place to write; on Linux
 * `~/.config/Coopanion` (an AppImage is mounted read-only, a deb installs under /opt); from
 * source `build/data`; or `CORTICO_COMPANION_DATA`. It holds `home/` (deployment, endpoint,
 * Memory), `extensions/` (Worlds and providers installed from npm), `logs/`, `tmp/` (the process
 * temp directory), `pnpm/` (store and caches for extension installs), and the Chromium profiles.
 *
 * On macOS the app lives in the menu bar (the Info.plist sets LSUIElement): no Dock icon, except
 * while the settings window is open, so it can be reached with Command-Tab.
 *
 * Text follows the app language (`config.language`, tables in `i18n/`): the deployment config's at
 * start, the system's before the first start, then each one the Core reports (`companion:language`),
 * which rebuilds the tray menu and reloads the settings window. A new install's language is the
 * system's, handed to the Core as `COOPANION_SYSTEM_LANGUAGE`. The settings window's preload keeps the
 * console in the app language (`settings-preload.cjs`).
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, shell } = require('electron');
const { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } = require('node:fs');
const { delimiter, dirname, join } = require('node:path');

const MAC = process.platform === 'darwin';
const LINUX = process.platform === 'linux';
// Linux: X11 (XWayland under a Wayland session). On Wayland a window cannot place itself or stay on top,
// and the cursor position outside the app's own windows is unknown, which the pet needs.
if (LINUX) app.commandLine.appendSwitch('ozone-platform', 'x11');
// Without a usable GPU (virtual machines, blocklisted drivers) Chromium no longer
// falls back to software WebGL on its own, and the whale figure draws with WebGL: allow SwiftShader. It
// only renders the app's own pages.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const APP_ROOT = app.getAppPath();
const ICONS = join(__dirname, 'icons');
const DATA = process.env.CORTICO_COMPANION_DATA
  || (!app.isPackaged ? join(APP_ROOT, 'build', 'data')
    : MAC || LINUX ? join(app.getPath('appData'), 'Coopanion') : join(dirname(process.execPath), 'data'));

/**
 * An install made through the installer's pages sits in %LOCALAPPDATA%\Programs\Coopanion: the "only for me"
 * page sets that after installer/nsis.nsh's customInit ran. From 0.1.14 to 0.1.16 an update, which installs
 * silently and so keeps customInit's choice, moved the program to %USERPROFILE%\Coopanion and left data\ behind
 * (#84). The first start in the new place takes that data\ back. When the app has run here since, this data\ may
 * be the one in use, so a dialog asks first (askRestoreStranded); taking the old one back then happens on the
 * next start, before anything here is open, and keeps this one beside it as data-replaced-<time>.
 */
const STRANDED_DIR = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Coopanion') : null;
const STRANDED_DATA = STRANDED_DIR && join(STRANDED_DIR, 'data');
/** The answer to that dialog: `restore` or `keep`. */
const STRANDED_CHOICE = join(DATA, 'stranded-data-choice');

/** Returns true when the dialog has to ask. */
function restoreStrandedData() {
  if (!STRANDED_DATA || STRANDED_DATA.toLowerCase() === DATA.toLowerCase()) return false;
  // an install still living there is its own install, not a leftover
  if (!existsSync(join(STRANDED_DATA, 'home')) || existsSync(join(STRANDED_DIR, 'Coopanion.exe'))) return false;
  const choice = existsSync(STRANDED_CHOICE) ? readFileSync(STRANDED_CHOICE, 'utf8') : '';
  if (choice === 'keep') return false;
  if (choice !== 'restore' && existsSync(join(DATA, 'home'))) return true;
  rmSync(STRANDED_CHOICE, { force: true });
  const aside = `${DATA}-replaced-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let line;
  try {
    if (existsSync(DATA)) renameSync(DATA, aside);
    renameSync(STRANDED_DATA, DATA);
    line = `restored ${STRANDED_DATA}${existsSync(aside) ? `, the data here kept as ${aside}` : ''}`;
    try { rmdirSync(STRANDED_DIR); } catch { /* not empty: something else was put there */ }
  } catch (err) {
    if (existsSync(aside) && !existsSync(DATA)) renameSync(aside, DATA);
    line = `could not restore ${STRANDED_DATA}: ${err?.message ?? err}`;
  }
  mkdirSync(join(DATA, 'logs'), { recursive: true });
  appendFileSync(join(DATA, 'logs', 'data-restore.log'), `${new Date().toISOString()} ${line}\n`);
  return false;
}
const askStranded = app.isPackaged && process.platform === 'win32' && !process.env.CORTICO_COMPANION_DATA
  && !process.argv.includes('--pet-host') && restoreStrandedData();

// before anything asks Electron for a path: the single-instance lock and the profile live in userData
app.setPath('userData', DATA);
app.setPath('crashDumps', join(DATA, 'Crashpad'));
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(DATA, 'tmp');
mkdirSync(process.env.TEMP, { recursive: true });

/* ---------- pet window mode ---------- */
if (process.argv.includes('--pet-host')) {
  const arg = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : ''; };
  app.setPath('userData', join(app.getPath('userData'), 'pet-window'));
  if (MAC) app.dock?.hide();
  const { runPetHost } = require(require.resolve('cortico-world-desktop-pet/host/electron-main.cjs'));
  runPetHost({ url: arg('pet-url'), parentPid: Number(arg('parent-pid')) || 0, tray: false });
  return;
}

/* ---------- app mode ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const { CoreHost } = require('./core-host.cjs');
const { configuredLanguage, consoleLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
const { RELEASES_URL, startUpdater } = require('./updater.cjs');

const userData = app.getPath('userData');
const shimDir = join(__dirname, 'shims');
const petHost = app.isPackaged ? [process.execPath, '--pet-host'] : [process.execPath, APP_ROOT, '--pet-host'];

const core = new CoreHost({
  appRoot: APP_ROOT,
  logDir: join(userData, 'logs'),
  env: {
    ...process.env,
    CORTICO_HOME: join(userData, 'home'),
    CORTICO_EXTENSIONS_DIR: join(userData, 'extensions'),
    CORTICO_SUPERVISED: '1',
    CORTICO_START_PAUSED: '0',
    CORTICO_DESKTOP_PET_HOST: JSON.stringify(petHost),
    // pnpm keeps its store and caches in LOCALAPPDATA unless told otherwise; pnpm 11 reads the pnpm_config_ prefix
    pnpm_config_store_dir: join(DATA, 'pnpm', 'store'),
    pnpm_config_cache_dir: join(DATA, 'pnpm', 'cache'),
    pnpm_config_state_dir: join(DATA, 'pnpm', 'state'),
    // extension installs call `corepack pnpm`; the shim (corepack.cmd, or corepack on macOS) runs the bundled pnpm on this runtime
    PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}`,
    CORTICO_NODE_EXE: process.execPath,
    CORTICO_PNPM_CJS: join(APP_ROOT, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    // reported with the usage statistics (core/telemetry.ts)
    COOPANION_VERSION: app.getVersion(),
  },
});

let settings = null;
let tray = null;
let quitting = false;
let updater = null;
/** The updater's last step, told again to a Core that starts after it (`core/companion.ts` says it in the bubble). */
let updateStep = null;

/** The app language, set once the app is ready (see the module header). */
let language = 'en';
const T = () => textOf(language);

const consoleUrl = (path = '') => (core.port ? `http://127.0.0.1:${core.port}/${path}` : null);

function loadingPage(text) {
  // with lang set, Chromium takes the system's Chinese, Japanese or Korean font for the language
  const html = `<!doctype html><html lang="${language}"><meta charset="utf-8"><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#f4f5f4;color:#5c5c60;font:15px system-ui,-apple-system,"Segoe UI",sans-serif}@media(prefers-color-scheme:dark){html,body{background:#0e1113;color:#9aa0a6}}</style><body>${text}</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function openSettings(path = '') {
  // a menu-bar app shows in the Dock only while it has a window to switch to
  if (MAC) void app.dock?.show();
  if (settings) {
    if (settings.isMinimized()) settings.restore();
    settings.show();
    settings.focus();
    const url = consoleUrl(path);
    if (url && path) settings.loadURL(url);
    return;
  }
  settings = new BrowserWindow({
    width: 1180, height: 800, minWidth: 880, minHeight: 600,
    title: 'Coopanion', icon: join(ICONS, 'icon.png'), autoHideMenuBar: true, show: false,
    backgroundColor: '#f4f5f4',
    webPreferences: { preload: join(__dirname, 'settings-preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  settings.once('ready-to-show', () => settings.show());
  settings.on('page-title-updated', (e) => e.preventDefault());
  settings.webContents.setWindowOpenHandler(({ url }) => {
    const origin = core.port ? `http://127.0.0.1:${core.port}` : null;
    const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url);
    if (local) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: join(ICONS, 'icon.png') } };
    if (origin && url.startsWith(origin)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  settings.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    settings.hide();
    if (MAC) app.dock?.hide();
  });
  settings.on('closed', () => { settings = null; });
  const url = consoleUrl(path);
  settings.loadURL(url ?? loadingPage(T().starting));
}

/** Calls a panel method of a World page through the console API. */
async function panel(pageId, panelId, method) {
  const url = consoleUrl(`api/console/providers/${encodeURIComponent(pageId)}/panels/${panelId}/${method}`);
  if (!url) return null;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: [] }) });
  return res.ok ? res.json() : null;
}

async function showPet() {
  await panel('world:desktop-pet', 'pet', 'closeWindow');
  await panel('world:desktop-pet', 'pet', 'openWindow');
}

/** Brings the pet back unless its page is on screen already (reopening it would make it blink). */
async function ensurePet() {
  const state = await panel('world:desktop-pet', 'pet', 'state').catch(() => null);
  if (!state?.connected) await showPet();
}

/**
 * Start at login. Electron's login items cover Windows and macOS; on Linux it is an XDG autostart entry
 * (~/.config/autostart/coopanion.desktop) that runs the AppImage, or the installed executable.
 */
const AUTOSTART = join(app.getPath('home'), '.config', 'autostart', 'coopanion.desktop');
const loginItem = {
  get: () => (LINUX ? existsSync(AUTOSTART) : app.getLoginItemSettings().openAtLogin),
  set(on) {
    if (!LINUX) { app.setLoginItemSettings({ openAtLogin: on, args: ['--background'] }); return; }
    if (!on) { rmSync(AUTOSTART, { force: true }); return; }
    const exe = process.env.APPIMAGE || process.execPath;
    mkdirSync(dirname(AUTOSTART), { recursive: true });
    writeFileSync(AUTOSTART, `[Desktop Entry]\nType=Application\nName=Coopanion\nExec="${exe}" --background\nX-GNOME-Autostart-enabled=true\n`);
  },
};

/** The usage statistics report whether the app starts at login; the Core reads it when it (re)starts. */
function noteAutostart() {
  core.opts.env.COOPANION_AUTOSTART = app.isPackaged && loginItem.get() ? '1' : '0';
}

function refreshTray() {
  if (!tray) return;
  const t = T(), login = loginItem.get();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.trayOpenSettings, click: () => openSettings() },
    { label: t.trayShowPet, enabled: core.state === 'running', click: () => void showPet() },
    { type: 'separator' },
    { label: t.trayLaunchAtLogin, type: 'checkbox', checked: login, enabled: app.isPackaged, click: (item) => { loginItem.set(item.checked); noteAutostart(); refreshTray(); } },
    { label: t.trayRestart, click: () => void core.restart() },
    { label: t.trayQuit, click: () => app.quit() },
  ]));
}

/** A language the Core reports: the tray menu is rebuilt, and the settings window reloads when the console's language changes with it. */
function followLanguage(next) {
  if (typeof next !== 'string' || next === language) return;
  const reload = consoleLanguage(next) !== consoleLanguage(language);
  language = next;
  refreshTray();
  if (reload && settings && consoleUrl()) settings.webContents.reload();
}

/**
 * A language picked on Cortico's own settings page in the settings window (`settings-preload.cjs`)
 * becomes the app language, written through the console API as the 「习惯」 page writes it.
 */
async function adoptConsoleLanguage(picked) {
  const url = consoleUrl('api/config');
  if (!url || (picked !== 'zh' && picked !== 'en')) return;
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: 'companion', values: { language: picked } }) });
}

function buildTray() {
  // macOS: a black template image the menu bar tints to its own color
  const name = MAC ? 'trayTemplate' : 'tray';
  const icon = nativeImage.createFromPath(join(ICONS, `${name}.png`));
  icon.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(join(ICONS, `${name}@2x.png`)).toPNG() });
  if (MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Coopanion');
  refreshTray();
  core.on('state', refreshTray);
  // on macOS a click opens the menu, as every menu-bar icon does
  if (!MAC) tray.on('click', () => openSettings());
}

core.on('ready', ({ language: next }) => {
  followLanguage(next);
  if (settings) settings.loadURL(consoleUrl());
  if (updateStep) core.send(updateStep);
});
core.on('language', followLanguage);
core.on('update-install', () => updater?.installNow());
core.on('releases', () => void shell.openExternal(RELEASES_URL));
core.on('state', (state, exit) => {
  if (!exit) return;
  const detail = exit.kind === 'failed' ? T().coreFailed(exit.times, exit.code, exit.logFile) : T().coreRestarting(exit.code);
  if (Notification.isSupported()) new Notification({ title: 'Coopanion', body: detail, icon: join(ICONS, 'icon.png') }).show();
  if (state === 'failed') dialog.showErrorBox('Coopanion', detail);
});

core.on('open', (path) => openSettings(path));
// the introduction runs again on the desktop, where Coo is
core.on('hide', () => {
  if (!settings) return;
  settings.hide();
  if (MAC) app.dock?.hide();
});
core.on('quit', () => app.quit());
const bringBack = () => { if (core.state === 'running') ensurePet().catch(() => { /* Core went away meanwhile */ }); };
app.on('second-instance', bringBack);
// macOS: opening the app again while it runs
app.on('activate', bringBack);
app.on('window-all-closed', () => { /* stays in the tray */ });
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  void core.stop().finally(() => {
    // a downloaded update installs now; its quit comes back here with quitting set and goes through
    if (updater?.installOnQuit()) setTimeout(() => app.exit(0), 10_000);
    else app.exit(0);
  });
});

/** Asks whether to take back the data\ an update left behind; true when the app restarts to do it. */
function askRestoreStranded() {
  const response = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Coopanion',
    message: T().strandedMessage,
    detail: T().strandedDetail(STRANDED_DATA, dirname(DATA)),
    buttons: [T().strandedRestore, T().strandedKeep],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  writeFileSync(STRANDED_CHOICE, response === 0 ? 'restore' : 'keep');
  if (response !== 0) return false;
  app.relaunch();
  app.exit(0);
  return true;
}

ipcMain.on('settings:language', (e) => { e.returnValue = consoleLanguage(language); });
ipcMain.on('settings:language-picked', (_e, picked) => { adoptConsoleLanguage(picked).catch(() => { /* the Core went away: the pick is dropped */ }); });

app.whenReady().then(() => {
  app.setAppUserModelId('ai.pal.coopanion');
  const system = systemLanguage(app);
  core.opts.env.COOPANION_SYSTEM_LANGUAGE = system;
  language = configuredLanguage(join(userData, 'home')) ?? system;
  if (askStranded && askRestoreStranded()) return;
  buildTray();
  noteAutostart();
  core.start();
  updater = startUpdater({
    logDir: join(userData, 'logs'),
    tell: (step) => { updateStep = { type: 'companion:update', ...step }; core.send(updateStep); },
  });
});
