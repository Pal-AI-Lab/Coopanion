/**
 * CortiCompanion main process.
 *
 * Two modes share this executable:
 * - the app: tray icon, the settings window (the Cortico console served by the Core child on
 *   127.0.0.1), and the Core child process (`core-host.cjs`);
 * - `--pet-host --pet-url=… --parent-pid=…`: the desktop pet's transparent window, started by
 *   the desktop-pet World through `CORTICO_DESKTOP_PET_HOST`. It uses its own profile directory.
 *
 * Per-user data lives in `<userData>`: `home/` (deployment, endpoint, Memory), `extensions/`
 * (Worlds and providers installed from npm), `logs/`.
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, shell } = require('electron');
const { join } = require('node:path');

const APP_ROOT = app.getAppPath();
const ICONS = join(__dirname, 'icons');
// portable installs and tests keep everything in one chosen directory
if (process.env.CORTICO_COMPANION_DATA) app.setPath('userData', process.env.CORTICO_COMPANION_DATA);

/* ---------- pet window mode ---------- */
if (process.argv.includes('--pet-host')) {
  const arg = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : ''; };
  app.setPath('userData', join(app.getPath('userData'), 'pet-window'));
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

const userData = app.getPath('userData');
const shimDir = join(__dirname, 'shims');
const petHost = app.isPackaged ? [process.execPath, '--pet-host'] : [process.execPath, APP_ROOT, '--pet-host'];

const core = new CoreHost({
  appRoot: APP_ROOT,
  logDir: join(userData, 'logs'),
  env: {
    ...process.env,
    CORTICO_HOME: join(userData, 'home'),
    CORTICO_COMPANION_EXTENSIONS: join(userData, 'extensions'),
    CORTICO_SUPERVISED: '1',
    CORTICO_START_PAUSED: '0',
    CORTICO_DESKTOP_PET_HOST: JSON.stringify(petHost),
    // extension installs call `corepack pnpm`; the shim runs the bundled pnpm on this runtime
    PATH: `${shimDir};${process.env.PATH ?? ''}`,
    CORTICO_NODE_EXE: process.execPath,
    CORTICO_PNPM_CJS: join(APP_ROOT, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  },
});

let settings = null;
let tray = null;
let quitting = false;

const consoleUrl = (path = '') => (core.port ? `http://127.0.0.1:${core.port}/${path}` : null);

function loadingPage(text) {
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#f4f5f4;color:#5c5c60;font:15px "Microsoft YaHei UI",system-ui,sans-serif}@media(prefers-color-scheme:dark){html,body{background:#0e1113;color:#9aa0a6}}</style><body>${text}</body>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function openSettings(path = '') {
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
    title: 'CortiCompanion', icon: join(ICONS, 'icon.png'), autoHideMenuBar: true, show: false,
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

function buildTray() {
  const icon = nativeImage.createFromPath(join(ICONS, 'tray.png'));
  icon.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(join(ICONS, 'tray@2x.png')).toPNG() });
  tray = new Tray(icon);
  tray.setToolTip('CortiCompanion');
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
  tray.on('click', () => openSettings());
}

core.on('ready', ({ keyMissing }) => {
  if (settings) settings.loadURL(consoleUrl());
  if (keyMissing) openSettings();
});
core.on('state', (state, detail) => {
  if (!detail) return;
  if (Notification.isSupported()) new Notification({ title: 'CortiCompanion', body: detail, icon: join(ICONS, 'icon.png') }).show();
  if (state === 'failed') dialog.showErrorBox('CortiCompanion', detail);
});

core.on('open', (path) => openSettings(path));
core.on('quit', () => app.quit());
app.on('second-instance', () => openSettings());
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
  if (!process.argv.includes('--background')) openSettings();
});
