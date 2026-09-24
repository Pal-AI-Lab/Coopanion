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
 * `~/Library/Application Support/Coopanion`, since the .app is not a place to write; from
 * source `build/data`; or `CORTICO_COMPANION_DATA`. It holds `home/` (deployment, endpoint,
 * Memory), `extensions/` (Worlds and providers installed from npm), `logs/`, `tmp/` (the process
 * temp directory), `pnpm/` (store and caches for extension installs), and the Chromium profiles.
 *
 * On macOS the app lives in the menu bar (the Info.plist sets LSUIElement): no Dock icon, except
 * while the settings window is open, so it can be reached with Command-Tab.
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, shell } = require('electron');
const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const { delimiter, dirname, join } = require('node:path');

const { macDataPath } = require('./data-path.cjs');

const MAC = process.platform === 'darwin';
const APP_ROOT = app.getAppPath();
const ICONS = join(__dirname, 'icons');
const DATA = process.env.CORTICO_COMPANION_DATA
  || (!app.isPackaged ? join(APP_ROOT, 'build', 'data')
    : MAC ? macDataPath(app.getPath('appData')) : join(dirname(process.execPath), 'data'));
// before anything asks Electron for a path: the single-instance lock and the profile live in userData
const LEGACY_DATA = join(app.getPath('appData'), 'CortiCompanion');
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
migrateLegacyData();

/**
 * Version 0.1.0 kept its data in %APPDATA%\CortiCompanion. The deployment and logs move into
 * the data directory, the npm manifest of installed extensions too (their node_modules link
 * into the old pnpm store, so the extensions page reinstalls them), then the old directory goes.
 */
function migrateLegacyData() {
  if (process.platform !== 'win32' || !app.isPackaged || LEGACY_DATA === DATA || !existsSync(LEGACY_DATA)) return;
  if (existsSync(join(LEGACY_DATA, 'home'))) {
    // both hold a deployment: neither is overwritten or removed
    if (existsSync(join(DATA, 'home'))) return;
    cpSync(join(LEGACY_DATA, 'home'), join(DATA, 'home'), { recursive: true });
    if (existsSync(join(LEGACY_DATA, 'logs'))) cpSync(join(LEGACY_DATA, 'logs'), join(DATA, 'logs'), { recursive: true });
    const manifest = join(LEGACY_DATA, 'extensions', 'package.json');
    if (existsSync(manifest)) { mkdirSync(join(DATA, 'extensions'), { recursive: true }); cpSync(manifest, join(DATA, 'extensions', 'package.json')); }
  }
  // a file still held open (an old copy running) leaves the directory for the next start
  try { rmSync(LEGACY_DATA, { recursive: true, force: true, maxRetries: 3 }); } catch { /* removed on a later start */ }
}

const { CoreHost } = require('./core-host.cjs');

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
  },
});

let settings = null;
let tray = null;
let quitting = false;

const consoleUrl = (path = '') => (core.port ? `http://127.0.0.1:${core.port}/${path}` : null);

function loadingPage(text) {
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#f4f5f4;color:#5c5c60;font:15px -apple-system,"PingFang SC","Microsoft YaHei UI",system-ui,sans-serif}@media(prefers-color-scheme:dark){html,body{background:#0e1113;color:#9aa0a6}}</style><body>${text}</body>`;
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
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
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
  settings.loadURL(url ?? loadingPage('正在启动…'));
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

function buildTray() {
  // macOS: a black template image the menu bar tints to its own color
  const name = MAC ? 'trayTemplate' : 'tray';
  const icon = nativeImage.createFromPath(join(ICONS, `${name}.png`));
  icon.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(join(ICONS, `${name}@2x.png`)).toPNG() });
  if (MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Coopanion');
  const refresh = () => {
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开设置', click: () => openSettings() },
      { label: '显示桌宠', enabled: core.state === 'running', click: () => void showPet() },
      { type: 'separator' },
      { label: '开机自动启动', type: 'checkbox', checked: login, enabled: app.isPackaged, click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--background'] }); refresh(); } },
      { label: '重新启动', click: () => void core.restart() },
      { label: '退出', click: () => app.quit() },
    ]));
  };
  refresh();
  core.on('state', refresh);
  // on macOS a click opens the menu, as every menu-bar icon does
  if (!MAC) tray.on('click', () => openSettings());
}

core.on('ready', () => {
  if (settings) settings.loadURL(consoleUrl());
});
core.on('state', (state, detail) => {
  if (!detail) return;
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
  void core.stop().finally(() => app.exit(0));
});

app.whenReady().then(() => {
  app.setAppUserModelId('ai.pal.corticompanion');
  buildTray();
  core.start();
});
