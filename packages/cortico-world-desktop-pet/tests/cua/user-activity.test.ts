import { describe, expect, it } from 'vitest';
import { CUA_DEFAULTS } from '../../src/cua/config.ts';
import { UserActivity, type InputSample } from '../../src/cua/engine/user-activity.ts';

const idleFor = (activity: UserActivity, sample: InputSample) => activity.sample(sample).idleMs;

const origin = { x: 0, y: 0 };
const moved = { x: 20, y: 10 };

describe('user activity', () => {
  it('does not wait for a recorded pointer move first discovered ten seconds later', () => {
    const activity = new UserActivity();
    activity.markOwn(1000, origin);
    const idleMs = idleFor(activity, { now: 21_000, lastInputTick: 11_000, cursor: moved });
    expect(idleMs).toBe(10_000);
    expect(idleMs).toBeGreaterThanOrEqual(CUA_DEFAULTS.userIdleMs);
  });

  it.each([1000, (10_000 - 3_600_000) >>> 0])('dates pointer movement without a newer input record from discovery (tick %i)', (lastInputTick) => {
    const activity = new UserActivity();
    activity.markOwn(1000, origin);
    expect(idleFor(activity, { now: 10_000, lastInputTick, cursor: moved })).toBe(0);
    expect(idleFor(activity, { now: 10_000 + CUA_DEFAULTS.userIdleMs - 1, lastInputTick, cursor: moved })).toBeLessThan(CUA_DEFAULTS.userIdleMs);
    expect(idleFor(activity, { now: 10_000 + CUA_DEFAULTS.userIdleMs, lastInputTick, cursor: moved })).toBe(CUA_DEFAULTS.userIdleMs);
  });

  it.each(['recorded', 'unrecorded'] as const)('keeps yielding throughout continuous %s pointer movement', (kind) => {
    const activity = new UserActivity();
    activity.markOwn(1000, origin);
    for (let elapsed = 100; elapsed <= CUA_DEFAULTS.maxYieldWaitMs; elapsed += 100) {
      const now = 1000 + elapsed;
      expect(idleFor(activity, { now, lastInputTick: kind === 'recorded' ? now : 1000, cursor: { x: elapsed, y: 0 } })).toBeLessThan(CUA_DEFAULTS.userIdleMs);
    }
  });

  it('uses discovery time for continuing movement when an earlier input record stops advancing', () => {
    const activity = new UserActivity();
    activity.markOwn(1000, origin);
    idleFor(activity, { now: 2000, lastInputTick: 1900, cursor: moved });
    const idleMs = idleFor(activity, { now: 2000 + CUA_DEFAULTS.userIdleMs, lastInputTick: 1900, cursor: { x: 40, y: 10 } });
    expect(idleMs).toBe(0);
  });

  it('keeps yielding for keyboard input with a stationary cursor', () => {
    const activity = new UserActivity();
    activity.markOwn(1000, origin);
    for (let elapsed = 100; elapsed <= CUA_DEFAULTS.maxYieldWaitMs; elapsed += 100) {
      const now = 1000 + elapsed;
      expect(idleFor(activity, { now, lastInputTick: now, cursor: origin })).toBeLessThan(CUA_DEFAULTS.userIdleMs);
    }
  });

  it('retains the injection grace and pointer tolerance', () => {
    const activity = new UserActivity();
    activity.markOwn(1000, origin);
    expect(idleFor(activity, { now: 1040, lastInputTick: 1040, cursor: { x: 2, y: -2 } })).toBe(Infinity);
    expect(idleFor(activity, { now: 1041, lastInputTick: 1041, cursor: origin })).toBe(0);
    activity.markOwn(2000, moved);
    expect(idleFor(activity, { now: 2100, lastInputTick: 2000, cursor: moved })).toBe(Infinity);
  });

  it('compares input and injection ticks across 2^32, including input at zero', () => {
    const activity = new UserActivity();
    activity.markOwn(0xffff_ff00, origin);
    expect(idleFor(activity, { now: 50, lastInputTick: 0, cursor: moved })).toBe(50);
    expect(idleFor(activity, { now: CUA_DEFAULTS.userIdleMs, lastInputTick: 0, cursor: moved })).toBe(CUA_DEFAULTS.userIdleMs);
    activity.markOwn(0, moved);
    expect(idleFor(activity, { now: 50, lastInputTick: 0xffff_ffff, cursor: moved })).toBe(Infinity);
    expect(idleFor(activity, { now: 100, lastInputTick: 100, cursor: moved })).toBe(0);
  });

  it('retains an unrecorded move discovered at tick zero after wraparound', () => {
    const activity = new UserActivity();
    activity.markOwn(0xffff_ff00, origin);
    expect(idleFor(activity, { now: 0, lastInputTick: 0xffff_ff00, cursor: moved })).toBe(0);
    expect(idleFor(activity, { now: CUA_DEFAULTS.userIdleMs, lastInputTick: 0xffff_ff00, cursor: moved })).toBe(CUA_DEFAULTS.userIdleMs);
  });
});
