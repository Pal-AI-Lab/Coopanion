/**
 * Coopanion main process.
 *
 * Two modes share this executable:
 * - the app: tray icon, the settings window (Coopanion's own front end, `build/console`, served under
 *   `/coopanion/` on the Core child's console origin in a session of its own, see serveWindow), and
 *   the Core child process (`core-host.cjs`). A start shows the pet and the tray icon only; the settings window opens from the tray, the pet's menu, or when the pet asks for
 *   a missing model key (`core/companion.ts`). Starting it again while it runs brings the pet back;
 * - `--pet-host --pet-url=… --parent-pid=…`: the desktop pet's transparent window, started by
 *   the desktop-pet World through `CORTICO_DESKTOP_PET_HOST`. It uses its own profile directory.
 *
 * A build is for one channel, `coopanion.channel` in the app's package.json (scripts/pack.ts): `github`
 * (the default) updates itself from the GitHub releases; `steam` is installed and updated by Steam, does
 * not run the updater, and reads figure packs from the Steam Workshop (`steam.cjs`).
 *
 * Every file the app writes lives under one data directory: on Windows `<install dir>\data` when
 * packaged (the uninstaller leaves it, and nothing goes to AppData), except the Steam build, whose
 * install directory Steam deletes on uninstall: `%APPDATA%\Coopanion`; on macOS
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
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, screen, session, shell } = require('electron');
const http = require('node:http');
const { Readable } = require('node:stream');
const { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } = require('node:fs');
const { delimiter, dirname, extname, join, resolve, sep } = require('node:path');

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
/** The build's channel and, for `steam`, its Steam app id (see the module header). */
const BUILD = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')).coopanion ?? {};
const STEAM = BUILD.channel === 'steam';
const DATA = process.env.CORTICO_COMPANION_DATA
  || (!app.isPackaged ? join(APP_ROOT, 'build', 'data')
    : MAC || LINUX || STEAM ? join(app.getPath('appData'), 'Coopanion') : join(dirname(process.execPath), 'data'));

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
const askStranded = app.isPackaged && process.platform === 'win32' && !STEAM && !process.env.CORTICO_COMPANION_DATA
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
const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
const { RELEASES_URL, startUpdater } = require('./updater.cjs');

const userData = app.getPath('userData');
const shimDir = join(__dirname, 'shims');
const petHost = app.isPackaged ? [process.execPath, '--pet-host'] : [process.execPath, APP_ROOT, '--pet-host'];

const core = new CoreHost({
  appRoot: APP_ROOT,
  logDir: join(userData, 'logs'),
  // the default session follows the operating system's proxy settings, PAC scripts included
  resolveProxy: (url) => session.defaultSession.resolveProxy(url),
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
/** The settings window's page; `path` is a hash route such as `#/dress`. */
const settingsUrl = (path = '') => consoleUrl(`coopanion/${path}`);

/**
 * The settings window lives in a session of its own (SETTINGS_PARTITION), and serveWindow answers every
 * http request of that session. Its files (scripts/stage.ts builds them) are served for `/coopanion/…` on
 * the Core's console origin, so the page and the console API share one origin and Core's same-origin check
 * applies.
 *
 * Who runs what in that session: the settings page, and the extension panels it loads into its own
 * document, run with the Core's full rights, as in Cortico's own console. The pet's pages (its preview on
 * 开始, the 装扮 page) are frames from the desktop-pet World's own server, and a figure pack's code runs
 * inside them sandboxed: it is not trusted, and must neither read nor write the Core's API.
 *
 * Responses made here skip Chromium's CORS check, so the handler checks instead. A request goes out, through
 * Node's http with its method, headers and body, only to the Core when it comes from the Core's own origin,
 * and only to the pet's server when it comes from the Core's origin or the pet's own, or is a read of the figure
 * frame's files (`/figure-frame`, `/web/…`, `/packs/…`) with no referrer, sent on with Origin `null`; everything
 * else is refused (403). The origin is the request's
 * referrer: Chromium hands this handler neither the Origin
 * header nor cookies, so the Origin sent on is the referrer's and no cookie goes along (a console behind a
 * login password does not open here). The answer streams back as it arrives; a redirect comes back as it
 * is, unfollowed. WebSockets do not pass through here; keepRemoteOut keeps the session's other traffic and
 * its frames on this machine.
 */
const SETTINGS_PARTITION = 'persist:coopanion-settings';
const WINDOW_DIR = join(APP_ROOT, 'build', 'console');
const WINDOW_PREFIX = '/coopanion/';
const WINDOW_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };
const refused = () => new Response(null, { status: 403 });
const coreOrigin = () => (core.port ? `http://127.0.0.1:${core.port}` : null);
/** The desktop-pet World's server, as its panel reports it; asked again when a request names another origin. */
let petOrigin = null;
async function learnPetOrigin() {
  const state = await panel('world:desktop-pet', 'pet', 'state').catch(() => null);
  petOrigin = state?.url ? new URL(state.url).origin : null;
  return petOrigin;
}

async function serveWindow(request) {
  const url = new URL(request.url);
  const from = request.referrer ? new URL(request.referrer).origin : null;
  if (url.origin === coreOrigin()) {
    if (url.pathname.startsWith(WINDOW_PREFIX)) return windowFile(url);
    return from === coreOrigin() ? forward(request, url, from) : refused();
  }
  if (url.origin !== petOrigin && url.origin !== await learnPetOrigin()) return refused();
  if (from === coreOrigin() || from === petOrigin) return forward(request, url, from);
  // the figure pack's sandboxed frame loads its files with no referrer: it gets those files and nothing else, sent as
  // the opaque origin it is so the pet server's own rule for it applies
  const frameFile = url.pathname === '/figure-frame' || /^\/(web|packs)\//.test(url.pathname);
  return !from && frameFile && (request.method === 'GET' || request.method === 'HEAD') ? forward(request, url, 'null') : refused();
}

function windowFile(url) {
  try {
    const file = resolve(WINDOW_DIR, decodeURIComponent(url.pathname.slice(WINDOW_PREFIX.length)) || 'index.html');
    if (!file.startsWith(WINDOW_DIR + sep)) return new Response(null, { status: 404 });
    return new Response(readFileSync(file), { headers: { 'content-type': WINDOW_TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
  } catch {
    // a malformed escape, a directory, a file that is not there
    return new Response(null, { status: 404 });
  }
}

function forward(request, url, origin) {
  const headers = {};
  for (const [key, value] of request.headers) headers[key] = value;
  headers.host = url.host;
  if (origin) headers.origin = origin;
  return new Promise((done) => {
    const out = http.request({ host: url.hostname, port: url.port || 80, method: request.method, path: url.pathname + url.search, headers }, (res) => {
      const back = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) for (const v of value) back.append(key, v);
        else if (value !== undefined) back.set(key, value);
      }
      const empty = request.method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304;
      done(new Response(empty ? null : Readable.toWeb(res), { status: res.statusCode, statusText: res.statusMessage, headers: back }));
    });
    out.on('error', () => done(new Response(null, { status: 502 })));
    if (!request.body) { out.end(); return; }
    // a body that breaks off is not sent as if complete
    const body = Readable.fromWeb(request.body);
    body.on('error', (err) => out.destroy(err));
    body.pipe(out);
  });
}

/** The only remote address the settings page asks: the latest Coopanion release, for the hint under the wordmark. */
const RELEASE_CHECK = 'https://api.github.com/repos/Pal-AI-Lab/Coopanion/releases/latest';
const isLocal = (url) => /^(https?|wss?):\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url);
/** Requests of the settings session leave the machine only for the release check. */
function keepRemoteOut(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, answer) => {
    answer({ cancel: !(isLocal(details.url) || details.url === RELEASE_CHECK) });
  });
}

/**
 * Pages of the settings partition stay on Core's console, and their frames on this machine; a link anywhere
 * else opens in the system browser.
 */
function keepOnConsole(contents) {
  const ours = (url) => !!core.port && url.startsWith(`${coreOrigin()}/`);
  contents.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: join(ICONS, 'icon.png') } };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (ours(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  // a frame (the pet's pages and what a figure pack loads in them) stays on this machine and off the Core's
  // own origin, whose pages would run with its rights
  contents.on('will-frame-navigate', (e) => {
    if (e.isMainFrame || /^about:(blank|srcdoc)$/.test(e.url)) return;
    if (isLocal(e.url) && !e.url.startsWith(`${coreOrigin()}/`)) return;
    e.preventDefault();
  });
  contents.on('did-create-window', (child) => keepOnConsole(child.webContents));
}

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
    const url = settingsUrl(path);
    if (url && path) settings.loadURL(url);
    return;
  }
  // 1200 wide keeps the 开始 page's model list on two rows; a smaller screen gets its work area
  const area = screen.getPrimaryDisplay().workAreaSize;
  settings = new BrowserWindow({
    width: Math.min(1200, area.width), height: Math.min(800, area.height), minWidth: 880, minHeight: 600,
    title: 'Coopanion', icon: join(ICONS, 'icon.png'), autoHideMenuBar: true, show: false,
    backgroundColor: '#f4f5f4',
    webPreferences: { partition: SETTINGS_PARTITION, preload: join(__dirname, 'settings-preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  settings.once('ready-to-show', () => settings.show());
  settings.on('page-title-updated', (e) => e.preventDefault());
  keepOnConsole(settings.webContents);
  settings.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    settings.hide();
    if (MAC) app.dock?.hide();
  });
  settings.on('closed', () => { settings = null; });
  const url = settingsUrl(path);
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

/** A language the Core reports: the tray menu is rebuilt, and the settings window reloads to show the console in it. */
function followLanguage(next) {
  if (typeof next !== 'string' || next === language) return;
  language = next;
  refreshTray();
  if (settings && consoleUrl()) settings.webContents.reload();
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
  if (settings) settings.loadURL(settingsUrl());
  if (updateStep) core.send(updateStep);
});
core.on('language', followLanguage);
core.on('update-install', () => updater?.installNow());
core.on('releases', () => void shell.openExternal(RELEASES_URL));
// the ChatGPT sign-in page the introduction sends to the system browser; no other address is opened
core.on('browse', (url) => { if (url.startsWith('https://auth.openai.com/')) void shell.openExternal(url); });
core.on('state', (state, exit) => {
  if (!exit) return;
  const detail = exit.kind === 'locked' ? T().coreLocked(exit.pid, exit.file)
    : exit.kind === 'failed' ? T().coreFailed(exit.times, exit.code, exit.logFile) : T().coreRestarting(exit.code);
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

ipcMain.on('settings:language', (e) => { e.returnValue = language; });

app.whenReady().then(() => {
  const settingsSession = session.fromPartition(SETTINGS_PARTITION);
  settingsSession.protocol.handle('http', serveWindow);
  keepRemoteOut(settingsSession);
  app.setAppUserModelId('ai.pal.coopanion');
  const system = systemLanguage(app);
  core.opts.env.COOPANION_SYSTEM_LANGUAGE = system;
  language = configuredLanguage(join(userData, 'home')) ?? system;
  if (askStranded && askRestoreStranded()) return;
  // figure packs from the Workshop: more pack directories for the desktop-pet World (core/companion.ts)
  if (STEAM) core.opts.env.COOPANION_PACK_ROOTS = require('./steam.cjs').workshopPackRoots(BUILD.steamAppId, join(userData, 'logs')).join(delimiter);
  buildTray();
  noteAutostart();
  void core.start();
  if (!STEAM) updater = startUpdater({
    logDir: join(userData, 'logs'),
    tell: (step) => { updateStep = { type: 'companion:update', ...step }; core.send(updateStep); },
  });
});
