import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * `host/` is plain CommonJS, loaded by the window process as it is, and outside the TypeScript
 * project: the lease is reached through this facade.
 */
const require_ = createRequire(import.meta.url);
type Rect = [number, number, number, number];
interface Lease {
  ask(on: boolean, areas?: Rect[]): void;
  tick(at: { x: number; y: number } | null): void;
  release(): void;
  forget(): void;
  state: () => { wanted: boolean; held: boolean; areas: number };
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
  return { lease, at: (x: number, y: number) => ({ x, y }), advance: (ms: number) => { clock += ms; } };
}

const PET: Rect = [900, 700, 120, 140];
const BUBBLE: Rect = [600, 400, 300, 200];

describe('createMouseLease', () => {
  it('passes the clicks through when the first verdict is that the page does not want the mouse', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(false);

    expect(win.told).toEqual([false]);
  });

  it('takes the mouse while the cursor is inside the areas the page named', () => {
    const win = fakeWindow();
    const { lease, at } = leaseOn(win);

    lease.ask(true, [PET, BUBBLE]);
    lease.tick(at(920, 720));

    expect(win.holding()).toBe(true);
    expect(lease.state().areas).toBe(2);
  });

  it('passes the clicks through while the cursor is outside every area', () => {
    const win = fakeWindow();
    const { lease, at } = leaseOn(win);

    lease.ask(true, [PET, BUBBLE]);
    lease.tick(at(100, 100));

    expect(win.holding()).toBe(false);
  });

  it('takes the mouse anywhere while the page names no areas, as an older page does', () => {
    const win = fakeWindow();
    const { lease, at } = leaseOn(win);

    lease.ask(true);
    lease.tick(at(100, 100));

    expect(win.holding()).toBe(true);
  });

  it('gives the mouse back once the wish is not renewed within the lease', () => {
    const win = fakeWindow();
    const { lease, at, advance } = leaseOn(win, { leaseMs: 1500 });

    lease.ask(true, [PET]);
    lease.tick(at(920, 720));
    expect(win.holding()).toBe(true);

    advance(1500);
    lease.tick(at(920, 720));

    expect(win.holding()).toBe(false);
  });

  it('gives the mouse back while the window is hidden', () => {
    const win = fakeWindow();
    const { lease, at } = leaseOn(win);

    lease.ask(true, [PET]);
    lease.tick(at(920, 720));
    expect(win.holding()).toBe(true);

    win.visible = false;
    lease.tick(at(920, 720));

    expect(win.holding()).toBe(false);
  });

  it('gives the mouse back when the window is released, whatever the page last asked', () => {
    const win = fakeWindow();
    const { lease, at } = leaseOn(win);

    lease.ask(true, [PET]);
    lease.tick(at(920, 720));
    lease.release();

    expect(win.holding()).toBe(false);
  });

  it('applies the verdict again after forgetting it, without waiting for the interval', () => {
    const win = fakeWindow();
    const { lease, at } = leaseOn(win);

    lease.ask(true, [PET]);
    lease.tick(at(920, 720));
    const told = win.told.length;

    lease.forget();
    lease.tick(at(920, 720));

    expect(win.told.length).toBe(told + 1);
    expect(win.holding()).toBe(true);
  });

  it('leaves a standing verdict alone until its interval has passed', () => {
    const win = fakeWindow();
    const { lease, at, advance } = leaseOn(win, { reassertMs: 2000 });

    lease.ask(true, [PET]);
    lease.tick(at(920, 720));
    const told = win.told.length;

    lease.tick(at(921, 721));
    expect(win.told.length).toBe(told);

    advance(2000);
    lease.tick(at(921, 721));

    expect(win.told.length).toBe(told + 1);
  });

  it('drops areas that are not four finite numbers', () => {
    const win = fakeWindow();
    const { lease } = leaseOn(win);

    lease.ask(true, [PET, [1, 2, 3] as unknown as Rect, [Number.NaN, 0, 10, 10], ['a', 0, 10, 10] as unknown as Rect]);

    expect(lease.state().areas).toBe(1);
  });
});
