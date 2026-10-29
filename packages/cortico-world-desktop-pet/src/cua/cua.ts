/**
 * Computer use, a part of the desktop-pet World while `cua.enabled` is on. Tools take screenshots, move and click the mouse,
 * scroll, type, press keys, list and focus windows. All operating-system calls run in an
 * engine child process (`engine-child.ts`). A crash or an unanswered request past its deadline
 * fails that engine's calls; a timed-out engine is killed and the next call starts a fresh one.
 *
 * A screenshot shows one display, scaled to fit `screenshot.maxWidth`×`maxHeight`; tool coordinates
 * are pixels of the latest screenshot and are mapped back to physical pixels of its display here.
 * An input aimed at an arrangement of displays that has changed since that screenshot is refused
 * by the engine. Input tools first wait for the user to leave mouse and keyboard alone
 * (`userIdleMs`), up to `maxYieldWaitMs`, and fail without acting if the user keeps going.
 *
 * `permission` sets when the person is asked first (config.ts, PERMISSION_LEVELS): at most once
 * a turn, before the first call that reads the screen or before the first input, or once for
 * `grantMinutes`, or never. The question goes through `askPermission` (the pet's bubble), or through a
 * system dialog while the pet page cannot ask. A refusal stands until the turn ends. Working in a
 * terminal (terminal.ts) is asked about on its own after that, at every level, and a yes holds for
 * `grantMinutes`; with `skipTerminalAsk` on it is asked about only as `permission` says.
 *
 * Every tool is interruptible. When the call's signal aborts, the tool stops at the next point
 * where no input is left half-done and its receipt says what it did: a call waiting for the
 * person's answer returns without acting (the question stays open for the turn), the engine ends
 * its wait for the user with nothing sent or stops typing between chunks, `pet_cua_wait` ends its
 * wait, and an action already sent skips the settle and the screenshot after it.
 *
 * Receipts and the environment prompt's computer-use part are in the model-text language (`model-text.ts`).
 */
import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Logger, ToolCallContext, ToolDef, ToolOutcome, WorldHost, WorldLamp } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { renderTemplate } from 'cortico/core/template.ts';
import { readTextFile } from 'cortico/core/util.ts';
import { childExecArgv } from 'cortico/extensions/runtime.ts';
import type { CuaConfig, PermissionLevel } from './config.ts';
import { cuaText, type CuaText } from './i18n/index.ts';
import { CUA_TOOL_DECLS } from './tools.ts';
import { isTerminal, opensRunBox } from './terminal.ts';
import { fit } from './engine/image.ts';
import { parseKeys } from './engine/keys.ts';
import { MODEL_TEXT, type ModelLanguage, type ModelText } from './model-text.ts';
import type { Answer, Button, ChildToMain, EngineRequest, InputResult, MainToChild, ScreenInfo, ScreenshotResult, Target, TypeResult, WindowEntry, Yield, ZoomResult } from './engine-ipc.ts';

const ENGINE_FILE = fileURLToPath(new URL('./engine-child.ts', import.meta.url));
/** The computer-use part of the environment prompt, for each model-text language; English falls back to Chinese while its file is missing. */
const ENV_PROMPT_FILES: Record<ModelLanguage, string> = {
  zh: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
  en: fileURLToPath(new URL('./ENV_PROMPT.en.md', import.meta.url)),
};
const ENGINE_TIMEOUT_MS = 30_000;
/** How long a permission question waits for the person. */
const PERMISSION_TIMEOUT_MS = 60_000;

export interface CuaOptions {
  /** The live `worlds.desktop-pet.cua` section, read at each use. */
  cfg: () => CuaConfig;
  /** Names the bot in the permission question; read at each question. */
  botName?: () => string;
  /**
   * Asks the person whether the bot may use the computer this turn, with the two buttons' words.
   * null: this way of asking is not available right now, and the system dialog asks instead.
   */
  askPermission?: (question: string, choices: [yes: string, no: string]) => Promise<Answer | null>;
  /** The language of what the bot reads from this World, read at each use; Chinese when absent. */
  modelLanguage?: () => ModelLanguage;
  /** The app language: the permission question and the system dialog's words. Read at each use; `zh` when absent. */
  language?: () => Language;
}

/** The person did not allow this turn's computer use. */
class NotPermitted extends Error {}

/** The call's signal aborted before it did anything. */
class Interrupted extends Error {}

type Args = Record<string, unknown>;

/** A screenshot's display, the arrangement it was taken in, and its size. */
interface View extends Target {
  width: number;
  height: number;
  /** Screenshot pixels per physical pixel of the display. */
  scale: number;
}

/** The display part of an engine result. */
const screenOf = (r: ScreenInfo): ScreenInfo => ({ displays: r.displays, layout: r.layout, cursor: r.cursor, foreground: r.foreground, foregroundApp: r.foregroundApp ?? null, foregroundDisplay: r.foregroundDisplay });

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

export class Cua {
  private host: WorldHost | null = null;
  private log: Logger | null = null;
  private engine: ChildProcess | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { engine: ChildProcess; done: (v: unknown) => void; fail: (e: Error) => void; timer: NodeJS.Timeout }>();
  /** The displays as the engine last reported them. */
  private screen: ScreenInfo | null = null;
  /** The latest screenshot; coordinates refer to it. */
  private view: View | null = null;
  /** The exit code of an engine that exited with an error, until the next one starts. */
  private engineExit: number | null = null;
  /** This turn's answer, asked on first use; cleared when the turn ends. */
  private permission: Promise<Answer> | null = null;
  /** ask-once: a yes holds until then (ms since epoch). */
  private grantedUntil = 0;
  /** The answer to working in a terminal while it is open, or a refusal until the turn ends. */
  private terminalPermission: Promise<Answer> | null = null;
  /** A yes to working in a terminal holds until then (ms since epoch). */
  private terminalGrantedUntil = 0;
  /** The screen size asked of the engine, once per engine start. */
  private screenAsked: Promise<void> | null = null;

  constructor(private readonly opts: CuaOptions) {}

  private get cfg(): CuaConfig {
    return this.opts.cfg();
  }

  /** Why computer use cannot run on this system, in the app language; null when it can. */
  unsupported(): string | null {
    const t = this.ui.preflight;
    if (!['win32', 'darwin', 'linux'].includes(process.platform)) return t.unsupported;
    if (process.platform === 'linux' && !process.env.DISPLAY) return t.noDisplay;
    return null;
  }

  /** The language of what the bot reads from this World. */
  private get language(): ModelLanguage {
    return this.opts.modelLanguage?.() ?? 'zh';
  }

  /** The text table of that language. */
  private get t(): ModelText {
    return MODEL_TEXT[this.language];
  }

  /** The text table of the app language. */
  private get ui(): CuaText {
    return cuaText(this.opts.language?.());
  }

  onTurnEnded(): void {
    this.permission = null;
    this.terminalPermission = null;
  }

  start(host: WorldHost): void {
    this.host = host;
    this.log = host.log.child('cua');
  }

  /** Starts the engine and reads the displays, once; the environment prompt and coordinates need them. */
  ready(): Promise<void> {
    this.screenAsked ??= this.call<ScreenInfo>({ op: 'info' }).then(
      (info) => { this.screen = screenOf(info); },
      (err) => { this.screenAsked = null; this.log?.warn('电脑操作引擎没有给出屏幕尺寸', { error: String(err) }); },
    );
    return this.screenAsked;
  }

  async stop(): Promise<void> {
    await this.endEngine(this.t.worldStopped);
    this.host = null;
  }

  /** Computer use was switched off: the engine process ends, and the next call starts another. */
  switchedOff(): Promise<void> {
    return this.endEngine(this.t.switchedOff);
  }

  /** Ends the engine process; calls waiting on it fail with `why`. */
  private async endEngine(why: string): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.fail(new Error(why)); }
    this.pending.clear();
    this.screenAsked = null;
    if (engine && engine.exitCode === null) {
      const exited = new Promise<void>((r) => engine.once('exit', () => r()));
      engine.disconnect();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
      if (engine.exitCode === null) engine.kill();
    }
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
      if (!p || p.engine !== child) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.done(msg.value);
      else p.fail(new Error(msg.code ? this.t.engineErrors[msg.code](...msg.args ?? []) : msg.error));
    });
    child.on('exit', (code) => {
      if (this.engine === child) {
        this.engine = null;
        this.engineExit = code === 0 ? null : code;
        this.screenAsked = null;
      }
      const why = this.t.engineExited(code === 0 ? undefined : code);
      for (const [id, p] of this.pending) if (p.engine === child) { clearTimeout(p.timer); p.fail(new Error(why)); this.pending.delete(id); }
    });
    return child;
  }

  /**
   * Sends one request to the engine. When `signal` aborts after the request went out, the engine
   * gets a cancel and the call still resolves with what the engine reports it did.
   */
  private async call<T>(req: EngineRequest, signal?: AbortSignal): Promise<T> {
    if (req.op !== 'info' && req.op !== 'confirm') await this.permit(req.op === 'screenshot' || req.op === 'zoom' || req.op === 'windows' ? 'see' : 'act', signal);
    if (signal?.aborted) throw new Interrupted(this.t.interruptedBeforeAct);
    if (!this.engine) { this.engine = this.spawn(); this.engineExit = null; }
    const id = ++this.seq;
    const engine = this.engine;
    return new Promise<T>((done, fail) => {
      const wait = 'yield' in req ? req.yield.maxWaitMs : req.op === 'confirm' ? req.timeoutMs : 0;
      const cancel = () => { if (engine.connected) engine.send({ cancel: id } satisfies MainToChild); };
      const unlisten = () => signal?.removeEventListener('abort', cancel);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        unlisten();
        fail(new Error(this.t.engineTimeout));
        if (this.engine === engine) {
          this.engine = null;
          this.screenAsked = null;
          engine.kill('SIGKILL');
        }
      }, ENGINE_TIMEOUT_MS + wait);
      this.pending.set(id, { engine, done: (v) => { unlisten(); done(v as T); }, fail: (e) => { unlisten(); fail(e); }, timer });
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
    const who = this.who;
    const a = this.ui.ask;
    return this.ask(level === 'ask-each-turn' ? a.eachTurn(who) : level === 'ask-once' ? a.once(who, this.cfg.grantMinutes) : a.acting(who));
  }

  private get who(): string {
    return this.opts.botName?.() || 'bot';
  }

  private async ask(question: string): Promise<Answer> {
    const a = this.ui.ask;
    const viaApp = await this.opts.askPermission?.(question, [a.yes, a.no]) ?? null;
    if (viaApp) return viaApp;
    return this.call<Answer>({ op: 'confirm', text: question, caption: a.caption, yes: a.yes, no: a.no, timeoutMs: PERMISSION_TIMEOUT_MS });
  }

  /**
   * Before a step that works in a terminal: `question` gets the foreground window as the engine sees
   * it now and returns the question, or null when the step does not work in a terminal there.
   */
  private async permitTerminal(signal: AbortSignal | undefined, question: (window: string, terminal: boolean) => string | null): Promise<void> {
    await this.permit('act', signal);
    if (this.cfg.skipTerminalAsk) return;
    const info = await this.call<ScreenInfo>({ op: 'info' }, signal);
    this.screen = screenOf(info);
    if (Date.now() < this.terminalGrantedUntil) return;
    const q = question(info.foreground ?? info.foregroundApp ?? '', isTerminal(info.foregroundApp));
    if (!q) return;
    this.terminalPermission ??= this.ask(q);
    const answer = await untilAborted(this.terminalPermission, signal);
    if (answer === null) throw new Interrupted(this.t.interruptedAsking);
    if (answer === 'yes') {
      this.terminalGrantedUntil = Date.now() + this.cfg.grantMinutes * 60_000;
      this.terminalPermission = null;
      return;
    }
    throw new NotPermitted(answer === 'timeout' ? this.t.askTimedOut(PERMISSION_TIMEOUT_MS / 1000) : this.t.terminalRefused);
  }

  /* ---------- coordinates ---------- */

  /** The display a screenshot without `display` shows before the first one: the foreground window's, else the primary. */
  private defaultDisplay(): number {
    const s = this.screen;
    return s?.foregroundDisplay ?? s?.displays.find((d) => d.primary)?.index ?? 1;
  }

  /** The latest screenshot, or what one of the default display would be before the first. */
  private shotSize(): View {
    if (this.view) return this.view;
    const n = this.defaultDisplay();
    const d = this.screen?.displays.find((x) => x.index === n) ?? { width: 1920, height: 1080 };
    return { display: n, layout: this.screen?.layout ?? '', ...fit(d.width, d.height, this.cfg.screenshot.maxWidth, this.cfg.screenshot.maxHeight) };
  }

  /**
   * Screenshot pixel → physical pixel of the screenshot's display, or a reason the point is off the
   * screenshot. No screenshot is larger than `maxWidth`×`maxHeight`, so a point outside that is refused
   * before the engine starts.
   */
  private async toScreen(x: unknown, y: unknown): Promise<{ at: Target; x: number; y: number } | string> {
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return this.t.notNumbers;
    const bound = this.view ?? { width: this.cfg.screenshot.maxWidth, height: this.cfg.screenshot.maxHeight };
    if (x < 0 || y < 0 || x >= bound.width || y >= bound.height) return this.t.offShot(x, y, bound.width - 1, bound.height - 1);
    if (!this.view) await this.ready();
    const v = this.shotSize();
    if (x >= v.width || y >= v.height) return this.t.offShot(x, y, v.width - 1, v.height - 1);
    const display = this.screen?.displays.find((d) => d.index === v.display);
    const width = display?.width ?? Math.round(v.width / v.scale);
    const height = display?.height ?? Math.round(v.height / v.scale);
    return { at: { display: v.display, layout: v.layout }, x: Math.min(width - 1, Math.round(x / v.scale)), y: Math.min(height - 1, Math.round(y / v.scale)) };
  }

  /** Where the pointer is, said against the latest screenshot. */
  private cursorText(c: ScreenInfo['cursor']): string {
    const t = this.t, v = this.shotSize();
    if (!c) return t.cursorNowhere;
    if (c.display !== v.display) return t.cursorOn(c.display);
    return t.cursorAt(`(${Math.round(c.x * v.scale)}, ${Math.round(c.y * v.scale)})`);
  }

  /* ---------- tools ---------- */

  tools(): ToolDef[] {
    const handlers: Record<string, (args: Args, signal?: AbortSignal) => Promise<ToolOutcome>> = {
      pet_cua_screenshot: (a, s) => this.screenshotTool(a, s),
      pet_cua_zoom: (a, s) => this.zoom(a, s),
      pet_cua_click: (a, s) => this.click(a, s),
      pet_cua_move: (a, s) => this.move(a, s),
      pet_cua_drag: (a, s) => this.drag(a, s),
      pet_cua_scroll: (a, s) => this.scroll(a, s),
      pet_cua_type: (a, s) => this.type(a, s),
      pet_cua_key: (a, s) => this.key(a, s),
      pet_cua_windows: (_, s) => this.windows(s),
      pet_cua_focus: (a, s) => this.focus(a, s),
      pet_cua_wait: (a, s) => this.wait(a, s),
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

  /** `pet_cua_screenshot`: the display asked for, checked against the displays known. */
  private async screenshotTool(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const n = args.display;
    if (n !== undefined && n !== null) {
      const total = this.screen?.displays.length;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || (total !== undefined && n > total)) {
        return { text: this.t.notRun('pet_cua_screenshot', this.t.displayBad(n, total ?? 1)), failed: true };
      }
      return this.screenshot('', signal, n);
    }
    return this.screenshot('', signal);
  }

  /**
   * A screenshot of display `display`, else the one looked at last, else the default. `signal`
   * reaches only the permission question; once the capture is requested it completes.
   */
  async screenshot(lead: string, signal?: AbortSignal, display?: number): Promise<ToolOutcome> {
    const { maxWidth, maxHeight, quality } = this.cfg.screenshot;
    const shot = await this.call<ScreenshotResult>({ op: 'screenshot', display: display ?? this.view?.display ?? null, maxWidth, maxHeight, quality }, signal);
    this.screen = screenOf(shot);
    this.view = { display: shot.display, layout: shot.layout, width: shot.width, height: shot.height, scale: shot.scale };
    const seen = this.host?.modelFacts.accepts('image/jpeg') ?? true;
    const t = this.t;
    const here = shot.displays.find((d) => d.index === shot.display)!;
    const others = shot.displays.filter((d) => d !== here);
    const view = others.length
      ? t.viewOf(here.index, shot.displays.length, here.width, here.height, here.primary, others.map((d) => t.displayBrief(d.index, d.width, d.height, d.primary)).join(t.listSep))
      : t.viewOne(here.width, here.height);
    const text = t.screenshot(lead, shot.width, shot.height, view, this.cursorText(shot.cursor), shot.foreground, seen);
    return { text, blobs: [{ bytes: shot.jpeg, mime: 'image/jpeg', name: 'screen.jpg', fallbackText: t.screenshotFallback(shot.width, shot.height) }] };
  }

  /** `pet_cua_zoom`: a region of the latest screenshot, captured again from the screen and scaled down only past the screenshot size limit. */
  private async zoom(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const t = this.t, v = this.view;
    if (!v) return { text: t.notRun('pet_cua_zoom', t.zoomNoShot), failed: true };
    const { x, y, width, height } = args;
    const ok = [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!ok || (x as number) < 0 || (y as number) < 0 || (x as number) >= v.width || (y as number) >= v.height || (width as number) < 1 || (height as number) < 1) {
      return { text: t.notRun('pet_cua_zoom', t.zoomBad), failed: true };
    }
    const rx = Math.min(v.width - 1, Math.round(x as number)), ry = Math.min(v.height - 1, Math.round(y as number));
    const rw = Math.min(v.width - rx, Math.round(width as number)), rh = Math.min(v.height - ry, Math.round(height as number));
    const { maxWidth, maxHeight, quality } = this.cfg.screenshot;
    const res = await this.call<ZoomResult>({
      op: 'zoom', at: { display: v.display, layout: v.layout },
      x: rx / v.scale, y: ry / v.scale, width: rw / v.scale, height: rh / v.scale, maxWidth, maxHeight, quality,
    }, signal);
    return {
      text: t.zoomed(res.width, res.height, rx, ry, rw, rh),
      blobs: [{ bytes: res.jpeg, mime: 'image/jpeg', name: 'zoom.jpg', fallbackText: t.zoomFallback(res.width, res.height) }],
    };
  }

  private refuseControl(tool: string): ToolOutcome | null {
    if (this.cfg.control) return null;
    return { text: this.t.notRun(tool, this.t.viewOnly), failed: true };
  }

  /**
   * Shared tail of every input tool: the yield report, then after the settle either a screenshot or the
   * pointer and foreground window as they stand by then, since a window or dialog an action opens takes
   * a moment to come forward. The screenshot shows `display`, else the display the foreground window is on
   * when the action brought another window forward or moved it to another display, else the one looked at
   * last. An abort skips the settle.
   */
  private async after(tool: string, res: InputResult, signal: AbortSignal | undefined, done: string, args: Args, display?: number): Promise<ToolOutcome> {
    const t = this.t;
    const before = { title: this.screen?.foreground ?? null, display: this.screen?.foregroundDisplay ?? null };
    this.screen = screenOf(res);
    if (res.yielded) return { text: t.notRun(tool, t.yielded(Math.round(res.waitedMs / 1000))), failed: true };
    if (res.cancelled) return { text: t.notRun(tool, t.cancelledWaiting((res.waitedMs / 1000).toFixed(1))) };
    const line = `${done}${res.waitedMs >= 300 ? t.waitedFirst((res.waitedMs / 1000).toFixed(1)) : ''}`;
    const said = (s: ScreenInfo) => `${t.after(line, this.cursorText(s.cursor), s.foreground)}${s.foreground ? '' : t.noForeground}`;
    const want = typeof args.screenshot === 'boolean' ? args.screenshot : this.cfg.screenshot.afterAction;
    await pause(this.cfg.screenshot.settleMs, signal);
    if (signal?.aborted) return { text: `${said(res)}${want ? t.noShotInterrupted : ''}` };
    const now = await this.call<ScreenInfo>({ op: 'info' }).then(screenOf, () => screenOf(res));
    this.screen = now;
    if (!want) return { text: said(now) };
    const moved = (now.foreground !== before.title || now.foregroundDisplay !== before.display) && now.foregroundDisplay !== null && now.foregroundDisplay !== this.shotSize().display;
    return this.screenshot(`${line}\n`, undefined, display ?? (moved ? now.foregroundDisplay! : undefined));
  }

  private async click(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_click');
    if (refused) return refused;
    const p = await this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: this.t.notRun('pet_cua_click', p), failed: true };
    const button = (args.button === 'right' || args.button === 'middle' ? args.button : 'left') as Button;
    const count = args.clicks === 2 || args.clicks === 3 ? args.clicks : 1;
    const res = await this.call<InputResult>({ op: 'click', ...p, button, count, yield: this.yieldCfg }, signal);
    return this.after('pet_cua_click', res, signal, this.t.clicked(args.x, args.y, button, count), args);
  }

  private async move(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_move');
    if (refused) return refused;
    const p = await this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: this.t.notRun('pet_cua_move', p), failed: true };
    const res = await this.call<InputResult>({ op: 'move', ...p, yield: this.yieldCfg }, signal);
    return this.after('pet_cua_move', res, signal, this.t.moved(args.x, args.y), args);
  }

  private async drag(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_drag');
    if (refused) return refused;
    const from = Array.isArray(args.from) ? args.from : [];
    const to = Array.isArray(args.to) ? args.to : [];
    const a = await this.toScreen(from[0], from[1]);
    const b = await this.toScreen(to[0], to[1]);
    if (typeof a === 'string' || typeof b === 'string') return { text: this.t.notRun('pet_cua_drag', typeof a === 'string' ? this.t.dragStart(a) : this.t.dragEnd(b as string)), failed: true };
    const res = await this.call<InputResult>({ op: 'drag', at: a.at, x1: a.x, y1: a.y, x2: b.x, y2: b.y, yield: this.yieldCfg }, signal);
    return this.after('pet_cua_drag', res, signal, this.t.dragged(from, to), args);
  }

  private async scroll(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_scroll');
    if (refused) return refused;
    const p = await this.toScreen(args.x, args.y);
    if (typeof p === 'string') return { text: this.t.notRun('pet_cua_scroll', p), failed: true };
    const clampN = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-30, Math.min(30, Math.round(v))) : 0);
    const down = clampN(args.down), right = clampN(args.right);
    if (!down && !right) return { text: this.t.notRun('pet_cua_scroll', this.t.scrollNone), failed: true };
    const res = await this.call<InputResult>({ op: 'scroll', ...p, down, right, yield: this.yieldCfg }, signal);
    return this.after('pet_cua_scroll', res, signal, this.t.scrolled(args.x, args.y, down, right), args);
  }

  private async type(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_type');
    if (refused) return refused;
    const text = typeof args.text === 'string' ? args.text : '';
    if (!text) return { text: this.t.notRun('pet_cua_type', this.t.typeEmpty), failed: true };
    const minutes = this.cfg.grantMinutes;
    await this.permitTerminal(signal, (window, terminal) => (terminal ? this.ui.ask.terminal.type(this.who, window, text, minutes) : null));
    const res = await this.call<TypeResult>({ op: 'type', text, chunkDelayMs: this.cfg.typeChunkDelayMs, yield: this.yieldCfg }, signal);
    const total = [...text].length;
    const done = res.stoppedBy === 'cancel' || res.stoppedBy === 'user' ? this.t.typedPart(res.typed, total, res.stoppedBy) : this.t.typed(total);
    return this.after('pet_cua_type', res, signal, done, args);
  }

  private async key(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_key');
    if (refused) return refused;
    const spec = typeof args.keys === 'string' ? args.keys : '';
    const parsed = parseKeys(spec, this.language);
    if ('error' in parsed) return { text: this.t.notRun('pet_cua_key', this.t.keyBad(parsed.error)), failed: true };
    const keys = spec.trim(), minutes = this.cfg.grantMinutes, ask = this.ui.ask.terminal;
    await this.permitTerminal(signal, (window, terminal) => (opensRunBox(parsed.chords, process.platform) ? ask.runBox(this.who, keys, minutes)
      : terminal ? ask.key(this.who, window, keys, minutes) : null));
    const res = await this.call<InputResult>({ op: 'key', chords: parsed.chords, yield: this.yieldCfg }, signal);
    return this.after('pet_cua_key', res, signal, this.t.pressed(spec.trim()), args);
  }

  private async listWindows(signal: AbortSignal | undefined): Promise<WindowEntry[]> {
    return this.call<WindowEntry[]>({ op: 'windows' }, signal);
  }

  private async windows(signal?: AbortSignal): Promise<ToolOutcome> {
    const list = await this.listWindows(signal);
    await this.ready();
    const t = this.t;
    const s = this.shotSize();
    const lines = list.map((w) => {
      const r = w.rect;
      const where = w.minimized ? t.minimized : w.display === null ? t.offScreen : w.display !== s.display ? t.onDisplay(w.display)
        : `(${Math.round(r.x * s.scale)}, ${Math.round(r.y * s.scale)}) ${Math.round(r.width * s.scale)}×${Math.round(r.height * s.scale)}`;
      return t.windowLine(w.handle, w.foreground, w.title, where);
    });
    return { text: t.windows(list.length, lines) };
  }

  private async focus(args: Args, signal?: AbortSignal): Promise<ToolOutcome> {
    const refused = this.refuseControl('pet_cua_focus');
    if (refused) return refused;
    const key = typeof args.window === 'string' ? args.window.trim() : '';
    if (!key) return { text: this.t.notRun('pet_cua_focus', this.t.focusEmpty), failed: true };
    const list = await this.listWindows(signal);
    const hit = list.find((w) => w.handle === key.toLowerCase()) ?? list.find((w) => w.title.includes(key)) ?? list.find((w) => w.title.toLowerCase().includes(key.toLowerCase()));
    if (!hit) return { text: this.t.notRun('pet_cua_focus', this.t.focusMissing(key)), failed: true };
    const res = await this.call<InputResult & { focused: boolean }>({ op: 'focus', handle: hit.handle, yield: this.yieldCfg }, signal);
    const ok = res.focused || res.foreground === hit.title;
    // a window on another display is what the screenshot after focusing should show
    const elsewhere = ok && hit.display !== null && hit.display !== this.shotSize().display ? hit.display : undefined;
    const done = ok ? this.t.focused(hit.title) : this.t.focusRefused(hit.title, res.foreground);
    const shows = typeof args.screenshot === 'boolean' ? args.screenshot : this.cfg.screenshot.afterAction;
    return this.after('pet_cua_focus', res, signal, elsewhere !== undefined && !shows ? `${done}${this.t.focusedElsewhere(elsewhere)}` : done, args, elsewhere);
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

  /** The computer-use part of the environment prompt, its template filled in. */
  async envPrompt(): Promise<string> {
    await this.ready();
    const t = this.t;
    const displays = this.screen?.displays ?? [];
    const vars = {
      'cua.os': process.platform === 'darwin' ? 'Mac' : process.platform === 'linux' ? 'Linux' : 'Windows',
      'cua.keys': process.platform === 'darwin' ? t.keysMac : t.keysOther,
      'cua.shot': `${this.cfg.screenshot.maxWidth}×${this.cfg.screenshot.maxHeight}`,
      'cua.displays': displays.length > 1 ? t.displays(displays.length, displays.map((d) => t.displayBrief(d.index, d.width, d.height, d.primary)).join(t.listSep)) : '',
      'cua.control': t.control(this.cfg.control),
      'cua.idle': String(Math.round(this.cfg.userIdleMs / 100) / 10),
      'cua.permission': t.permission(this.level, this.cfg.grantMinutes),
      'cua.terminal': this.cfg.skipTerminalAsk ? t.terminalSkipped : t.terminal(this.cfg.grantMinutes),
    };
    return renderTemplate(readTextFile(this.envPromptFile()), vars).trim();
  }

  /** The environment prompt template of the model-text language. */
  private envPromptFile(): string {
    const file = ENV_PROMPT_FILES[this.language];
    return existsSync(file) ? file : ENV_PROMPT_FILES.zh;
  }

  /** The displays' sizes for the lamp. */
  private displaysHint(c: CuaText['console']): string {
    return (this.screen?.displays ?? []).map((d) => c.screen(d.width, d.height)).join(' · ') || c.screen(0, 0);
  }

  /** The engine's lamp on the desktop-pet World page, in `language`. */
  lamp(language: Language = 'zh'): WorldLamp {
    const c = cuaText(language).console;
    const unsupported = this.unsupported();
    if (unsupported) return { label: c.engine, state: 'error', hint: unsupported };
    const level = this.level;
    const asking = level === 'ask-once' ? c.levels['ask-once'](this.cfg.grantMinutes) : c.levels[level];
    const how = `${this.cfg.control ? c.allowed : c.viewOnly} · ${c.asking}: ${asking}`;
    return {
      label: c.engine,
      state: this.engine ? 'online' : this.engineExit !== null ? 'error' : 'offline',
      hint: this.engineExit !== null ? c.exited(this.engineExit) : `${this.engine ? this.displaysHint(c) : c.onDemand} · ${how}`,
    };
  }
}
