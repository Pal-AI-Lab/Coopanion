/**
 * Coopanion main process.
 *
 * Two modes share this executable:
 * - the app: tray icon, the settings window (Coopanion's own front end, `build/console`, served under
 *   `/coopanion/` on the Core child's console origin in a session of its own, see serveWindow), and
 *   the Core child process (`core-host.cjs`). A start shows the pet and the tray icon only; the settings window opens from the tray, the pet's menu, or when the pet asks for
 *   a missing model key (`core/companion.ts`). Closing the settings window ends its renderer, unless a page holds unsaved
 *   edits, which keeps it hidden; it opens again at the route it last showed. Starting the app again while it runs brings the pet back, or starts the
 *   Core again when it stopped retrying (`failed`);
 * - `--pet-host --pet-url=… --parent-pid=…`: the desktop pet's transparent window, started by
 *   the desktop-pet World through `CORTICO_DESKTOP_PET_HOST` with the app's own switches. It uses its own profile directory.
 *
 * A build is for one channel, `coopanion.channel` in the app's package.json (scripts/pack.ts): `github`
 * (the default) updates itself from the GitHub releases; `steam` is installed and updated by Steam, does
 * not run the updater, and reads figure packs from the Steam Workshop (`steam.cjs`); `portable` is the
 * Windows zip, which runs from wherever it is unpacked, writes nothing outside its folder but its login item,
 * and is updated by hand.
 *
 * Every file the app writes lives under one data directory: on Windows `data\` beside the program when
 * packaged, or for the installed build the data an earlier start used when the program has none beside it
 * (`data-dir.cjs`, whose record in `%LOCALAPPDATA%\Coopanion` is the one file outside it); the uninstaller
 * leaves it. A portable folder copied whole is a second pet with its own data. The Steam build,
 * whose install directory Steam deletes on uninstall, uses `%APPDATA%\Coopanion`; on macOS
 * `~/Library/Application Support/Coopanion`, since the .app is not a place to write; on Linux
 * `~/.config/Coopanion` (an AppImage is mounted read-only, a deb installs under /opt); from
 * source `build/data`; or `CORTICO_COMPANION_DATA`. It holds `home/` (deployment, endpoint,
 * Memory), `extensions/` (Worlds and providers installed from npm), `logs/`, `tmp/` (the process
 * temp directory), `pnpm/` (store and caches for extension installs, in `%LOCALAPPDATA%\Coopanion` when the
 * volume holds no junctions), and the Chromium profiles.
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
const { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { delimiter, dirname, extname, join, resolve, sep } = require('node:path');
const { dataDirIn, locateData, readRecord, writeRecord } = require('./data-dir.cjs');

const { readSettingsSize, saveSettingsSize } = require('./settings-size.cjs');
const { settingsChromeOptions, applySettingsTheme } = require('./settings-chrome.cjs');

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
/** Window icon: on Windows the .ico, so the taskbar picks the size it draws instead of scaling a 512 px PNG. */
const WINDOW_ICON = join(ICONS, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const APP_ID = 'ai.pal.coopanion';
/** The build's channel and, for `steam`, its Steam app id (see the module header). */
const BUILD = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')).coopanion ?? {};
const STEAM = BUILD.channel === 'steam';
const PORTABLE = BUILD.channel === 'portable';
const PET_HOST = process.argv.includes('--pet-host');
/** The Windows installed build, whose data directory data-dir.cjs finds from the program's directory. */
const INSTALLED = app.isPackaged && process.platform === 'win32' && !STEAM && !PORTABLE && !process.env.CORTICO_COMPANION_DATA;
const PROGRAM_DIR = dirname(process.execPath);
const BESIDE = join(PROGRAM_DIR, 'data');
const DATA_RECORD = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Coopanion', 'data-location.json') : null;
const located = INSTALLED && DATA_RECORD ? locateData({ programDir: PROGRAM_DIR, record: readRecord(DATA_RECORD) }) : null;
const DATA = process.env.CORTICO_COMPANION_DATA
  || (!app.isPackaged ? join(APP_ROOT, 'build', 'data')
    : MAC || LINUX || STEAM ? join(app.getPath('appData'), 'Coopanion') : located?.use ?? BESIDE);

/**
 * Asks which data to use when none is beside the program (data-dir.cjs) and binds the record to this program
 * directory with the answer. True when the app starts again to use it, false when it quits.
 * @param {{ ask: 'inherit' | 'missing', record: import('./data-dir.cjs').DataRecord }} question
 */
function askDataLocation({ ask, record }) {
  const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
  const language = configuredLanguage(join(record.data, 'home')) ?? systemLanguage(app);
  const t = textOf(language);
  const when = new Date(record.startedAt).toLocaleString(language);
  const box = (options) => dialog.showMessageBoxSync({ title: 'Coopanion', noLink: true, defaultId: 0, ...options });
  const bind = (data) => {
    writeRecord(DATA_RECORD, { data, program: PROGRAM_DIR, startedAt: record.startedAt });
    return true;
  };
  const startNew = () => {
    mkdirSync(BESIDE, { recursive: true });
    return bind(BESIDE);
  };
  if (ask === 'inherit') {
    const answer = box({ type: 'question', message: t.dataFoundMessage, detail: t.dataFoundDetail(record.data, when, PROGRAM_DIR), buttons: [t.dataInherit, t.dataNew], cancelId: 0 });
    return answer === 0 ? bind(record.data) : startNew();
  }
  for (;;) {
    const answer = box({ type: 'warning', message: t.dataMissingMessage, detail: t.dataMissingDetail(record.data, when, BESIDE), buttons: [t.dataRetry, t.dataChoose, t.dataNew, t.dataQuit], cancelId: 3 });
    if (answer === 0 && existsSync(join(record.data, 'home'))) return bind(record.data);
    if (answer === 1) {
      const folder = dialog.showOpenDialogSync({ title: t.dataChooseTitle, defaultPath: dirname(record.data), properties: ['openDirectory'] })?.[0];
      const data = folder && dataDirIn(folder);
      if (data) return bind(data);
      if (folder) box({ type: 'warning', message: t.dataChooseInvalid(folder) });
    }
    if (answer === 2) return startNew();
    if (answer === 3) return false;
  }
}
if (located?.ask && !PET_HOST) {
  // Chromium's own files for these dialogs go to the temp directory
  app.setPath('userData', join(app.getPath('temp'), 'Coopanion'));
  app.whenReady().then(() => {
    if (askDataLocation(located)) app.relaunch();
    app.exit(0);
  }).catch((err) => {
    dialog.showErrorBox('Coopanion', String(err?.message ?? err));
    app.exit(1);
  });
  return;
}

/**
 * data\ beside the program cannot be written when the program sits in a directory that needs administrator
 * rights, such as Program Files. The app then shows why and quits before anything is created under DATA; the
 * probe goes into DATA, or into the install directory while DATA does not exist yet.
 */
function dataWritable() {
  const probe = join(existsSync(DATA) ? DATA : dirname(DATA), `.write-test-${process.pid}`);
  try {
    writeFileSync(probe, '');
    rmSync(probe);
    return true;
  } catch {
    return false;
  }
}
if (INSTALLED && !dataWritable()) {
  // Chromium's own files for this one dialog go to the temp directory
  app.setPath('userData', join(app.getPath('temp'), 'Coopanion'));
  app.whenReady().then(() => {
    const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
    const t = textOf(configuredLanguage(join(DATA, 'home')) ?? systemLanguage(app));
    const suggested = join(process.env.LOCALAPPDATA ?? app.getPath('home'), 'Programs', 'Coopanion');
    dialog.showErrorBox('Coopanion', t.dataNotWritable(DATA, suggested));
    app.exit(1);
  });
  return;
}

/**
 * An install made through the installer's pages sits in %LOCALAPPDATA%\Programs\Coopanion: the per-user
 * install mode (installer/nsis.nsh's customInstallMode) sets that after its customInit ran. From 0.1.14 to
 * 0.1.16 an update, which installs silently and so keeps customInit's choice, moved the program to %USERPROFILE%\Coopanion and left data\ behind
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
const askStranded = INSTALLED && !PET_HOST && DATA === BESIDE && restoreStrandedData();

// before anything asks Electron for a path: the single-instance lock and the profile live in userData
app.setPath('userData', DATA);
app.setPath('crashDumps', join(DATA, 'Crashpad'));
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(DATA, 'tmp');
mkdirSync(process.env.TEMP, { recursive: true });

/* ---------- pet window mode ---------- */
if (PET_HOST) {
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
if (located) {
  try {
    writeRecord(DATA_RECORD, { data: DATA, program: PROGRAM_DIR, startedAt: new Date().toISOString() });
  } catch { /* the app runs without the record; a later move of the program then finds no data to offer */ }
}

const { CoreHost } = require('./core-host.cjs');
const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
const { RELEASES_URL, canUpdate, startUpdater } = require('./updater.cjs');
/** Steam updates its build, and the portable one is updated by hand: only the others run the updater. */
const SELF_UPDATE = !STEAM && !PORTABLE && canUpdate();

const userData = app.getPath('userData');
const shimDir = join(__dirname, 'shims');
/** MinGit's command directory in the Windows build (scripts/pack.ts). */
const MINGIT = join(APP_ROOT, 'mingit', 'cmd');
/** The pet window's command: it gets the switches the app was started with, so a Chromium switch on the shortcut reaches it too. */
const petHost = [process.execPath, ...app.isPackaged ? [] : [APP_ROOT], ...process.argv.slice(app.isPackaged ? 1 : 2).filter((a) => a.startsWith('--')), '--pet-host'];

/**
 * Whether the data directory's volume holds junctions; FAT, exFAT and most network shares do not. pnpm registers each
 * project it installs into with a link in its store, so on such a volume the store and caches live in
 * `%LOCALAPPDATA%\Coopanion\pnpm` and node_modules hold the packages themselves.
 */
function dataHoldsLinks() {
  if (process.platform !== 'win32') return true;
  const probe = join(DATA, 'tmp', `link-probe-${process.pid}`);
  try {
    symlinkSync(DATA, probe, 'junction');
  } catch {
    return false;
  }
  rmdirSync(probe);
  return true;
}
const LINKS = dataHoldsLinks();
const PNPM_DIR = LINKS ? join(DATA, 'pnpm') : join(process.env.LOCALAPPDATA ?? app.getPath('temp'), 'Coopanion', 'pnpm');

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
    pnpm_config_store_dir: join(PNPM_DIR, 'store'),
    pnpm_config_cache_dir: join(PNPM_DIR, 'cache'),
    pnpm_config_state_dir: join(PNPM_DIR, 'state'),
    // a portable folder is copied whole, which turns pnpm's links (absolute junctions on Windows) into plain folders an
    // extension no longer finds its dependencies through; hoisted node_modules hold the packages themselves
    ...PORTABLE || !LINKS ? { pnpm_config_node_linker: 'hoisted' } : {},
    // extension installs call `corepack pnpm`; the shim (corepack.cmd, or corepack on macOS) runs the bundled pnpm on this runtime.
    // The Windows build carries MinGit (scripts/pack.ts), ahead of any other git, for the history of Coo's workspace
    PATH: [shimDir, ...existsSync(MINGIT) ? [MINGIT] : [], process.env.PATH ?? ''].join(delimiter),
    CORTICO_NODE_EXE: process.execPath,
    CORTICO_PNPM_CJS: join(APP_ROOT, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    // reported with the usage statistics (core/telemetry.ts)
    COOPANION_VERSION: app.getVersion(),
    // the introduction offers the whale's persona outside Steam (core/guide.ts)
    COOPANION_CHANNEL: STEAM ? 'steam' : 'github',
    COOPANION_SELF_UPDATE: SELF_UPDATE ? '1' : '0',
  },
});

let settings = null;
/** The route the settings window showed when it was last closed, where it opens next unless asked for another. */
let settingsRoute = '';
let tray = null;
let quitting = false;
/** The quit was asked for from the pet's update bubble: the updated app starts once installed. */
let restartAfterUpdate = false;
let updater = null;
/** The updater's last step, told again to a Core that starts after it (`core/companion.ts` says it in the bubble). */
let updateStep = null;
/** What the settings window's version line shows of the updater (`settings-preload.cjs`). */
const updateLine = () => updateStep && { phase: updateStep.phase, version: updateStep.version };

/** The app language, set once the app is ready (see the module header). */
let language = 'en';
const T = () => textOf(language);

const consoleUrl = (path = '') => (core.port ? `http://127.0.0.1:${core.port}/${path}` : null);
/** The settings window's page; `path` is a hash route such as `#/dress`. */
const settingsUrl = (path = '') => consoleUrl(`coopanion/${path}`);

/**
 * The settings window lives in a session of its own (SETTINGS_PARTITION), and serveWindow answers every
 * http request of that session. Its files (scripts/stage.ts builds them) are served for `/coopanion/…` on
 * the Core's WebUI origin, so the page and the WebUI API share one origin and Core's same-origin check
 * applies.
 *
 * Who runs what in that session: the settings page, and the extension panels it loads into its own
 * document, run with the Core's full rights, as in Cortico's own WebUI. The pet's pages (its preview on
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
 * is, unfollowed. WebSockets do not pass through here; keepRemoteOut keeps the session's other traffic on
 * this machine, apart from the release check and the extension market's images, and its frames too.
 */
const SETTINGS_PARTITION = 'persist:coopanion-settings';
const WINDOW_DIR = join(APP_ROOT, 'build', 'console');
const WINDOW_PREFIX = '/coopanion/';
const WINDOW_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };
/**
 * The window's own files run only scripts from the Core's origin, which serves the extensions' page bundles too; where its
 * other requests may go is kept by keepRemoteOut.
 */
const WINDOW_CSP = "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
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
    if (from !== coreOrigin()) return refused();
    // a shutdown the console asked for is not a crash
    if (request.method === 'POST' && url.pathname === '/api/run/shutdown') {
      core.expectStop();
      const response = await forward(request, url, from);
      // a request Core refused leaves it running; a later exit is a crash again
      if (!response.ok) core.forgetStop();
      return response;
    }
    return forward(request, url, from);
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
    return new Response(readFileSync(file), { headers: { 'content-type': WINDOW_TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-security-policy': WINDOW_CSP } });
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
/** Images of the extension market: package icons and screenshots of the official index, and GitHub avatars. */
const MARKET_IMAGES = ['https://raw.githubusercontent.com/Pal-AI-Lab/cortico-extensions/', 'https://avatars.githubusercontent.com/'];
const isLocal = (url) => /^(https?|wss?):\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url);
/** Requests of the settings session leave the machine only for the release check and the market's images. */
function keepRemoteOut(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, answer) => {
    const marketImage = details.resourceType === 'image' && MARKET_IMAGES.some((prefix) => details.url.startsWith(prefix));
    answer({ cancel: !(isLocal(details.url) || details.url === RELEASE_CHECK || marketImage) });
  });
}

/**
 * Pages of the settings partition stay on Core's console, and their frames on this machine; a link anywhere
 * else opens in the system browser.
 */
function keepOnConsole(contents) {
  const ours = (url) => !!core.port && url.startsWith(`${coreOrigin()}/`);
  contents.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: WINDOW_ICON } };
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

/**
 * Shows the window in front. Windows lets only the process that took the last input come to the
 * front, and a click in the pet's bubble lands in the pet's own process: topmost for a moment brings it forward there.
 */
function bringForward(win) {
  if (!MAC) win.setAlwaysOnTop(true);
  win.show();
  win.focus();
  if (!MAC) win.setAlwaysOnTop(false);
}

function openSettings(path = '') {
  // a menu-bar app shows in the Dock only while it has a window to switch to
  if (MAC) void app.dock?.show();
  if (settings) {
    if (settings.isMinimized()) settings.restore();
    bringForward(settings);
    const url = settingsUrl(path);
    if (url && path) settings.loadURL(url);
    return;
  }
  const area = screen.getPrimaryDisplay().workAreaSize;
  settings = new BrowserWindow({
    ...readSettingsSize(join(userData, 'settings-size.json'), area),
    title: 'Coopanion', icon: WINDOW_ICON, autoHideMenuBar: true, show: false,
    ...settingsChromeOptions(process.platform),
    backgroundColor: '#f4f5f4',
    webPreferences: { partition: SETTINGS_PARTITION, preload: join(__dirname, 'settings-preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  // the taskbar button takes its icon and relaunch target from the running program, not from a pinned
  // shortcut to the same app id whose program has moved (a reinstall elsewhere, a new portable folder)
  if (process.platform === 'win32' && app.isPackaged) {
    settings.setAppDetails({ appId: APP_ID, appIconPath: process.execPath, appIconIndex: 0, relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: 'Coopanion' });
  }
  settings.once('ready-to-show', () => bringForward(settings));
  settings.on('page-title-updated', (e) => e.preventDefault());
  keepOnConsole(settings.webContents);
  const win = settings;
  let closing = false;
  win.on('close', () => {
    try { saveSettingsSize(join(userData, 'settings-size.json'), win.getNormalBounds()); }
    catch (err) { console.warn('[settings] could not save window size', err); }
    closing = true;
    // the loading page, shown until the Core is up, has no route
    const page = win.webContents.getURL();
    if (page.startsWith('http://')) settingsRoute = new URL(page).hash;
  });
  // A page with unsaved edits (a leave guard, console/base/router.ts) refuses to unload: closing the window
  // then hides it with the edits kept. A load the app starts itself, and a quit, go ahead.
  win.webContents.on('will-prevent-unload', (e) => {
    if (quitting || !closing) { e.preventDefault(); return; }
    closing = false;
    win.hide();
    if (MAC) app.dock?.hide();
  });
  win.on('closed', () => {
    settings = null;
    if (MAC && !quitting) app.dock?.hide();
  });
  const url = settingsUrl(path || settingsRoute);
  settings.loadURL(url ?? loadingPage(T().starting));
}

/** Calls a panel method of a World page through the WebUI API. */
async function panel(pageId, panelId, method) {
  const url = consoleUrl(`api/webui/providers/${encodeURIComponent(pageId)}/panels/${panelId}/${method}`);
  if (!url) return null;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: [] }), signal: AbortSignal.timeout(5000) });
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
 * Windows reads `openAtLogin` back only for the value named after the app's id and with the same arguments;
 * the portable build names its value after its folder, so each copy has its own, and reads it from `launchItems`.
 */
const AUTOSTART = join(app.getPath('home'), '.config', 'autostart', 'coopanion.desktop');
const LOGIN_ARGS = ['--background'];
const LOGIN_NAME = PORTABLE ? `Coopanion ${PROGRAM_DIR}` : undefined;
const loginItem = {
  get: () => (LINUX ? existsSync(AUTOSTART)
    : LOGIN_NAME ? app.getLoginItemSettings().launchItems.some((item) => item.name === LOGIN_NAME)
      : app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin),
  set(on) {
    if (!LINUX) { app.setLoginItemSettings({ openAtLogin: on, args: LOGIN_ARGS, ...LOGIN_NAME ? { name: LOGIN_NAME } : {} }); return; }
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
    { label: t.trayShowPet, enabled: core.state === 'running', click: () => void showPet().catch(() => { /* Core went away meanwhile */ }) },
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
  if (updateStep) core.send({ type: 'companion:update', step: updateStep });
});
core.on('language', followLanguage);
// The saved preference reaches the main process before the first update check.
core.on('auto-update', (enabled) => {
  if (!SELF_UPDATE) return;
  if (updater) { updater.setEnabled(enabled); return; }
  updater = startUpdater({
    logDir: join(userData, 'logs'),
    enabled,
    tell: (step) => {
      updateStep = step;
      core.send({ type: 'companion:update', step });
      settings?.webContents.send('settings:update', updateLine());
    },
  });
});
// the quit stops the Core and takes the tray icon down before the installer runs; the installer kills a
// Coopanion still running, which would leave its icon in the notification area
core.on('update-install', () => {
  if (!updater?.hasUpdate()) return;
  restartAfterUpdate = true;
  app.quit();
});
core.on('releases', () => void shell.openExternal(RELEASES_URL));
// the ChatGPT sign-in page the introduction sends to the system browser; no other address is opened
core.on('browse', (url) => { if (url.startsWith('https://auth.openai.com/')) void shell.openExternal(url); });
core.on('state', (state, exit) => {
  if (!exit) return;
  const detail = exit.kind === 'locked' ? T().coreLocked(exit.pid, exit.file)
    : exit.kind === 'ports-busy' ? T().corePortsBusy(exit.from, exit.to)
      : exit.kind === 'failed' ? T().coreFailed(exit.times, exit.code, exit.logFile) : T().coreRestarting(exit.code);
  if (Notification.isSupported()) new Notification({ title: 'Coopanion', body: detail, icon: WINDOW_ICON }).show();
  if (state === 'failed') dialog.showErrorBox('Coopanion', detail);
});

core.on('open', (path) => openSettings(path));
// the introduction runs again on the desktop, where Coo is
core.on('hide', () => settings?.close());
core.on('quit', () => app.quit());
const bringBack = () => {
  if (core.state === 'failed') void core.start();
  else if (core.state === 'running') ensurePet().catch(() => { /* Core went away meanwhile */ });
};
app.on('second-instance', bringBack);
// macOS: opening the app again while it runs
app.on('activate', bringBack);
app.on('window-all-closed', () => { /* stays in the tray */ });
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  tray?.destroy();
  tray = null;
  void core.stop().finally(() => {
    // a downloaded update installs now; its quit comes back here with quitting set and goes through
    if (updater?.installOnQuit(restartAfterUpdate)) setTimeout(() => app.exit(0), 10_000);
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

// only the settings window's preload sends this, from its main frame
ipcMain.on('settings:theme', (_e, theme) => applySettingsTheme(settings, theme));

ipcMain.on('settings:language', (e) => { e.returnValue = language; });
ipcMain.on('settings:update', (e) => { e.returnValue = { auto: SELF_UPDATE, step: updateLine() }; });

app.whenReady().then(() => {
  const settingsSession = session.fromPartition(SETTINGS_PARTITION);
  settingsSession.protocol.handle('http', serveWindow);
  keepRemoteOut(settingsSession);
  app.setAppUserModelId(APP_ID);
  const system = systemLanguage(app);
  core.opts.env.COOPANION_SYSTEM_LANGUAGE = system;
  language = configuredLanguage(join(userData, 'home')) ?? system;
  if (askStranded && askRestoreStranded()) return;
  // figure packs from the Workshop: more pack directories for the desktop-pet World (core/companion.ts)
  if (STEAM) core.opts.env.COOPANION_PACK_ROOTS = require('./steam.cjs').workshopPackRoots(BUILD.steamAppId, join(userData, 'logs')).join(delimiter);
  buildTray();
  noteAutostart();
  void core.start();
});
