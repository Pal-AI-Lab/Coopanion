import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUA_DEFAULTS } from '../../src/cua/config.ts';
import { UserActivity } from '../../src/cua/engine/user-activity.ts';
import { INPUT_POLL_MS, waitIdle } from '../../src/cua/engine/wait-idle.ts';

const policy = { idleMs: CUA_DEFAULTS.userIdleMs, maxWaitMs: CUA_DEFAULTS.maxYieldWaitMs };
const origin = { x: 0, y: 0 };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(20_000); });
afterEach(() => vi.useRealTimers());

describe('waiting for idle', () => {
  it('executes without waiting when an old pointer move is discovered', async () => {
    const input = new UserActivity();
    input.markOwn(1000, origin);
    const result = await waitIdle(policy, () => false, () => input.sample({ now: Date.now(), lastInputTick: 10_000, cursor: { x: 40, y: 0 } }));
    expect(result).toMatchObject({ yielded: false, cancelled: false, waitedMs: 0, activity: {
      blockedBy: [], systemInput: { count: 0, lastTick: null }, pointerMovement: { count: 0, lastTick: null },
    } });
  });

  it('counts blocking checks of one unrecorded move until the default idle period expires', async () => {
    const input = new UserActivity();
    const start = Date.now();
    input.markOwn(1000, origin);
    const pending = waitIdle(policy, () => false, () => input.sample({ now: Date.now(), lastInputTick: 1000, cursor: { x: 40, y: 0 } }));
    await vi.advanceTimersByTimeAsync(policy.idleMs);
    const result = await pending;
    expect(result).toMatchObject({ yielded: false, cancelled: false, waitedMs: policy.idleMs, activity: {
      blockedBy: [], systemInput: { count: 0, lastTick: null },
      pointerMovement: { count: Math.ceil(policy.idleMs / INPUT_POLL_MS), lastTick: start },
    } });
  });

  it.each(['systemInput', 'pointerMovement', 'both'] as const)('reports %s after continuous input reaches the default wait limit', async (kind) => {
    const input = new UserActivity();
    const own = 1000;
    input.markOwn(own, origin);
    const pending = waitIdle(policy, () => false, () => input.sample({
      now: Date.now(), lastInputTick: kind === 'pointerMovement' ? own : Date.now(),
      cursor: kind === 'systemInput' ? origin : { x: Date.now(), y: 0 },
    }));
    await vi.advanceTimersByTimeAsync(policy.maxWaitMs);
    const result = await pending;
    const count = Math.floor(policy.maxWaitMs / INPUT_POLL_MS) + 1;
    const signal = { count, lastTick: Date.now() };
    const absent = { count: 0, lastTick: null };
    expect(result).toEqual({ yielded: true, cancelled: false, waitedMs: policy.maxWaitMs, activity: {
      blockedBy: kind === 'both' ? ['systemInput', 'pointerMovement'] : [kind],
      systemInput: kind === 'pointerMovement' ? absent : signal,
      pointerMovement: kind === 'systemInput' ? absent : signal,
      lastSample: { now: Date.now(), lastInputTick: kind === 'pointerMovement' ? own : Date.now(), ownInputTick: own, pointerMoved: kind !== 'systemInput' },
    } });
  });

  it('retains earlier system-input counts when only the pointer still blocks at the deadline', async () => {
    const input = new UserActivity();
    const start = Date.now();
    const lastSystemTick = start + policy.idleMs - INPUT_POLL_MS;
    input.markOwn(1000, origin);
    const pending = waitIdle(policy, () => false, () => input.sample({
      now: Date.now(), lastInputTick: Math.min(Date.now(), lastSystemTick), cursor: { x: Date.now(), y: 0 },
    }));
    await vi.advanceTimersByTimeAsync(policy.maxWaitMs);
    const { activity } = await pending;
    expect(activity.blockedBy).toEqual(['pointerMovement']);
    expect(activity.systemInput.count).toBeGreaterThan(0);
    expect(activity.systemInput.count).toBeLessThan(activity.pointerMovement.count);
    expect(activity.systemInput.lastTick).toBe(lastSystemTick);
    expect(activity.pointerMovement.lastTick).toBe(Date.now());
  });

  it('releases input when the idle threshold and wait deadline coincide', async () => {
    const input = new UserActivity();
    const start = Date.now();
    input.markOwn(1000, origin);
    const pending = waitIdle({ ...policy, maxWaitMs: policy.idleMs }, () => false, () => input.sample({ now: Date.now(), lastInputTick: start, cursor: origin }));
    await vi.advanceTimersByTimeAsync(policy.idleMs);
    expect(await pending).toMatchObject({ yielded: false, waitedMs: policy.idleMs, activity: { blockedBy: [] } });
  });

  it('stops waiting on cancellation and preserves the observations already collected', async () => {
    const input = new UserActivity();
    input.markOwn(1000, origin);
    let cancelled = false;
    const pending = waitIdle(policy, () => cancelled, () => input.sample({ now: Date.now(), lastInputTick: Date.now(), cursor: origin }));
    cancelled = true;
    await vi.advanceTimersByTimeAsync(INPUT_POLL_MS);
    expect(await pending).toMatchObject({ yielded: false, cancelled: true, waitedMs: INPUT_POLL_MS, activity: {
      systemInput: { count: 1, lastTick: Date.now() - INPUT_POLL_MS }, pointerMovement: { count: 0, lastTick: null },
    } });
  });

  it('preserves unsigned ticks and blocking counts through wraparound', async () => {
    vi.setSystemTime(0x1_0000_0000 - INPUT_POLL_MS);
    const input = new UserActivity();
    const own = (Date.now() - 1000) >>> 0;
    input.markOwn(own, origin);
    const pending = waitIdle(policy, () => false, () => input.sample({ now: Date.now() >>> 0, lastInputTick: Date.now() >>> 0, cursor: { x: Date.now(), y: 0 } }));
    await vi.advanceTimersByTimeAsync(policy.maxWaitMs);
    expect(await pending).toMatchObject({ yielded: true, waitedMs: policy.maxWaitMs, activity: {
      blockedBy: ['systemInput', 'pointerMovement'],
      systemInput: { count: Math.floor(policy.maxWaitMs / INPUT_POLL_MS) + 1, lastTick: Date.now() >>> 0 },
      pointerMovement: { count: Math.floor(policy.maxWaitMs / INPUT_POLL_MS) + 1, lastTick: Date.now() >>> 0 },
      lastSample: { now: Date.now() >>> 0, lastInputTick: Date.now() >>> 0, ownInputTick: own },
    } });
  });
});
