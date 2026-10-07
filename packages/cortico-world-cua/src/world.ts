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
 */
import { fork, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Logger, ToolCallContext, ToolDef, ToolOutcome, World, WorldConsoleDecl, WorldHost } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { childExecArgv } from 'cortico/extensions/runtime.ts';
import { CUA_CONFIG_GROUP, CUA_ID, type CuaConfigSection, type PermissionLevel } from './config.ts';
import { CUA_TOOL_DECLS } from './tools.ts';
import { fit } from './engine/image.ts';
import { parseKeys } from './engine/keys.ts';
import type { Answer, Button, ChildToMain, EngineRequest, InputResult, MainToChild, ScreenInfo, ScreenshotResult, TypeResult, WindowEntry, Yield } from './engine-ipc.ts';

const ENGINE_FILE = fileURLToPath(new URL('./engine-child.ts', import.meta.url));
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));
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
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.fail(new Error('World 已停止')); }
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
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.fail(new Error(this.engineError ?? '引擎进程已退出')); this.pending.delete(id); }
    });
    return child;
  }

  /**
   * Sends one request to the engine. When `signal` aborts after the request went out, the engine
   * gets a cancel and the call still resolves with what the engine reports it did.
   */
  private async call<T>(req: EngineRequest, signal?: AbortSignal): Promise<T> {
    if (req.op !== 'info' && req.op !== 'confirm') await this.permit(req.op === 'screenshot' || req.op === 'windows' ? 'see' : 'act', signal);
    if (signal?.aborted) throw new Interrupted('收到打断时还没开始操作。');
    if (!this.engine) { this.engine = this.spawn(); this.engineError = null; }
    const id = ++this.seq;
    const engine = this.engine;
    return new Promise<T>((done, fail) => {
      const wait = 'yield' in req ? req.yield.maxWaitMs : req.op === 'confirm' ? req.timeoutMs : 0;
      const cancel = () => { if (engine.connected) engine.send({ cancel: id } satisfies MainToChild); };
      const unlisten = () => signal?.removeEventListener('abort', cancel);
      const timer = setTimeout(() => { this.pending.delete(id); unlisten(); fail(new Error('引擎没有在期限内应答')); }, ENGINE_TIMEOUT_MS + wait);
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
    if (answer === null) throw new Interrupted('收到打断时还在等使用者回答能不能用电脑。');
    if (answer === 'yes') {
      // ask-once: the yes holds for grantMinutes from now, and is asked for again once that runs out
      if (level === 'ask-once') { this.grantedUntil = Date.now() + this.cfg.grantMinutes * 60_000; this.permission = null; }
      return;
    }
    throw new NotPermitted(answer === 'timeout'
      ? `问了使用者能不能用电脑,${PERMISSION_TIMEOUT_MS / 1000} 秒没有回应,这一轮不能用。`
      : `使用者这一轮没有允许${level === 'ask-each-turn' ? '用电脑' : '动鼠标键盘'}。`);
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
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'x、y 要是数字';
    if (x < 0 || y < 0 || x >= size.width || y >= size.height) return `(${x}, ${y}) 不在截图范围内(0–${size.width - 1}, 0–${size.height - 1})`;
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
          if (err instanceof Interrupted) return { text: `[${decl.name} 没执行] ${err.message}` };
          if (err instanceof NotPermitted) return { text: `[${decl.name} 没执行] ${err.message}下一轮再用会重新询问。`, failed: true };
          return { text: `[${decl.name} 失败] ${(err as Error).message}`, failed: true };
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
    const text = `${lead}截图 ${shot.width}×${shot.height}(屏幕 ${shot.screen.width}×${shot.screen.height});鼠标在 ${this.toShot(shot.cursor)};前台窗口「${shot.foreground ?? '无'}」。`
      + (seen ? '' : '\n当前模型不接收图片,只能读到这段文字。');
    return { text, blobs: [{ bytes: shot.jpeg, mime: 'image/jpeg', name: 'screen.jpg', fallbackText: `屏幕截图 ${shot.width}×${shot.height}` }] };
  }

  private refuseControl(tool: string): ToolOutcome | null {
    if (this.cfg.control) return null;
    return { text: `[${tool} 没执行] 这台电脑的设置只允许看,不允许操作鼠标键盘(worlds.cua.control 关着)。`, failed: true };
  }

  /** Shared tail of every input tool: yield report, optional settle + screenshot; an abort skips the screenshot. */
  private async after(tool: string, res: InputResult, signal: AbortSignal | undefined, done: string, args: Args): Promise<ToolOutcome> {
    if (res.yielded) {
      return { text: `[${tool} 没执行] 等了 ${Math.round(res.waitedMs / 1000)} 秒,用户一直在用鼠标或键盘,没有和用户抢着操作。`, failed: true };
    }
    if (res.cancelled) return { text: `[${tool} 没执行] 等用户停手 ${(res.waitedMs / 1000).toFixed(1)} 秒时收到打断,没有发出输入。` };
    const waited = res.waitedMs >= 300 ? `(先等用户停手 ${(res.waitedMs / 1000).toFixed(1)} 秒)` : '';
    const line = `${done}${waited}`;
    const plain = `${line} 鼠标在 ${this.toShot(res.cursor)};前台窗口「${res.foreground ?? '无'}」。`;
    const want = typeof args.screenshot === 'boolean' ? args.screenshot : this.cfg.screenshot.afterAction;
    if (!want) return { text: plain };
    await pause(this.cfg.screenshot.settleMs, signal);
    if (signal?.aborted) return { text: `${plain}收到打断,没有截图。` };
    return this.screenshot(`${line}\n`);
  }

  private async click(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_click');
    if (refused) return refused;
    const p = this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: `[cua_click 没执行] ${p}`, failed: true };
    const button = (args.button === 'right' || args.button === 'middle' ? args.button : 'left') as Button;
    const count = args.clicks === 2 || args.clicks === 3 ? args.clicks : 1;
    const res = await this.call<InputResult>({ op: 'click', ...p, button, count, yield: this.yieldCfg }, signal);
    const how = `${{ left: '左键', right: '右键', middle: '中键' }[button]}${{ 1: '单击', 2: '双击', 3: '三击' }[count]}`;
    return this.after('cua_click', res, signal, `已在 (${args.x}, ${args.y}) ${how}。`, args);
  }

  private async move(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_move');
    if (refused) return refused;
    const p = this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: `[cua_move 没执行] ${p}`, failed: true };
    const res = await this.call<InputResult>({ op: 'move', ...p, yield: this.yieldCfg }, signal);
    return this.after('cua_move', res, signal, `鼠标已移到 (${args.x}, ${args.y})。`, args);
  }

  private async drag(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_drag');
    if (refused) return refused;
    const from = Array.isArray(args.from) ? args.from : [];
    const to = Array.isArray(args.to) ? args.to : [];
    const a = this.toScreen(from[0], from[1]);
    const b = this.toScreen(to[0], to[1]);
    if (typeof a === 'string' || typeof b === 'string') return { text: `[cua_drag 没执行] ${typeof a === 'string' ? `起点${a}` : `终点${b}`}`, failed: true };
    const res = await this.call<InputResult>({ op: 'drag', x1: a.x, y1: a.y, x2: b.x, y2: b.y, yield: this.yieldCfg }, signal);
    return this.after('cua_drag', res, signal, `已从 (${from[0]}, ${from[1]}) 拖到 (${to[0]}, ${to[1]})。`, args);
  }

  private async scroll(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_scroll');
    if (refused) return refused;
    const p = this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: `[cua_scroll 没执行] ${p}`, failed: true };
    const clampN = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-30, Math.min(30, Math.round(v))) : 0);
    const down = clampN(args.down), right = clampN(args.right);
    if (!down && !right) return { text: '[cua_scroll 没执行] down 和 right 都是 0。', failed: true };
    const res = await this.call<InputResult>({ op: 'scroll', ...p, down, right, yield: this.yieldCfg }, signal);
    const parts = [down ? `${down > 0 ? '向下' : '向上'} ${Math.abs(down)} 格` : '', right ? `${right > 0 ? '向右' : '向左'} ${Math.abs(right)} 格` : ''].filter(Boolean);
    return this.after('cua_scroll', res, signal, `已在 (${args.x}, ${args.y}) 滚动${parts.join('、')}。`, args);
  }

  private async type(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_type');
    if (refused) return refused;
    const text = typeof args.text === 'string' ? args.text : '';
    if (!text) return { text: '[cua_type 没执行] text 是空的。', failed: true };
    const res = await this.call<TypeResult>({ op: 'type', text, chunkDelayMs: this.cfg.typeChunkDelayMs, yield: this.yieldCfg }, signal);
    const total = [...text].length;
    const done = res.stoppedBy === 'cancel' ? `只输入了 ${res.typed}/${total} 个字符:收到打断,停了下来。`
      : res.stoppedBy === 'user' ? `只输入了 ${res.typed}/${total} 个字符:用户开始操作,停了下来。`
        : `已输入 ${total} 个字符。`;
    return this.after('cua_type', res, signal, done, args);
  }

  private async key(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_key');
    if (refused) return refused;
    const spec = typeof args.keys === 'string' ? args.keys : '';
    const parsed = parseKeys(spec);
    if ('error' in parsed) return { text: `[cua_key 没执行] ${parsed.error}。`, failed: true };
    const res = await this.call<InputResult>({ op: 'key', chords: parsed.chords, yield: this.yieldCfg }, signal);
    return this.after('cua_key', res, signal, `已按 ${spec.trim()}。`, args);
  }

  private async listWindows(signal: AbortSignal | undefined): Promise<WindowEntry[]> {
    return this.call<WindowEntry[]>({ op: 'windows' }, signal);
  }

  private async windows(signal?: AbortSignal): Promise<ToolOutcome> {
    const list = await this.listWindows(signal);
    const s = this.shotSize();
    const screen = this.screen ?? { width: 0, height: 0 };
    const lines = list.map((w) => {
      const r = w.rect;
      const off = r.x + r.width <= 0 || r.y + r.height <= 0 || r.x >= screen.width || r.y >= screen.height;
      const where = w.minimized ? '最小化' : off ? '不在主屏幕' : `(${Math.round(r.x * s.scale)}, ${Math.round(r.y * s.scale)}) ${Math.round(r.width * s.scale)}×${Math.round(r.height * s.scale)}`;
      return `- ${w.handle}${w.foreground ? ' [前台]' : ''} 「${w.title}」 ${where}`;
    });
    return { text: `可见窗口 ${list.length} 个(位置用截图坐标,前面的在上层):\n${lines.join('\n')}` };
  }

  private async focus(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('cua_focus');
    if (refused) return refused;
    const key = typeof args.window === 'string' ? args.window.trim() : '';
    if (!key) return { text: '[cua_focus 没执行] window 是空的。', failed: true };
    const list = await this.listWindows(signal);
    const hit = list.find((w) => w.handle === key.toLowerCase()) ?? list.find((w) => w.title.includes(key)) ?? list.find((w) => w.title.toLowerCase().includes(key.toLowerCase()));
    if (!hit) return { text: `[cua_focus 没执行] 没有标题包含「${key}」的可见窗口。`, failed: true };
    const res = await this.call<InputResult & { focused: boolean }>({ op: 'focus', handle: hit.handle, yield: this.yieldCfg }, signal);
    const done = res.focused || res.foreground === hit.title ? `已把「${hit.title}」切到前台。` : `尝试切换到「${hit.title}」,系统没有让它到前台;现在前台是「${res.foreground ?? '无'}」。`;
    return this.after('cua_focus', res, signal, done, args);
  }

  /** Waiting asks nobody; the screenshot after it is taken only when looking needs no new question. */
  private async wait(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const seconds = typeof args.seconds === 'number' && Number.isFinite(args.seconds) ? Math.max(0, Math.min(30, args.seconds)) : 1;
    const waitedMs = await pause(seconds * 1000, signal);
    if (signal?.aborted) return { text: `等了 ${(waitedMs / 1000).toFixed(1)}/${seconds} 秒时收到打断,没有截图。` };
    const look = await this.mayLook(signal);
    if (signal?.aborted) return { text: `等了 ${seconds} 秒。收到打断,没有截图。` };
    if (!look) return { text: `等了 ${seconds} 秒。这一轮使用者还没允许看屏幕,所以没有截图;要看就用 cua_screenshot,会先问使用者。` };
    return this.screenshot(`等了 ${seconds} 秒。\n`);
  }

  /** Looking at the screen now would not ask the person: the level lets it, or this turn's answer was yes. */
  private async mayLook(signal: AbortSignal | undefined): Promise<boolean> {
    if (this.level !== 'ask-each-turn') return true;
    return this.permission !== null && await untilAborted(this.permission, signal) === 'yes';
  }

  /* ---------- prompt & console ---------- */

  envPromptVars(): Record<string, string> {
    const s = this.shotSize();
    return {
      'cua.os': process.platform === 'darwin' ? 'Mac' : process.platform === 'linux' ? 'Linux' : 'Windows',
      'cua.keys': process.platform === 'darwin' ? '这是 Mac:复制粘贴、全选、保存用 cmd(cmd+c、cmd+v、cmd+a、cmd+s),切换应用用 cmd+tab。' : '复制粘贴、全选、保存用 ctrl(ctrl+c、ctrl+v、ctrl+a、ctrl+s),切换窗口用 alt+tab。',
      'cua.shot': `${s.width}×${s.height}`,
      'cua.control': this.cfg.control ? '允许操作鼠标和键盘' : '只允许截图和列窗口,不能操作鼠标键盘',
      'cua.idle': String(Math.round(this.cfg.userIdleMs / 100) / 10),
      'cua.permission': {
        'ask-each-turn': '每一轮第一次截图或操作之前,使用者会被问一次能不能用电脑。使用者没同意,这一轮的电脑操作工具都不执行;不要换别的工具绕过去,等使用者开口。',
        'ask-before-acting': '截图和列窗口不用先问。每一轮第一次动鼠标或键盘之前,使用者会被问一次;使用者没同意,这一轮的输入工具都不执行,截图照常;不要换别的工具绕过去,等使用者开口。',
        'ask-once': `截图和列窗口不用先问。动鼠标或键盘之前会问使用者一次,同意后 ${this.cfg.grantMinutes} 分钟内不再问;使用者没同意,这一轮的输入工具都不执行,截图照常;不要换别的工具绕过去,等使用者开口。`,
        'never-ask': '看屏幕和动鼠标键盘都不用先问使用者,工具直接执行。',
      }[this.level],
    };
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
        path: ENV_PROMPT_FILE,
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
