/** Messages between Cua (cua.ts) and the engine child process (fork IPC, advanced serialization). */
import type { EngineErrorCode } from './engine/fail.ts';
import type { KeyCode } from './engine/keys.ts';

export type Button = 'left' | 'right' | 'middle';

/** How long to stay out of the user's way before an input action. */
export interface Yield {
  /** The user must have been idle this long. */
  idleMs: number;
  /** Give up after waiting this long. */
  maxWaitMs: number;
}

/**
 * Where an input lands: physical pixels of display `display` (its index in `ScreenInfo.displays`), as the
 * arrangement `layout` stood. The engine refuses a target whose `layout` is no longer the current one.
 */
export interface Target { display: number; layout: string }

export type EngineRequest =
  | { op: 'info' }
  /** `display` null: the display holding the foreground window, or the primary one. */
  | { op: 'screenshot'; display: number | null; maxWidth: number; maxHeight: number; quality: number }
  /** A region of the display in physical pixels, captured fresh and scaled down only to fit. */
  | { op: 'zoom'; at: Target; x: number; y: number; width: number; height: number; maxWidth: number; maxHeight: number; quality: number }
  | { op: 'click'; at: Target; x: number; y: number; button: Button; count: number; yield: Yield }
  | { op: 'move'; at: Target; x: number; y: number; yield: Yield }
  | { op: 'drag'; at: Target; x1: number; y1: number; x2: number; y2: number; yield: Yield }
  | { op: 'scroll'; at: Target; x: number; y: number; down: number; right: number; yield: Yield }
  | { op: 'type'; text: string; chunkDelayMs: number; yield: Yield }
  | { op: 'key'; chords: KeyCode[][]; yield: Yield }
  | { op: 'windows' }
  | { op: 'focus'; handle: string; yield: Yield }
  /** `yes` and `no` label the dialog's buttons where the system lets them be named. */
  | { op: 'confirm'; text: string; caption: string; yes: string; no: string; timeoutMs: number };

/** How a yes/no question to the person ended. */
export type Answer = 'yes' | 'no' | 'timeout';

/** A display: `index` is its place in the list, 1-based, left to right and then top to bottom; sizes are physical pixels. */
export interface DisplayInfo {
  index: number;
  primary: boolean;
  width: number;
  height: number;
}

export interface ScreenInfo {
  displays: DisplayInfo[];
  /** Names the arrangement of the displays; it changes when one is added, removed, moved or rescaled. */
  layout: string;
  /** Physical pixels of the display it is on; null while it is on none. */
  cursor: { display: number; x: number; y: number } | null;
  /** null when there is no foreground target; empty when its title is unavailable. */
  foreground: string | null;
  /** The program the foreground window belongs to: the executable's file name on Windows and Linux, the app's name on macOS. */
  foregroundApp: string | null;
  /** The display holding the middle of the foreground window. */
  foregroundDisplay: number | null;
}

export interface ScreenshotResult extends ScreenInfo {
  display: number;
  jpeg: Uint8Array;
  width: number;
  height: number;
  /** Screenshot pixels per physical pixel of the display. */
  scale: number;
}

export interface ZoomResult {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/** Counts blocking checks, not input events: several checks can see the same input tick. */
export interface YieldSignal {
  count: number;
  lastTick: number | null;
}

export interface YieldDiagnostics {
  /** Signals still inside the idle threshold at the last check. */
  blockedBy: Array<'systemInput' | 'pointerMovement'>;
  systemInput: YieldSignal;
  pointerMovement: YieldSignal;
  /** Raw ticks wrap at 2^32; absent before the first check. lastInputTick is null when the system cannot report input. */
  lastSample: { now: number; lastInputTick: number | null; ownInputTick: number | null; pointerMoved: boolean } | null;
}

/** Every input op reports how long it waited for the user and where the pointer ended up. */
export interface InputResult extends ScreenInfo {
  /** The user was not idle within `maxWaitMs`; nothing was sent. */
  yielded: boolean;
  /** A cancel arrived while waiting for the user; nothing was sent. */
  cancelled: boolean;
  waitedMs: number;
  /** Checks while waiting, plus the stopping check if typing yields between chunks. */
  activity: YieldDiagnostics;
}

/** `typed` counts code points sent; `stoppedBy` is null when the whole text went out. */
export interface TypeResult extends InputResult {
  typed: number;
  stoppedBy: 'user' | 'cancel' | null;
}

export interface WindowEntry {
  handle: string;
  title: string;
  pid: number;
  /** The display holding the window's middle, null when none does; the rectangle is in that display's physical pixels. */
  display: number | null;
  rect: { x: number; y: number; width: number; height: number };
  minimized: boolean;
  foreground: boolean;
}

/**
 * `cancel` stops request `id` at its next safe point: during the wait for the user, or between
 * typed chunks. Every other step of an op runs to its end; a cancel for a finished request is dropped.
 */
export type MainToChild = { id: number; req: EngineRequest } | { cancel: number };
/** A failure the World words itself carries `code` and `args` (engine/fail.ts); `error` is the message as thrown. */
export type ChildToMain = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string; code?: EngineErrorCode; args?: Array<string | number> };
