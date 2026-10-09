/** Messages between CuaWorld and the engine child process (fork IPC, advanced serialization). */
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

export type EngineRequest =
  | { op: 'info' }
  | { op: 'screenshot'; maxWidth: number; maxHeight: number; quality: number }
  | { op: 'click'; x: number; y: number; button: Button; count: number; yield: Yield }
  | { op: 'move'; x: number; y: number; yield: Yield }
  | { op: 'drag'; x1: number; y1: number; x2: number; y2: number; yield: Yield }
  | { op: 'scroll'; x: number; y: number; down: number; right: number; yield: Yield }
  | { op: 'type'; text: string; chunkDelayMs: number; yield: Yield }
  | { op: 'key'; chords: KeyCode[][]; yield: Yield }
  | { op: 'windows' }
  | { op: 'focus'; handle: string; yield: Yield }
  /** `yes` and `no` label the dialog's buttons where the system lets them be named. */
  | { op: 'confirm'; text: string; caption: string; yes: string; no: string; timeoutMs: number };

/** How a yes/no question to the person ended. */
export type Answer = 'yes' | 'no' | 'timeout';

export interface ScreenInfo {
  screen: { width: number; height: number };
  /** Physical pixels. */
  cursor: { x: number; y: number };
  foreground: string | null;
}

export interface ScreenshotResult extends ScreenInfo {
  jpeg: Uint8Array;
  width: number;
  height: number;
  scale: number;
}

/** Every input op reports how long it waited for the user and where the pointer ended up. */
export interface InputResult extends ScreenInfo {
  /** The user was not idle within `maxWaitMs`; nothing was sent. */
  yielded: boolean;
  /** A cancel arrived while waiting for the user; nothing was sent. */
  cancelled: boolean;
  waitedMs: number;
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
