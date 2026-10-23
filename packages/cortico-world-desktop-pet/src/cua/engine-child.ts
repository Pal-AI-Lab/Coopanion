/**
 * Engine child process: owns every call into the operating system so a native fault takes
 * down this process, not the bot's. Imports no `cortico/*`.
 *
 * Yielding to the user: before sending input, the engine waits until the user has been idle
 * for `yield.idleMs`. User activity is input newer than the engine's own last injection
 * (GetLastInputInfo) or the pointer found away from where the engine left it. Typing checks
 * again between chunks and stops as soon as the user moves in.
 *
 * Displays are numbered from 1, left to right and then top to bottom; positions in requests and
 * results are physical pixels of one display, and the global coordinates of each platform stay in
 * here (engine/display.ts). An input request names the arrangement it was aimed at and fails when the
 * displays have changed since.
 *
 * A `cancel` message is honoured at the same points: the wait for the user ends with nothing
 * sent, and typing stops between chunks of whole graphemes. A click, drag, scroll, key sequence
 * or focus that has started is sent in full, so no button or key is left held.
 */
import type { ChildToMain, EngineRequest, InputResult, MainToChild, ScreenInfo, ScreenshotResult, Target, TypeResult, WindowEntry, Yield, ZoomResult } from './engine-ipc.ts';
// the operating system's own calls: Win32 on Windows, CoreGraphics and AppleScript on macOS, X11 on Linux
const os: typeof import('./engine/win32.ts') = process.platform === 'darwin' ? await import('./engine/darwin.ts')
  : process.platform === 'linux' ? await import('./engine/linux.ts') : await import('./engine/win32.ts');
import { downscale, drawCursor, encodeJpeg, fit } from './engine/image.ts';
import { EngineFailure } from './engine/fail.ts';
import { crop, displayAt, layoutOf, ordered, physicalSize, toLocal, toNative, type NativeDisplay } from './engine/display.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const since = (now: number, then: number) => (now - then) >>> 0;

let ownTick = 0;
let ownCursor: { x: number; y: number } | null = null;
let movedAt = 0;

function markOwn(): void {
  ownTick = os.tick();
  ownCursor = os.cursor();
  movedAt = 0;
}

/** Milliseconds since the user's last input; Infinity when none is on record. */
function userIdleMs(): number {
  const now = os.tick();
  const cur = os.cursor();
  if (ownCursor && (Math.abs(cur.x - ownCursor.x) > 2 || Math.abs(cur.y - ownCursor.y) > 2)) {
    ownCursor = cur;
    movedAt = now;
  }
  const last = os.lastInputTick();
  // ticks wrap at 2^32: a forward distance below 2^31 means `last` is later than `ownTick`
  const afterOwn = ownTick === 0 || (since(last, ownTick) > 40 && since(last, ownTick) < 0x80000000);
  let userAt = afterOwn ? last : 0;
  if (movedAt && (!userAt || since(movedAt, userAt) < 0x80000000)) userAt = movedAt;
  return userAt ? since(now, userAt) : Infinity;
}

/** Whether a cancel has arrived for the request being handled. */
type Cancelled = () => boolean;

async function waitIdle(y: Yield, cancelled: Cancelled): Promise<{ yielded: boolean; cancelled: boolean; waitedMs: number }> {
  const start = Date.now();
  for (;;) {
    if (cancelled()) return { yielded: false, cancelled: true, waitedMs: Date.now() - start };
    if (userIdleMs() >= y.idleMs) return { yielded: false, cancelled: false, waitedMs: Date.now() - start };
    if (Date.now() - start >= y.maxWaitMs) return { yielded: true, cancelled: false, waitedMs: Date.now() - start };
    await sleep(100);
  }
}

/** The displays as they are now, in the order they are numbered. */
function current(): { list: NativeDisplay[]; layout: string } {
  const list = ordered(os.displays());
  return { list, layout: layoutOf(list) };
}

/** 1-based number of the display holding a global point, null when none does. */
const numberAt = (list: NativeDisplay[], x: number, y: number) => {
  const i = displayAt(list, x, y);
  return i < 0 ? null : i + 1;
};

function info(): ScreenInfo {
  const { list, layout } = current();
  const fg = os.windows().find((w) => w.foreground);
  const c = os.cursor();
  const on = numberAt(list, c.x, c.y);
  return {
    displays: list.map((d, i) => ({ index: i + 1, primary: d.primary, ...physicalSize(d) })),
    layout,
    cursor: on === null ? null : { display: on, ...toLocal(list[on - 1]!, c.x, c.y) },
    foreground: fg ? fg.title : null,
    foregroundApp: fg ? os.processName(fg.pid) : null,
    foregroundDisplay: fg ? numberAt(list, fg.rect.x + fg.rect.width / 2, fg.rect.y + fg.rect.height / 2) : null,
  };
}

/** The display a request names, as long as the arrangement is still the one it was aimed at. */
function target(at: Target): NativeDisplay {
  const { list, layout } = current();
  if (layout !== at.layout) throw new EngineFailure('layoutChanged');
  return display(list, at.display);
}

function display(list: NativeDisplay[], n: number): NativeDisplay {
  const d = list[n - 1];
  if (!d) throw new EngineFailure('noDisplay', [n, list.length]);
  return d;
}

/** Moves the pointer to a physical pixel of `d`. */
function moveOn(d: NativeDisplay, x: number, y: number): void {
  const p = toNative(d, x, y);
  os.moveTo(p.x, p.y);
}

async function withInput(y: Yield, cancelled: Cancelled, act: () => Promise<void> | void): Promise<InputResult> {
  const w = await waitIdle(y, cancelled);
  if (!w.yielded && !w.cancelled) {
    await act();
    markOwn();
  }
  return { ...info(), ...w };
}

async function handle(req: EngineRequest, cancelled: Cancelled): Promise<unknown> {
  switch (req.op) {
    case 'info': return info();
    case 'screenshot': {
      const base = info();
      const n = req.display ?? base.foregroundDisplay ?? base.displays.find((d) => d.primary)?.index ?? 1;
      const d = display(current().list, n);
      const cap = os.capture(d);
      const size = fit(cap.width, cap.height, req.maxWidth, req.maxHeight);
      const rgba = downscale(cap.bgra, cap.width, cap.height, size);
      // per physical pixel, whatever size the capture came at
      const scale = size.width / physicalSize(d).width;
      const c = base.cursor;
      if (c && c.display === n) drawCursor(rgba, size.width, size.height, c.x * scale, c.y * scale);
      const out: ScreenshotResult = { ...base, display: n, jpeg: encodeJpeg(rgba, size.width, size.height, req.quality), width: size.width, height: size.height, scale };
      return out;
    }
    case 'zoom': {
      const d = target(req.at);
      const cap = os.capture(d);
      const k = cap.width / physicalSize(d).width;
      const x = Math.max(0, Math.min(cap.width - 1, Math.round(req.x * k))), y = Math.max(0, Math.min(cap.height - 1, Math.round(req.y * k)));
      const w = Math.max(1, Math.min(cap.width - x, Math.round(req.width * k))), h = Math.max(1, Math.min(cap.height - y, Math.round(req.height * k)));
      const size = fit(w, h, req.maxWidth, req.maxHeight);
      const rgba = downscale(crop(cap.bgra, cap.width, x, y, w, h), w, h, size);
      return { jpeg: encodeJpeg(rgba, size.width, size.height, req.quality), width: size.width, height: size.height } satisfies ZoomResult;
    }
    case 'move': { const d = target(req.at); return withInput(req.yield, cancelled, () => moveOn(d, req.x, req.y)); }
    case 'click': { const d = target(req.at); return withInput(req.yield, cancelled, async () => {
      moveOn(d, req.x, req.y);
      await sleep(40);
      for (let i = 0; i < req.count; i++) {
        os.buttonDown(req.button);
        await sleep(15);
        os.buttonUp(req.button);
        if (i < req.count - 1) await sleep(60);
      }
    }); }
    case 'drag': { const d = target(req.at); return withInput(req.yield, cancelled, async () => {
      moveOn(d, req.x1, req.y1);
      await sleep(40);
      os.buttonDown('left');
      const steps = 16;
      for (let i = 1; i <= steps; i++) {
        await sleep(16);
        moveOn(d, req.x1 + (req.x2 - req.x1) * i / steps, req.y1 + (req.y2 - req.y1) * i / steps);
      }
      await sleep(40);
      os.buttonUp('left');
    }); }
    case 'scroll': { const d = target(req.at); return withInput(req.yield, cancelled, async () => {
      moveOn(d, req.x, req.y);
      await sleep(30);
      const n = Math.max(Math.abs(req.down), Math.abs(req.right));
      for (let i = 0; i < n; i++) {
        os.wheel(i < Math.abs(req.down) ? Math.sign(req.down) : 0, i < Math.abs(req.right) ? Math.sign(req.right) : 0);
        await sleep(30);
      }
    }); }
    case 'type': {
      const w = await waitIdle(req.yield, cancelled);
      if (w.yielded || w.cancelled) return { ...info(), ...w, typed: 0, stoppedBy: null } satisfies TypeResult;
      const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(req.text)].map((s) => s.segment);
      let typed = 0;
      let stoppedBy: TypeResult['stoppedBy'] = null;
      for (let i = 0; i < graphemes.length; i += 16) {
        if (i > 0 && cancelled()) { stoppedBy = 'cancel'; break; }
        if (i > 0 && userIdleMs() < 300) { stoppedBy = 'user'; break; }
        const chunk = graphemes.slice(i, i + 16).join('');
        os.typeUnicode(chunk);
        typed += [...chunk].length;
        markOwn();
        await sleep(req.chunkDelayMs);
      }
      return { ...info(), ...w, typed, stoppedBy } satisfies TypeResult;
    }
    case 'key': return withInput(req.yield, cancelled, async () => {
      for (const chord of req.chords) {
        os.chord(chord);
        await sleep(40);
      }
    });
    case 'windows': {
      const { list } = current();
      return os.windows().map((w): WindowEntry => {
        const n = numberAt(list, w.rect.x + w.rect.width / 2, w.rect.y + w.rect.height / 2);
        if (n === null) return { ...w, display: null };
        const d = list[n - 1]!, at = toLocal(d, w.rect.x, w.rect.y);
        return { ...w, display: n, rect: { ...at, width: Math.round(w.rect.width * d.scale), height: Math.round(w.rect.height * d.scale) } };
      });
    }
    case 'confirm': return os.askYesNo(req.text, req.caption, { yes: req.yes, no: req.no }, req.timeoutMs);
    case 'focus': {
      const w = await waitIdle(req.yield, cancelled);
      if (w.yielded || w.cancelled) return { ...info(), ...w, focused: false };
      const focused = os.focus(req.handle);
      markOwn();
      await sleep(120);
      return { ...info(), ...w, focused };
    }
  }
}

/** Requests being handled, by id; true once a cancel has arrived for it. */
const inFlight = new Map<number, boolean>();

process.on('message', (msg: MainToChild) => {
  if ('cancel' in msg) {
    if (inFlight.has(msg.cancel)) inFlight.set(msg.cancel, true);
    return;
  }
  const { id } = msg;
  inFlight.set(id, false);
  void handle(msg.req, () => inFlight.get(id) === true).then(
    (value) => process.send?.({ id, ok: true, value } satisfies ChildToMain),
    (err: Error) => process.send?.({ id, ok: false, error: err.message, ...(err instanceof EngineFailure ? { code: err.code, args: err.args } : {}) } satisfies ChildToMain),
  ).finally(() => inFlight.delete(id));
});
process.on('disconnect', () => process.exit(0));
