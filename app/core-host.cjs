/**
 * Runs the Core child process and keeps it running.
 *
 * The child is `core/boot.ts` under the app's own runtime in Node mode, with `--import tsx`.
 * It reports `companion:ready` with the console port. It exits on purpose after asking for a
 * restart (`cortico:restart`, or `<dataDir>/.restart-request` written by the console), and is
 * started again; an unexpected exit is restarted after 3 s, at most 5 times in 5 minutes. The next
 * child started after an unexpected exit gets its exit code or signal in `COOPANION_CORE_EXIT`, for
 * the usage statistics.
 *
 * Events: `ready` ({ port, keyMissing, language }), `language` (the app language after a change),
 * `state` (the state, and for an unexpected exit `{ kind: 'restarting', code }` or, once it stops
 * retrying, `{ kind: 'failed', times, code, logFile }`), and the Core's requests `open`, `hide`,
 * `quit`, `update-install` and `releases`.
 */
const { fork } = require('node:child_process');
const { coreEnvironment } = require('./core-env.cjs');
const { EventEmitter } = require('node:events');
const { createWriteStream, existsSync, mkdirSync, renameSync, statSync } = require('node:fs');
const { join } = require('node:path');

const CRASH_WINDOW_MS = 5 * 60_000;
const MAX_CRASHES = 5;
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;

class CoreHost extends EventEmitter {
  /** @param {{ appRoot: string, env: NodeJS.ProcessEnv, logDir: string }} opts */
  constructor(opts) {
    super();
    this.opts = opts;
    this.child = null;
    this.port = null;
    this.dataDir = null;
    this.keyMissing = false;
    this.restartAsked = false;
    this.stopping = false;
    this.crashes = [];
    /** Exit code or signal of the last child that exited unasked, not yet handed to a new one. */
    this.unexpectedExit = null;
    this.state = 'stopped';
  }

  start() {
    if (this.child) return;
    mkdirSync(this.opts.logDir, { recursive: true });
    const logFile = join(this.opts.logDir, 'core.log');
    if (existsSync(logFile) && statSync(logFile).size > LOG_ROTATE_BYTES) renameSync(logFile, join(this.opts.logDir, 'core.old.log'));
    const log = createWriteStream(logFile, { flags: 'a' });
    log.write(`\n===== ${new Date().toISOString()} start =====\n`);
    const child = fork(join(this.opts.appRoot, 'core', 'boot.ts'), [], {
      cwd: this.opts.appRoot,
      execArgv: ['--use-env-proxy', '--import', 'tsx'],
      env: coreEnvironment(this.unexpectedExit === null ? this.opts.env : { ...this.opts.env, COOPANION_CORE_EXIT: String(this.unexpectedExit) }),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.unexpectedExit = null;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    this.child = child;
    this.state = 'starting';
    this.restartAsked = false;
    this.emit('state', this.state);
    child.on('message', (msg) => {
      if (msg?.type === 'companion:ready') {
        this.port = msg.port;
        this.dataDir = msg.dataDir;
        this.keyMissing = !!msg.keyMissing;
        this.state = 'running';
        this.emit('ready', { port: msg.port, keyMissing: this.keyMissing, language: msg.language });
        this.emit('state', this.state);
      } else if (msg?.type === 'companion:language') {
        this.emit('language', msg.language);
      } else if (msg?.type === 'cortico:ready') {
        this.dataDir = msg.dataDir;
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
      }
    });
    child.on('exit', (code, signal) => {
      log.end(`===== exit ${code} =====\n`);
      if (this.child !== child) return;
      this.child = null;
      this.port = null;
      if (this.stopping) { this.state = 'stopped'; this.emit('state', this.state); return; }
      const flagged = this.dataDir && existsSync(join(this.dataDir, '.restart-request'));
      if (this.restartAsked || flagged) {
        this.state = 'restarting';
        this.emit('state', this.state);
        this.start();
        return;
      }
      this.unexpectedExit = code ?? signal;
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
      setTimeout(() => { if (!this.stopping) this.start(); }, 3000);
    });
  }

  /** Sends a message to the running child; dropped while there is none. */
  send(msg) {
    try { this.child?.send(msg); } catch { /* channel closing */ }
  }

  /** Asks for a clean shutdown; kills the child if it has not exited within `graceMs`. */
  async stop(graceMs = 12_000) {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    const exited = new Promise((r) => child.once('exit', r));
    try { child.send({ type: 'companion:shutdown' }); } catch { /* channel already closed */ }
    const done = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), graceMs))]);
    if (!done) child.kill();
  }

  /** Restart on demand (tray menu). */
  async restart() {
    await this.stop();
    this.stopping = false;
    this.start();
  }
}

module.exports = { CoreHost };
