/**
 * Runs the Core child process and keeps it running.
 *
 * The child is `core/boot.ts` under the app's own runtime in Node mode, with `--import tsx`.
 * It reports `companion:ready` with the console port. It exits on purpose after asking for a
 * restart (`cortico:restart`, or `<dataDir>/.restart-request` written by the console), and is
 * started again; an unexpected exit is restarted after 3 s, at most 5 times in 5 minutes.
 */
const { fork } = require('node:child_process');
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
      execArgv: ['--import', 'tsx'],
      env: { ...this.opts.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
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
        this.emit('ready', { port: msg.port, keyMissing: this.keyMissing });
        this.emit('state', this.state);
      } else if (msg?.type === 'cortico:ready') {
        this.dataDir = msg.dataDir;
      } else if (msg?.type === 'cortico:restart') {
        this.restartAsked = true;
      }
    });
    child.on('exit', (code) => {
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
      const now = Date.now();
      this.crashes = this.crashes.filter((t) => now - t < CRASH_WINDOW_MS);
      this.crashes.push(now);
      if (this.crashes.length > MAX_CRASHES) {
        this.state = 'failed';
        this.emit('state', this.state, `Core 在 5 分钟内退出了 ${this.crashes.length} 次(退出码 ${code}),已停止重试。日志:${logFile}`);
        return;
      }
      this.state = 'restarting';
      this.emit('state', this.state, `Core 意外退出(退出码 ${code}),3 秒后重启`);
      setTimeout(() => { if (!this.stopping) this.start(); }, 3000);
    });
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
