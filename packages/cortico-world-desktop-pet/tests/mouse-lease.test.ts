import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * `host/` is plain CommonJS, loaded by the window process as it is, and outside the TypeScript
 * project: the lease is reached through this facade.
 */
const require_ = createRequire(import.meta.url);
interface Lease {
  ask(on: boolean): void;
  lock(on: boolean): void;
  tick(): void;
  release(): void;
  forget(): void;
}
const { createMouseLease } = require_('../host/mouse-lease.cjs') as {
  createMouseLease: (options: {
    getWindow: () => unknown;
    leaseMs?: number;
    reassertMs?: number;
    now?: () => number;
  }) => Lease;
};

/** A window that remembers every verdict it was told, and whether it is on screen. */
function fakeWindow() {
  const w = {
    visible: true,
    /** What the window was told, oldest first: true while it takes the mouse. */
    told: [] as boolean[],
    isVisible: () => w.visible,
    setIgnoreMouseEvents: (ignore: boolean) => { w.told.push(!ignore); },
    holding: () => w.told.at(-1) === true,
  };
  return w;
}

/** A lease over a fake window and a clock the test moves by hand. */
function leaseOn(win: ReturnType<typeof fakeWindow>, options: { leaseMs?: number; reassertMs?: number } = {}) {
  let clock = 1_000;
  const lease = createMouseLease({
    getWindow: () => win,
    leaseMs: options.leaseMs ?? 1500,
    reassertMs: options.reassertMs ?? 2000,
    now: () => clock,
  });
  return { lease, advance: (ms: number) => { clock += ms; } };
}

describe('createMouseLease', () => {
  it('passes the clicks through when the first verdict is that the page does not want the mouse', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(false);

    expect(win.told).toEqual([false]);
  });

  it('gives the mouse back once the wish is not renewed within the lease', () => {
    const win = fakeWindow();
    const { lease, advance } = leaseOn(win, { leaseMs: 1500 });

    lease.ask(true);
    lease.tick();
    expect(win.holding()).toBe(true);

    advance(1500);
    lease.tick();

    expect(win.holding()).toBe(false);
  });

  it('gives the mouse back while the window is hidden', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(true);
    lease.tick();
    expect(win.holding()).toBe(true);

    win.visible = false;
    lease.tick();

    expect(win.holding()).toBe(false);
  });

  it('gives the mouse back when the window is released, whatever the page last asked', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(true);
    lease.tick();
    lease.release();

    expect(win.holding()).toBe(false);
  });

  it('applies the verdict again after forgetting it, without waiting for the interval', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(true);
    lease.tick();
    const told = win.told.length;

    lease.forget();
    lease.tick();

    expect(win.told.length).toBe(told + 1);
    expect(win.holding()).toBe(true);
  });

  it('leaves a standing verdict alone until its interval has passed', () => {
    const win = fakeWindow();
    const { lease, advance } = leaseOn(win, { reassertMs: 2000 });

    lease.ask(true);
    lease.tick();
    const told = win.told.length;

    lease.tick();
    expect(win.told.length).toBe(told);

    advance(2000);
    lease.tick();

    expect(win.told.length).toBe(told + 1);
  });

  it('passes every click through while locked, whatever the page asks, and takes the wish back up once unlocked', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(true);
    expect(win.holding()).toBe(true);

    lease.lock(true);
    expect(win.holding()).toBe(false);
    lease.ask(true);
    lease.tick();
    expect(win.holding()).toBe(false);

    lease.lock(false);
    expect(win.holding()).toBe(true);
  });
});
