/**
 * Turns the remote's key edges into press/hold/tap events. Pure: no timers, no IO, no
 * clock of its own.
 *
 * A press is `press`, then either `tap` (released before `holdMs`) or `hold` (still down
 * when `holdMs` is crossed) followed by `hold-end`. `hold` is decided from edge
 * timestamps, so any edge also flushes a due hold; `tick(now)` is the timer that makes a
 * quiet press cross `holdMs` without another edge. Only the voice key takes part, and a
 * repeated report of the same edge is ignored.
 */

/** What a remote key is in the pet's terms. */
export type RemoteButton = 'voice' | 'select' | 'back' | 'other';

/** One pressed or released usage, as src/vokie/remote.ts forwards it. */
export interface RemoteEdge {
  /** The key's meaning in the pet's terms; the raw page and usage stay on the edge. */
  button: RemoteButton;
  /** HID usage page; the remote's consumer-control collection is page 12. */
  page: number;
  /** HID usage; AC Search (0x221), the Assistant key, is the default voice key. */
  usage: number;
  down: boolean;
  /** Milliseconds since the epoch, from the helper. */
  ts: number;
}

export type GestureEvent =
  | { type: 'press' }
  | { type: 'hold'; heldMs: number }
  | { type: 'tap'; heldMs: number }
  | { type: 'hold-end'; heldMs: number };

/** The Google TV remote's voice key: consumer page, AC Search. */
export const VOICE_USAGE = 0x221;
/** The remote's select (OK) key: consumer page, Menu Pick. */
export const SELECT_USAGE = 0x41;
/** The remote's back key: consumer page, AC Back. */
export const BACK_USAGE = 0x224;
/** The Google TV remote's voice key: consumer page, AC Search. */
export const DEFAULT_REMOTE_USAGE = VOICE_USAGE;
/** The press length above which a press is a hold rather than a tap. */
export const DEFAULT_HOLD_MS = 500;

/** What a key is in the pet's terms; only the consumer-control page (12) is the remote's. */
export function remoteButtonFor(page: number, usage: number): RemoteButton {
  if (page !== 12) return 'other';
  if (usage === VOICE_USAGE) return 'voice';
  if (usage === SELECT_USAGE) return 'select';
  if (usage === BACK_USAGE) return 'back';
  return 'other';
}

export interface GestureOptions {
  /** The press length that separates a tap from a hold. */
  holdMs: number;
  onEvent: (event: GestureEvent) => void;
  /** The voice key's usage; edges of other keys are ignored. */
  usage?: number;
  /** The voice key's usage page; any page when absent. */
  page?: number;
}

export interface GestureClassifier {
  /** Feeds one edge and first flushes a hold that `edge.ts` has made due. */
  edge(edge: RemoteEdge): void;
  /** Emits `hold` once the current press has lasted `holdMs` by `now`. */
  tick(now: number): void;
  /** True from the press edge until its release. */
  readonly pressed: boolean;
}

export function createGestureClassifier(opts: GestureOptions): GestureClassifier {
  const usage = opts.usage ?? DEFAULT_REMOTE_USAGE;
  const page = opts.page;
  let pressed = false;
  let held = false;
  let pressAt = 0;
  let lastTs = Number.NaN;
  let lastDown = false;

  const flush = (now: number): void => {
    if (!pressed || held || now - pressAt < opts.holdMs) return;
    held = true;
    opts.onEvent({ type: 'hold', heldMs: now - pressAt });
  };

  return {
    get pressed() {
      return pressed;
    },

    edge(edge) {
      flush(edge.ts);
      if (edge.usage !== usage || (page !== undefined && edge.page !== page)) return;
      // the same report can arrive twice; it must not become a second press or release
      if (edge.ts === lastTs && edge.down === lastDown) return;
      lastTs = edge.ts;
      lastDown = edge.down;
      if (edge.down) {
        if (pressed) return;
        pressed = true;
        held = false;
        pressAt = edge.ts;
        opts.onEvent({ type: 'press' });
        return;
      }
      if (!pressed) return;
      pressed = false;
      const heldMs = edge.ts - pressAt;
      opts.onEvent(held ? { type: 'hold-end', heldMs } : { type: 'tap', heldMs });
    },

    tick(now) {
      flush(now);
    },
  };
}
