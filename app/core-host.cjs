/**
 * Runs the Core child process and keeps it running.
 *
 * The child is `core/boot.ts` under the app's own runtime in Node mode, with `--import tsx`.
 * It reports `companion:ready` with the console port. It exits on purpose after asking for a
 * restart (`cortico:restart`, or `<dataDir>/.restart-request` written by the console), and is
 * started again; the console's power button asks it to shut down (`expectStop`), which leaves it
 * stopped; an unexpected exit is restarted after 3 s, at most 5 times in 5 minutes, except one that
 * said another process holds the data directory's lock (`companion:locked`) or every console port it tries
 * (`companion:ports-busy`), which a restart would meet again and so is not restarted, and one
 * before `companion:ready` with ERR_MODULE_NOT_FOUND on stderr, which waits longer each time (MISSING_MODULE_DELAYS_MS).
 * A child that exits unasked before it is ready leaves the app's arguments, its parent PID and whether the entry
 * and tsx are on disk in the log. A start after the host gave up (`failed`) begins with a full budget. The next
 * child started after an unexpected exit gets its exit code or signal in `COOPANION_CORE_EXIT`, for
 * the usage statistics. The child asks for the system proxy per host as its requests go out (`companion:proxy`,
 * answered by lookupProxy), unless the environment has proxy variables of its own.
 *
 * Events: `ready` ({ port, keyMissing, language }), `language` (the app language after a change),
 * `state` (the state, and for an unexpected exit `{ kind: 'restarting', code }` or, once it stops
 * retrying, `{ kind: 'failed', times, code, logFile }`, for a lock held elsewhere `{ kind: 'locked', pid, file }`, or for
 * the console ports `{ kind: 'ports-busy', from, to }`), and the Core's requests `open`, `hide`,
 * `quit`, `update-install`, `releases` and `auto-update` (the saved boolean preference).
 */
const { fork } = require('node:child_process');
const { coreEnvironment, lookupProxy, proxySource } = require('./core-env.cjs');
const { EventEmitter } = require('node:events');
const { createWriteStream, existsSync, mkdirSync, renameSync, statSync } = require('node:fs');
const { join } = require('node:path');

const CRASH_WINDOW_MS = 5 * 60_000;
const MAX_CRASHES = 5;
/**
 * The waits before starting again after a child that exited before it was ready with ERR_MODULE_NOT_FOUND, which is
 * what a start meets while the runtime's files are still being written. These exits do not count toward MAX_CRASHES;
 * after the last wait the next one is `failed`. Together they wait 223 s, so the exits stay within the 5 minutes
 * coreFailed reports.
 */
const MISSING_MODULE_DELAYS_MS = [3_000, 10_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000];
/** The file `--import tsx` loads: tsx's `exports['.']`. */
const TSX_ENTRY = ['node_modules', 'tsx', 'dist', 'loader.mjs'];
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;

/** The app process's arguments and parent PID, and whether the Core's entry and tsx exist, as a line for core.log. */
function startDiagnostics(appRoot) {
  const entry = join(appRoot, 'core', 'boot.ts');
  const tsx = join(appRoot, ...TSX_ENTRY);
  const on = (file) => `${file} ${existsSync(file) ? 'exists' : 'missing'}`;
  return `exited before ready; app argv ${JSON.stringify(process.argv.slice(1))}, ppid ${process.ppid}; ${on(entry)}; ${on(tsx)}\n`;
}

class CoreHost extends EventEmitter {
  /** @param {{ appRoot: string, env: NodeJS.ProcessEnv, logDir: string, resolveProxy: (url: string) => Promise<string> }} opts */
  constructor(opts) {
    super();
    this.opts = opts;
    this.child = null;
    this.port = null;
    this.dataDir = null;
    this.keyMissing = false;
    this.restartAsked = false;
    this.stopping = false;
    /** The console asked for a shutdown through the WebUI: the child's exit is intentional. */
    this.shutdownAsked = false;
    this.crashes = [];
    /** ERR_MODULE_NOT_FOUND exits before ready since the last ready child: the index into MISSING_MODULE_DELAYS_MS. */
    this.missingModuleExits = 0;
    /**
     * What the child said keeps it from starting, so its exit is not restarted: another process holds the data
     * directory's lock (`companion:locked`, its PID and the lock file), or every console port is taken (`companion:ports-busy`).
     */
    this.blocked = null;
    /** Exit code or signal of the last child that exited unasked, not yet handed to a new one. */
    this.unexpectedExit = null;
    this.state = 'stopped';
  }

  async start() {
    if (this.child || this.stopping) return;
    if (this.state === 'failed') { this.crashes = []; this.missingModuleExits = 0; }
    mkdirSync(this.opts.logDir, { recursive: true });
    const logFile = join(this.opts.logDir, 'core.log');
    if (existsSync(logFile) && statSync(logFile).size > LOG_ROTATE_BYTES) renameSync(logFile, join(this.opts.logDir, 'core.old.log'));
    const log = createWriteStream(logFile, { flags: 'a' });
    log.write(`\n===== ${new Date().toISOString()} start =====\n${proxySource(this.opts.env)}\n`);
    const child = fork(join(this.opts.appRoot, 'core', 'boot.ts'), [], {
      cwd: this.opts.appRoot,
      // --use-system-ca: TLS trusts the operating system's certificate store as well as Node's bundled one;
      // --expose-gc: the desktop-pet World frees a speech model as soon as it stops it (its src/asr/sherpa.ts)
      execArgv: ['--use-env-proxy', '--use-system-ca', '--expose-gc', '--import', 'tsx'],
      env: coreEnvironment({ ...this.opts.env, ...(this.unexpectedExit === null ? {} : { COOPANION_CORE_EXIT: String(this.unexpectedExit) }) }),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.unexpectedExit = null;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let missingModule = false;
    let tail = '';
    child.stderr.on('data', (chunk) => {
      const text = tail + chunk;
      if (text.includes('ERR_MODULE_NOT_FOUND')) missingModule = true;
      tail = text.slice(-32);
    });
    this.child = child;
    this.state = 'starting';
    this.restartAsked = false;
    this.shutdownAsked = false;
    this.emit('state', this.state);
    child.on('message', (msg) => {
      if (msg?.type === 'companion:ready') {
        this.port = msg.port;
        this.dataDir = msg.dataDir;
        this.keyMissing = !!msg.keyMissing;
        this.state = 'running';
        this.missingModuleExits = 0;
        this.emit('ready', { port: msg.port, keyMissing: this.keyMissing, language: msg.language });
        this.emit('state', this.state);
      } else if (msg?.type === 'companion:proxy' && typeof msg.url === 'string') {
        void lookupProxy(msg.url, this.opts.resolveProxy).then(({ proxy, rule }) => {
          try { child.send({ type: 'companion:proxy', id: msg.id, proxy, rule }); } catch { /* channel closing */ }
        });
      } else if (msg?.type === 'companion:language') {
        this.emit('language', msg.language);
      } else if (msg?.type === 'companion:auto-update' && typeof msg.enabled === 'boolean') {
        this.emit('auto-update', msg.enabled);
      } else if (msg?.type === 'cortico:ready') {
        this.dataDir = msg.dataDir;
      } else if (msg?.type === 'companion:locked') {
        this.blocked = { kind: 'locked', pid: Number.isInteger(msg.pid) ? msg.pid : null, file: String(msg.file ?? '') };
      } else if (msg?.type === 'companion:ports-busy' && Number.isInteger(msg.from) && Number.isInteger(msg.to)) {
        this.blocked = { kind: 'ports-busy', from: msg.from, to: msg.to };
      } else if (msg?.type === 'cortico:restart') {
        this.restartAsked = true;
      } else if (msg?.type === 'companion:open') {
        this.emit('open', typeof msg.path === 'string' ? msg.path : '');
      } else if (msg?.type === 'companion:hide') {
        this.emit('hide');
      } else if (msg?.type === 'companion:quit') {
        this.emit('quit');
      } else if (msg?.type === 'companion:update-install') {
        this.emit('update-install');
      } else if (msg?.type === 'companion:releases') {
        this.emit('releases');
      } else if (msg?.type === 'companion:browse' && typeof msg.url === 'string') {
        this.emit('browse', msg.url);
      }
    });
    const exited = (code, signal, startFailed) => {
      if (startFailed) log.write(startDiagnostics(this.opts.appRoot));
      log.end(`===== exit ${code} =====\n`);
      if (this.child !== child) return;
      this.child = null;
      this.port = null;
      if (this.stopping || this.shutdownAsked) {
        this.shutdownAsked = false;
        this.state = 'stopped';
        this.emit('state', this.state);
        return;
      }
      const flagged = this.dataDir && existsSync(join(this.dataDir, '.restart-request'));
      if (this.restartAsked || flagged) {
        this.state = 'restarting';
        this.emit('state', this.state);
        void this.start();
        return;
      }
      if (this.blocked) {
        // starting again would meet the same lock or ports: the person frees them, then restarts from the tray
        const blocked = this.blocked;
        this.blocked = null;
        this.state = 'failed';
        this.emit('state', this.state, blocked);
        return;
      }
      this.unexpectedExit = code ?? signal;
      if (startFailed && missingModule) {
        if (this.missingModuleExits < MISSING_MODULE_DELAYS_MS.length) {
          const delay = MISSING_MODULE_DELAYS_MS[this.missingModuleExits++];
          this.state = 'restarting';
          this.emit('state', this.state);
          setTimeout(() => { if (!this.stopping) void this.start(); }, delay);
          return;
        }
        this.state = 'failed';
        this.emit('state', this.state, { kind: 'failed', times: this.missingModuleExits + 1, code, logFile });
        return;
      }
      const now = Date.now();
      this.crashes = this.crashes.filter((t) => now - t < CRASH_WINDOW_MS);
      this.crashes.push(now);
      if (this.crashes.length > MAX_CRASHES) {
        this.state = 'failed';
        this.emit('state', this.state, { kind: 'failed', times: this.crashes.length, code, logFile });
        return;
      }
      this.state = 'restarting';
      this.emit('state', this.state, { kind: 'restarting', code });
      setTimeout(() => { if (!this.stopping) void this.start(); }, 3000);
    };
    child.on('exit', (code, signal) => {
      const startFailed = this.child === child && this.state === 'starting' && !this.stopping && !this.restartAsked;
      if (!startFailed || child.stderr.readableEnded) { exited(code, signal, startFailed); return; }
      // the last stderr lines can be read after the exit, and a failed start is judged on all of them
      let settled = false;
      const settle = () => { if (!settled) { settled = true; exited(code, signal, startFailed); } };
      child.stderr.once('end', settle);
      setTimeout(settle, 1000);
    });
  }

  /** The console's power button asked the running child to shut down; its exit is not a crash. */
  expectStop() {
    if (this.child) this.shutdownAsked = true;
  }

  /** The shutdown request did not reach the child, so a later exit is a crash again. */
  forgetStop() {
    this.shutdownAsked = false;
  }

  /** Sends a message to the running child; dropped while there is none. */
  send(msg) {
    try { this.child?.send(msg); } catch { /* channel closing */ }
  }

  /** Asks for a clean shutdown, then forces termination after `graceMs` and waits up to 5 s for exit. */
  async stop(graceMs = 12_000) {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    const exited = new Promise((r) => child.once('exit', r));
    const within = (ms) => {
      let timer;
      return Promise.race([
        exited.then(() => true),
        new Promise((r) => { timer = setTimeout(() => r(false), ms); }),
      ]).finally(() => clearTimeout(timer));
    };
    try { child.send({ type: 'companion:shutdown' }); } catch { /* channel already closed */ }
    if (await within(graceMs)) return;
    // Core treats SIGTERM as another shutdown request and ignores it once shutdown is under way.
    child.kill('SIGKILL');
    if (await within(5000)) return;
    if (this.child === child) {
      this.child = null;
      this.port = null;
      this.state = 'stopped';
      this.emit('state', this.state);
    }
  }

  /** Restart on demand (tray menu). */
  async restart() {
    await this.stop();
    this.stopping = false;
    await this.start();
  }
}

module.exports = { CoreHost };
