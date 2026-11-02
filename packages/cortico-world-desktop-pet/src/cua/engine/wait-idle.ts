import type { InputResult, Yield, YieldDiagnostics } from '../engine-ipc.ts';
import type { InputActivity } from './user-activity.ts';

export const INPUT_POLL_MS = 100;

export function recordActivity(diagnostics: YieldDiagnostics, sample: InputActivity, idleMs: number): void {
  diagnostics.blockedBy = [];
  diagnostics.lastSample = { now: sample.now, lastInputTick: sample.lastInputTick, ownInputTick: sample.ownInputTick, pointerMoved: sample.pointerMoved };
  for (const [signal, tick] of [['systemInput', sample.systemInputTick], ['pointerMovement', sample.pointerTick]] as const) {
    if (tick !== null && ((sample.now - tick) >>> 0) < idleMs) {
      diagnostics.blockedBy.push(signal);
      diagnostics[signal].count++;
      diagnostics[signal].lastTick = tick;
    }
  }
}

export async function waitIdle(y: Yield, cancelled: () => boolean, sample: () => InputActivity): Promise<Pick<InputResult, 'yielded' | 'cancelled' | 'waitedMs' | 'activity'>> {
  const start = Date.now();
  const activity: YieldDiagnostics = {
    blockedBy: [], systemInput: { count: 0, lastTick: null }, pointerMovement: { count: 0, lastTick: null }, lastSample: null,
  };
  for (;;) {
    if (cancelled()) return { yielded: false, cancelled: true, waitedMs: Date.now() - start, activity };
    const current = sample();
    recordActivity(activity, current, y.idleMs);
    if (current.idleMs >= y.idleMs) return { yielded: false, cancelled: false, waitedMs: Date.now() - start, activity };
    if (Date.now() - start >= y.maxWaitMs) return { yielded: true, cancelled: false, waitedMs: Date.now() - start, activity };
    await new Promise((resolve) => setTimeout(resolve, INPUT_POLL_MS));
  }
}
