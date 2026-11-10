import { describe, expect, it } from 'vitest';
import { WARP_RECHECK_MS, createWarp, type Point, type PointerPort } from '../../src/cua/engine/warp.ts';

interface Rect { x: number; y: number; width: number; height: number }

const WHOLE_SCREEN: Rect = { x: 0, y: 0, width: 2560, height: 1600 };

/**
 * A compositor behind XWayland on a virtual clock: it multiplies a warp by `factor`, drops one that does not end over
 * an X11 window, and its answer reaches the X server `latency` ms later. `echo` is an X server that shows the
 * requested position until that answer arrives.
 */
function desktop({ factor = 1, windows = [WHOLE_SCREEN], latency = 16, echo = false }: { factor?: number; windows?: Rect[]; latency?: number; echo?: boolean } = {}) {
  const state = { factor, pointer: { x: 5, y: 5 } as Point, clock: 0 };
  const sent: Point[] = [];
  const answers: Array<{ at: number; to: Point | null }> = [];
  const over = (p: Point) => windows.some((w) => p.x >= w.x && p.y >= w.y && p.x < w.x + w.width && p.y < w.y + w.height);
  const port: PointerPort = {
    warp(x, y) {
      sent.push({ x, y });
      const to = { x: Math.round(x * state.factor), y: Math.round(y * state.factor) };
      if (echo) state.pointer = { x, y };
      answers.push({ at: state.clock + latency, to: over(to) ? to : null });
    },
    cursor() {
      while (answers[0] && answers[0].at <= state.clock) {
        const { to } = answers.shift()!;
        if (to) state.pointer = to;
      }
      return state.pointer;
    },
    wait(ms) { state.clock += ms; },
    now: () => state.clock,
  };
  return { state, sent, port, later(ms: number) { state.clock += ms; port.cursor(); } };
}

describe('moving the pointer through a compositor that applies its own factor', () => {
  it('ends on the target at a fractional scale', () => {
    const d = desktop({ factor: 1.4 });
    createWarp(d.port)(1000, 800);
    d.later(1000);
    expect(d.state.pointer.x).toBeCloseTo(1000, -0.5);
    expect(d.state.pointer.y).toBeCloseTo(800, -0.5);
  });

  it('sends later moves already divided, without a first overshoot', () => {
    const d = desktop({ factor: 1.4 });
    const moveTo = createWarp(d.port);
    moveTo(1000, 800);
    d.later(1000);
    d.sent.length = 0;
    moveTo(1400, 700);
    d.later(1000);
    expect(d.sent).toEqual([{ x: 1000, y: 500 }]);
    expect(d.state.pointer).toEqual({ x: 1400, y: 700 });
  });

  it('is not fooled by an X server that shows the requested position first', () => {
    const d = desktop({ factor: 1.4, echo: true, latency: 40 });
    createWarp(d.port)(1000, 800);
    d.later(1000);
    expect(d.state.pointer.x).toBeCloseTo(1000, -0.5);
    expect(d.state.pointer.y).toBeCloseTo(800, -0.5);
  });

  it('learns nothing from a dropped move, and reaches that target once another move has landed', () => {
    const appWindow = { x: 397, y: 189, width: 1763, height: 1188 };
    const d = desktop({ factor: 1.4, windows: [appWindow] });
    const moveTo = createWarp(d.port);
    moveTo(1280, 1000); // 1.4× this is below the window
    d.later(1000);
    expect(d.state.pointer).toEqual({ x: 5, y: 5 });
    moveTo(1000, 800);
    moveTo(1280, 1000);
    d.later(1000);
    expect(d.state.pointer.x).toBeCloseTo(1280, -0.5);
    expect(d.state.pointer.y).toBeCloseTo(1000, -0.5);
  });

  it('notices at the next check that the scale changed', () => {
    const d = desktop({ factor: 1.4 });
    const moveTo = createWarp(d.port);
    moveTo(1000, 800);
    d.state.factor = 1;
    d.later(WARP_RECHECK_MS);
    moveTo(1200, 600);
    d.later(1000);
    expect(d.state.pointer).toEqual({ x: 1200, y: 600 });
  });

  it('takes no factor from a pointer the person moved during the read-back', () => {
    const d = desktop({ factor: 1 });
    const inner = d.port.cursor;
    let moved = false;
    d.port.cursor = () => (moved ? { x: 900, y: 200 } : inner());
    d.port.wait = (ms) => { d.state.clock += ms; moved = true; };
    const moveTo = createWarp(d.port);
    moveTo(1000, 800);
    moved = false;
    d.port.cursor = inner;
    d.port.wait = (ms) => { d.state.clock += ms; };
    d.sent.length = 0;
    moveTo(1000, 800);
    expect(d.sent[0]).toEqual({ x: 1000, y: 800 });
  });

  it('warps once per move on a compositor that applies no factor', () => {
    const d = desktop();
    const moveTo = createWarp(d.port);
    moveTo(1000, 800);
    moveTo(700, 300);
    d.later(1000);
    expect(d.sent).toEqual([{ x: 1000, y: 800 }, { x: 700, y: 300 }]);
    expect(d.state.pointer).toEqual({ x: 700, y: 300 });
  });
});
