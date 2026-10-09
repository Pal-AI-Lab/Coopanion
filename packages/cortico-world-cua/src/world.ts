/**
 * CuaWorld: the local desktop as a World. Tools take screenshots, move and click the mouse,
 * scroll, type, press keys, list and focus windows. All operating-system calls run in an
 * engine child process (`engine-child.ts`); a crash there fails the call in flight and the
 * next call starts a fresh engine.
 *
 * Screenshots are scaled to fit `screenshot.maxWidth`×`maxHeight`; tool coordinates are
 * pixels of that scaled image and are mapped back to physical pixels here. Input tools
 * first wait for the user to leave mouse and keyboard alone (`userIdleMs`), up to
 * `maxYieldWaitMs`, and fail without acting if the user keeps going.
 *
 * `permission` sets when the person is asked first (config.ts, PERMISSION_LEVELS): at most once
 * a turn, before the first call that reads the screen or before the first input, or once for
 * `grantMinutes`, or never. The question goes through `askPermission` when the embedding app gives
 * one (a pet's bubble), else through a system dialog. A refusal stands until the turn ends.
 *
 * Every tool is interruptible. When the call's signal aborts, the tool stops at the next point
 * where no input is left half-done and its receipt says what it did: a call waiting for the
 * person's answer returns without acting (the question stays open for the turn), the engine ends
 * its wait for the user with nothing sent or stops typing between chunks, `cua_wait` ends its
 * wait, and an action already sent skips the settle and the screenshot after it.
 *
 * Receipts and environment prompt values are in the model-text language (`model-text.ts`).
 */
import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Logger, ToolCallContext, ToolDef, ToolOutcome, World, WorldConsoleDecl, WorldHost } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { childExecArgv } from 'cortico/extensions/runtime.ts';
import { CUA_CONFIG_GROUP, CUA_ID, type CuaConfigSection, type PermissionLevel } from './config.ts';
import { CUA_TOOL_DECLS } from './tools.ts';
import { fit } from './engine/image.ts';
import { parseKeys } from './engine/keys.ts';
import { MODEL_TEXT, type ModelLanguage, type ModelText } from './model-text.ts';
import type { Answer, Button, ChildToMain, EngineRequest, InputResult, MainToChild, ScreenInfo, ScreenshotResult, TypeResult, WindowEntry, Yield } from './engine-ipc.ts';

const ENGINE_FILE = fileURLToPath(new URL('./engine-child.ts', import.meta.url));
/** The environment prompt template of each model-text language; English falls back to Chinese while its file is missing. */
const ENV_PROMPT_FILES: Record<ModelLanguage, string> = {
  zh: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
  en: fileURLToPath(new URL('./ENV_PROMPT.en.md', import.meta.url)),
};
const ENGINE_TIMEOUT_MS = 30_000;
/** How long a permission question waits for the person. */
const PERMISSION_TIMEOUT_MS = 60_000;

export interface CuaWorldOptions {
  cfg: CuaConfigSection;
  timezone: string;
  /** Names the bot in the permission question. */
  botName?: string;
  /**
   * Asks the person whether the bot may use the computer this turn. null: this way of asking
   * is not available right now, and the system dialog asks instead.
   */
  askPermission?: (question: string) => Promise<Answer | null>;
  /** The language of what the bot reads from this World, read at each use; Chinese when absent. */
  modelLanguage?: () => ModelLanguage;
}

/** The person did not allow this turn's computer use. */
class NotPermitted extends Error {}

/** The call's signal aborted before it did anything. */
class Interrupted extends Error {}

type Args = Record<string, unknown>;

/** `p`'s value, or null when `signal` aborts first. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T | null> {
  if (!signal) return p;
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const stop = () => resolve(null);
    signal.addEventListener('abort', stop, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** Waits `ms`, or less when `signal` aborts; resolves to the milliseconds actually waited. */
async function pause(ms: number, signal: AbortSignal | undefined): Promise<number> {
  const start = Date.now();
  await sleep(ms, undefined, { signal }).catch(() => {});
  return Date.now() - start;
}

export class CuaWorld implements World {
  readonly id = CUA_ID;
  private readonly cfg: CuaConfigSection;
  private host: WorldHost | null = null;
  private log: Logger | null = null;
  private engine: ChildProcess | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { done: (v: unknown) => void; fail: (e: Error) => void; timer: NodeJS.Timeout }>();
  private screen: { width: number; height: number } | null = null;
  private engineError: string | null = null;
  /** This turn's answer, asked on first use; cleared when the turn ends. */
  private permission: Promise<Answer> | null = null;
  /** ask-once: a yes holds until then (ms since epoch). */
  private grantedUntil = 0;

  constructor(private readonly opts: CuaWorldOptions) {
    this.cfg = opts.cfg;
  }

  /** The language of what the bot reads from this World. */
  private get language(): ModelLanguage {
    return this.opts.modelLanguage?.() ?? 'zh';
  }

  /** The text table of that language. */
  private get t(): ModelText {
    return MODEL_TEXT[this.language];
  }

  onTurnEnded(): void {
    this.permission = null;
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.log = host.log;
    const info = await this.call<ScreenInfo>({ op: 'info' });
    this.screen = info.screen;
  }

  async stop(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.fail(new Error(this.t.worldStopped)); }
    this.pending.clear();
    if (engine && engine.exitCode === null) {
      const exited = new Promise<void>((r) => engine.once('exit', () => r()));
      engine.disconnect();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
      if (engine.exitCode === null) engine.kill();
    }
    this.host = null;
  }

  /* ---------- engine ---------- */

  private spawn(): ChildProcess {
    const child = fork(ENGINE_FILE, [], { execArgv: childExecArgv(), serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const log = this.log?.child('engine');
    const forward = (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) if (line.trim()) log?.warn(line); };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('message', (msg: ChildToMain) => {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.done(msg.value);
      else p.fail(new Error(msg.error));
    });
    child.on('exit', (code) => {
      if (this.engine === child) this.engine = null;
      this.engineError = code === 0 ? null : `引擎进程退出(退出码 ${code})`;
      const why = this.t.engineExited(code === 0 ? undefined : code);
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.fail(new Error(why)); this.pending.delete(id); }
    });
    return child;
  }

  /**
   * Sends one request to the engine. When `signal` aborts after the request went out, the engine
   * gets a cancel and the call still resolves with what the engine reports it did.
   */
  private async call<T>(req: EngineRequest, signal?: AbortSignal): Promise<T> {
    if (req.op !== 'info' && req.op !== 'confirm') await this.permit(req.op === 'screenshot' || req.op === 'windows' ? 'see' : 'act', signal);
    if (signal?.aborted) throw new Interrupted(this.t.interruptedBeforeAct);
    if (!this.engine) { this.engine = this.spawn(); this.engineError = null; }
    const id = ++this.seq;
    const engine = this.engine;
    return new Promise<T>((done, fail) => {
      const wait = 'yield' in req ? req.yield.maxWaitMs : req.op === 'confirm' ? req.timeoutMs : 0;
      const cancel = () => { if (engine.connected) engine.send({ cancel: id } satisfies MainToChild); };
      const unlisten = () => signal?.removeEventListener('abort', cancel);
      const timer = setTimeout(() => { this.pending.delete(id); unlisten(); fail(new Error(this.t.engineTimeout)); }, ENGINE_TIMEOUT_MS + wait);
      this.pending.set(id, { done: (v) => { unlisten(); done(v as T); }, fail: (e) => { unlisten(); fail(e); }, timer });
      signal?.addEventListener('abort', cancel, { once: true });
      engine.send({ id, req } satisfies MainToChild);
    });
  }

  /* ---------- permission ---------- */

  private get level(): PermissionLevel {
    const l = this.cfg.permission;
    return l === 'ask-before-acting' || l === 'ask-once' || l === 'never-ask' ? l : 'ask-each-turn';
  }

  /** An abort while the question is open returns without an answer; the question stays open for this turn. */
  private async permit(kind: 'see' | 'act', signal: AbortSignal | undefined): Promise<void> {
    const level = this.level;
    if (level === 'never-ask') return;
    if (kind === 'see' && level !== 'ask-each-turn') return;
    if (level === 'ask-once' && Date.now() < this.grantedUntil) return;
    this.permission ??= this.askPermission(level);
    const answer = await untilAborted(this.permission, signal);
    if (answer === null) throw new Interrupted(this.t.interruptedAsking);
    if (answer === 'yes') {
      // ask-once: the yes holds for grantMinutes from now, and is asked for again once that runs out
      if (level === 'ask-once') { this.grantedUntil = Date.now() + this.cfg.grantMinutes * 60_000; this.permission = null; }
      return;
    }
    throw new NotPermitted(answer === 'timeout' ? this.t.askTimedOut(PERMISSION_TIMEOUT_MS / 1000) : this.t.refused(level));
  }

  private async askPermission(level: PermissionLevel): Promise<Answer> {
    const who = this.opts.botName || 'bot';
    const question = level === 'ask-each-turn' ? `${who} 想用你的电脑:看屏幕、动鼠标和键盘。这一次可以吗?`
      : level === 'ask-once' ? `${who} 想动你的鼠标和键盘。接下来 ${this.cfg.grantMinutes} 分钟里都可以吗?`
        : `${who} 想动你的鼠标和键盘。这一次可以吗?`;
    const viaApp = await this.opts.askPermission?.(question) ?? null;
    if (viaApp) return viaApp;
    return this.call<Answer>({ op: 'confirm', text: question, caption: '电脑操作', timeoutMs: PERMISSION_TIMEOUT_MS });
  }

  /* ---------- coordinates ---------- */

  private shotSize() {
    const s = this.screen ?? { width: 1920, height: 1080 };
    return fit(s.width, s.height, this.cfg.screenshot.maxWidth, this.cfg.screenshot.maxHeight);
  }

  /** Screenshot pixel → physical pixel, or a reason the point is off the screenshot. */
  private toScreen(x: unknown, y: unknown): { x: number; y: number } | string {
    const size = this.shotSize();
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return this.t.notNumbers;
    if (x < 0 || y < 0 || x >= size.width || y >= size.height) return this.t.offShot(x, y, size.width - 1, size.height - 1);
    return { x: Math.round(x / size.scale), y: Math.round(y / size.scale) };
  }

  private toShot(p: { x: number; y: number }): string {
    const s = this.shotSize().scale;
    return `(${Math.round(p.x * s)}, ${Math.round(p.y * s)})`;
  }

  /* ---------- tools ---------- */

  tools(): ToolDef[] {
    const handlers: Record<string, (args: Args, signal?: AbortSignal) => Promise<ToolOutcome>> = {
      cua_screenshot: (_, s) => this.screenshot('', s),
      cua_click: (a, s) => this.click(a, s),
      cua_move: (a, s) => this.move(a, s),
      cua_drag: (a, s) => this.drag(a, s),
      cua_scroll: (a, s) => this.scroll(a, s),
      cua_type: (a, s) => this.type(a, s),
      cua_key: (a, s) => this.key(a, s),
      cua_windows: (_, s) => this.windows(s),
      cua_focus: (a, s) => this.focus(a, s),
      cua_wait: (a, s) => this.wait(a, s),
    };
    return CUA_TOOL_DECLS.map((decl) => ({
      ...decl,
      interruptible: true,
      handler: async (args: Args, ctx: ToolCallContext) => {
        try {
          return await handlers[decl.name](args, ctx.signal);
        } catch (err) {
          const t = this.t;
          if (err instanceof Interrupted) return { text: t.notRun(decl.name, err.message) };
          if (err instanceof NotPermitted) return { text: t.notRun(decl.name, err.message + t.askAgain), failed: true };
          return { text: t.failed(decl.name, (err as Error).message), failed: true };
        }
      },
    }));
  }

  private get yieldCfg(): Yield {
    return { idleMs: this.cfg.userIdleMs, maxWaitMs: this.cfg.maxYieldWaitMs };
  }

  /** `signal` reaches only the permission question; once the capture is requested it completes. */
  async screenshot(lead: string, signal?: AbortSignal): Promise<ToolOutcome> {
    const shot = await this.call<ScreenshotResult>({ op: 'screenshot', maxWidth: this.cfg.screenshot.maxWidth, maxHeight: this.cfg.screenshot.maxHeight, quality: this.cfg.screenshot.quality }, signal);
    this.screen = shot.screen;
    const seen = this.host?.modelFacts.accepts('image/jpeg') ?? true;
    const t = this.t;
    const text = t.screenshot(lead, shot.width, shot.height, shot.screen.width, shot.screen.height, this.toShot(shot.cursor), shot.foreground, seen);
    return { text, blobs: [{ bytes: shot.jpeg, mime: 'image/jpeg', name: 'screen.jpg', fallbackText: t.screenshotFallback(shot.width, shot.height) }] };
  }

  private refuseControl(tool: string): ToolOutcome | null {
    if (this.cfg.control) return null;
    return { text: this.t.notRun(tool, this.t.viewOnly), failed: true };
  }

  /** Shared tail of every input tool: yield report, optional settle + screenshot; an abort skips the screenshot. */
  private async after(tool: string, res: InputResult, signal: AbortSignal | undefined, done: string, args: Args): Promise<ToolOutcome> {
    const t = this.t;
    if (res.yielded) return { text: t.notRun(tool, t.yielded(Math.round(res.waitedMs / 1000))), failed: true };
    if (res.cancelled) return { text: t.notRun(tool, t.cancelledWaiting((res.waitedMs / 1000).toFixed(1))) };
    const line = `${done}${res.waitedMs >= 300 ? t.waitedFirst((res.waitedMs / 1000).toFixed(1)) : ''}`;
    const plain = t.after(line, this.toShot(res.cursor), res.foreground);
    const want = typeof args.screenshot === 'boolean' ? args.screenshot : this.cfg.screenshot.afterAction;
    if (!want) return { text: plain };
    await pause(this.cfg.screenshot.settleMs, signal);
    if (signal?.aborted) return { text: `${plain}${t.noShotInterrupted}` };
    return this.screenshot(`${line}\n`);
  }

  private async click(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_click');
    if (refused) return refused;
    const p = this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: this.t.notRun('cua_click', p), failed: true };
    const button = (args.button === 'right' || args.button === 'middle' ? args.button : 'left') as Button;
    const count = args.clicks === 2 || args.clicks === 3 ? args.clicks : 1;
    const res = await this.call<InputResult>({ op: 'click', ...p, button, count, yield: this.yieldCfg }, signal);
    return this.after('cua_click', res, signal, this.t.clicked(args.x, args.y, button, count), args);
  }

  private async move(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_move');
    if (refused) return refused;
    const p = this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: this.t.notRun('cua_move', p), failed: true };
    const res = await this.call<InputResult>({ op: 'move', ...p, yield: this.yieldCfg }, signal);
    return this.after('cua_move', res, signal, this.t.moved(args.x, args.y), args);
  }

  private async drag(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_drag');
    if (refused) return refused;
    const from = Array.isArray(args.from) ? args.from : [];
    const to = Array.isArray(args.to) ? args.to : [];
    const a = this.toScreen(from[0], from[1]);
    const b = this.toScreen(to[0], to[1]);
    if (typeof a === 'string' || typeof b === 'string') return { text: this.t.notRun('cua_drag', typeof a === 'string' ? this.t.dragStart(a) : this.t.dragEnd(b as string)), failed: true };
    const res = await this.call<InputResult>({ op: 'drag', x1: a.x, y1: a.y, x2: b.x, y2: b.y, yield: this.yieldCfg }, signal);
    return this.after('cua_drag', res, signal, this.t.dragged(from, to), args);
  }

  private async scroll(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_scroll');
    if (refused) return refused;
    const p = this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: this.t.notRun('cua_scroll', p), failed: true };
    const clampN = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-30, Math.min(30, Math.round(v))) : 0);
    const down = clampN(args.down), right = clampN(args.right);
    if (!down && !right) return { text: this.t.notRun('cua_scroll', this.t.scrollNone), failed: true };
    const res = await this.call<InputResult>({ op: 'scroll', ...p, down, right, yield: this.yieldCfg }, signal);
    return this.after('cua_scroll', res, signal, this.t.scrolled(args.x, args.y, down, right), args);
  }

  private async type(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_type');
    if (refused) return refused;
    const text = typeof args.text === 'string' ? args.text : '';
    if (!text) return { text: this.t.notRun('cua_type', this.t.typeEmpty), failed: true };
    const res = await this.call<TypeResult>({ op: 'type', text, chunkDelayMs: this.cfg.typeChunkDelayMs, yield: this.yieldCfg }, signal);
    const total = [...text].length;
    const done = res.stoppedBy === 'cancel' || res.stoppedBy === 'user' ? this.t.typedPart(res.typed, total, res.stoppedBy) : this.t.typed(total);
    return this.after('cua_type', res, signal, done, args);
  }

  private async key(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_key');
    if (refused) return refused;
    const spec = typeof args.keys === 'string' ? args.keys : '';
    const parsed = parseKeys(spec, this.language);
    if ('error' in parsed) return { text: this.t.notRun('cua_key', this.t.keyBad(parsed.error)), failed: true };
    const res = await this.call<InputResult>({ op: 'key', chords: parsed.chords, yield: this.yieldCfg }, signal);
    return this.after('cua_key', res, signal, this.t.pressed(spec.trim()), args);
  }

  private async listWindows(signal: AbortSignal | undefined): Promise<WindowEntry[]> {
    return this.call<WindowEntry[]>({ op: 'windows' }, signal);
  }

  private async windows(signal?: AbortSignal): Promise<ToolOutcome> {
    const list = await this.listWindows(signal);
    const t = this.t;
    const s = this.shotSize();
    const screen = this.screen ?? { width: 0, height: 0 };
    const lines = list.map((w) => {
      const r = w.rect;
      const off = r.x + r.width <= 0 || r.y + r.height <= 0 || r.x >= screen.width || r.y >= screen.height;
      const where = w.minimized ? t.minimized : off ? t.offScreen : `(${Math.round(r.x * s.scale)}, ${Math.round(r.y * s.scale)}) ${Math.round(r.width * s.scale)}×${Math.round(r.height * s.scale)}`;
      return t.windowLine(w.handle, w.foreground, w.title, where);
    });
    return { text: t.windows(list.length, lines) };
  }

  private async focus(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_focus');
    if (refused) return refused;
    const key = typeof args.window === 'string' ? args.window.trim() : '';
    if (!key) return { text: this.t.notRun('cua_focus', this.t.focusEmpty), failed: true };
    const list = await this.listWindows(signal);
    const hit = list.find((w) => w.handle === key.toLowerCase()) ?? list.find((w) => w.title.includes(key)) ?? list.find((w) => w.title.toLowerCase().includes(key.toLowerCase()));
    if (!hit) return { text: this.t.notRun('cua_focus', this.t.focusMissing(key)), failed: true };
    const res = await this.call<InputResult & { focused: boolean }>({ op: 'focus', handle: hit.handle, yield: this.yieldCfg }, signal);
    const done = res.focused || res.foreground === hit.title ? this.t.focused(hit.title) : this.t.focusRefused(hit.title, res.foreground);
    return this.after('cua_focus', res, signal, done, args);
  }

  /** Waiting asks nobody; the screenshot after it is taken only when looking needs no new question. */
  private async wait(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const seconds = typeof args.seconds === 'number' && Number.isFinite(args.seconds) ? Math.max(0, Math.min(30, args.seconds)) : 1;
    const waitedMs = await pause(seconds * 1000, signal);
    const t = this.t;
    if (signal?.aborted) return { text: t.waitInterrupted((waitedMs / 1000).toFixed(1), seconds) };
    const look = await this.mayLook(signal);
    if (signal?.aborted) return { text: `${t.waited(seconds)}${t.noShotInterrupted}` };
    if (!look) return { text: t.waitNoLook(seconds) };
    return this.screenshot(`${t.waited(seconds)}\n`);
  }

  /** Looking at the screen now would not ask the person: the level lets it, or this turn's answer was yes. */
  private async mayLook(signal: AbortSignal | undefined): Promise<boolean> {
    if (this.level !== 'ask-each-turn') return true;
    return this.permission !== null && await untilAborted(this.permission, signal) === 'yes';
  }

  /* ---------- prompt & console ---------- */

  envPromptVars(): Record<string, string> {
    const s = this.shotSize();
    const t = this.t;
    return {
      'cua.os': process.platform === 'darwin' ? 'Mac' : process.platform === 'linux' ? 'Linux' : 'Windows',
      'cua.keys': process.platform === 'darwin' ? t.keysMac : t.keysOther,
      'cua.shot': `${s.width}×${s.height}`,
      'cua.control': t.control(this.cfg.control),
      'cua.idle': String(Math.round(this.cfg.userIdleMs / 100) / 10),
      'cua.permission': t.permission(this.level, this.cfg.grantMinutes),
    };
  }

  /** The environment prompt template of the model-text language. */
  private envPromptFile(): string {
    const file = ENV_PROMPT_FILES[this.language];
    return existsSync(file) ? file : ENV_PROMPT_FILES.zh;
  }

  console(language: Language = 'zh'): WorldConsoleDecl {
    return {
      label: language === 'en' ? 'Computer use' : '电脑操作',
      lamps: [{
        label: '操作引擎',
        state: this.engine ? 'online' : this.engineError ? 'error' : 'offline',
        hint: this.engineError ?? (this.engine ? `屏幕 ${this.screen?.width}×${this.screen?.height}` : '按需启动'),
      }],
      badges: [
        { label: '操作', value: this.cfg.control ? '允许' : '只看', tone: this.cfg.control ? 'on' : 'off' },
        { label: '询问', value: { 'ask-each-turn': '每轮', 'ask-before-acting': '动手前', 'ask-once': `${this.cfg.grantMinutes} 分钟一次`, 'never-ask': '不问' }[this.level], tone: 'plain' },
      ],
      config: [CUA_CONFIG_GROUP],
      promptDocs: [{
        key: `worlds.${CUA_ID}.envPrompt`,
        title: '电脑操作环境',
        description: '截图坐标、让位规则与操作边界。',
        path: this.envPromptFile(),
        role: 'envPrompt',
        vars: [
          { name: 'cua.os', description: '这台电脑的系统:Windows 或 Mac' },
          { name: 'cua.keys', description: '这个系统常用的快捷键' },
          { name: 'cua.shot', description: '截图尺寸' },
          { name: 'cua.control', description: '是否允许操作鼠标键盘' },
          { name: 'cua.idle', description: '让位时长(秒)' },
          { name: 'cua.permission', description: '什么时候先问使用者(按 permission 设置)' },
        ],
      }],
    };
  }
}
