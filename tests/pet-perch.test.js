// Window perches: the tops the window process reads off the desktop (host/windows.cjs), and the body
// standing, climbing and falling on them (web/kit/perch.js, web/kit/body.js).
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { climbTarget, groundAt, mountX } from '../packages/cortico-world-desktop-pet/web/kit/perch.js';
import { ledgesFrom } from '../packages/cortico-world-desktop-pet/host/windows.cjs';
import { createPet } from '../packages/cortico-world-desktop-pet/web/kit/body.js';

const LEDGE = { x0: 400, x1: 900, y: 200 };

describe('ground', () => {
  it('stands on a window top over it and falls to the floor away from it', () => {
    const ledges = [LEDGE];
    expect(groundAt(ledges, 600, 200, 660)).toBe(200);
    expect(groundAt(ledges, 600, 660, 660)).toBe(660);
    expect(groundAt(ledges, 100, 200, 660)).toBe(660);
    // one further down is met first on the way down
    expect(groundAt([LEDGE, { x0: 500, x1: 800, y: 400 }], 600, 100, 660)).toBe(200);
    expect(groundAt([LEDGE, { x0: 500, x1: 800, y: 400 }], 600, 250, 660)).toBe(400);
  });

  it('climbs the nearer side of the window above, not through it', () => {
    expect(climbTarget([LEDGE], 100, 660)).toMatchObject({ edgeX: 400, side: -1 });
    expect(climbTarget([LEDGE], 1100, 660)).toMatchObject({ edgeX: 900, side: 1 });
    // already under it: no side to climb
    expect(climbTarget([LEDGE], 600, 660)).toBeNull();
    // out of a walk's reach, or barely above the feet
    expect(climbTarget([LEDGE], 20, 660, { reach: 100 })).toBeNull();
    expect(climbTarget([{ ...LEDGE, y: 640 }], 100, 660)).toBeNull();
    expect(mountX(LEDGE, -1)).toBeGreaterThan(LEDGE.x0);
    expect(mountX(LEDGE, 1)).toBeLessThan(LEDGE.x1);
  });
});

describe('window tops off the desktop', () => {
  const view = { width: 1200, floor: 660 };
  const origin = { x: 0, y: 0 };

  it('keeps the tops that are visible, and drops the ones in front of nothing', () => {
    // a full-screen window: no room for the body above its top
    expect(ledgesFrom([{ x: 0, y: 0, w: 1200, h: 660 }], origin, view)).toEqual([]);
    expect(ledgesFrom([{ x: 100, y: 200, w: 600, h: 400 }], origin, view)).toEqual([{ x0: 100, x1: 700, y: 200 }]);
  });

  it('keeps only the part of a top edge the window in front of it leaves visible', () => {
    const back = { x: 100, y: 200, w: 600, h: 400 };
    const front = { x: 400, y: 100, w: 200, h: 500 };
    expect(ledgesFrom([front, back], origin, view)).toEqual([{ x0: 100, x1: 400, y: 200 }]);
    // hidden completely by the window in front of it
    expect(ledgesFrom([{ x: 0, y: 100, w: 1200, h: 560 }, back], origin, view)).toEqual([]);
  });

  it('follows the pet window on its display', () => {
    // the same window on a display that starts at x=1440
    const rects = [{ x: 1540, y: 200, w: 600, h: 400 }];
    expect(ledgesFrom(rects, { x: 1440, y: 0 }, view)).toEqual([{ x0: 100, x1: 700, y: 200 }]);
  });
});

describe('the body on a window top', () => {
  /** A pet dropped in over `ledges`, and its events, stepped by hand. */
  function body({ ledges = [LEDGE], startX = 600, width = 1200 } = {}) {
    const dom = new JSDOM('<!doctype html><body><svg><ellipse/><g></g><g></g></svg></body>');
    const [shadowEl, petG, fxG] = [...dom.window.document.querySelector('svg').children];
    const events = [];
    const bounds = { W: width, H: 700, floorY: 660, S: .42, ledges };
    const ctl = createPet({ petG, shadowEl, fxG }, {
      figure: { draw() {} },
      bounds: () => bounds,
      onEvent: (kind, detail) => events.push({ kind, ...detail }),
      sfx: { play() {} },
      startX,
      enter: 'drop',
    });
    // as web/kit/body.js's createBody does: a step draws the frame, and the hit circles follow it
    const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) { ctl.step(1 / 60); ctl.render(); } };
    return { ctl, events, run, bounds };
  }

  it('lands on the window top under it instead of falling to the floor', () => {
    const b = body();
    b.run(3);
    expect(b.ctl.pet.fy).toBe(LEDGE.y);
    expect(b.events.some((e) => e.kind === 'mode' && e.mode === 'land')).toBe(true);
  });

  it('walks off the end of the top edge and falls to the floor', () => {
    const b = body();
    b.run(3);
    b.ctl.walkTo(1100, false, 'w1');
    b.run(6);
    expect(b.ctl.pet.x).toBeGreaterThan(LEDGE.x1);
    expect(b.ctl.pet.fy).toBe(660);
    expect(b.events).toContainEqual(expect.objectContaining({ kind: 'interrupted', walkId: 'w1' }));
  });

  it('walks to the side of the window and climbs onto its top', () => {
    const b = body({ startX: 100 });
    // the only reason to climb is the body's own roaming; hold it to that choice
    const random = Math.random;
    Math.random = () => .999;
    try { b.run(12); } finally { Math.random = random; }
    expect(b.ctl.pet.fy).toBe(LEDGE.y);
    expect(b.ctl.pet.x).toBeGreaterThanOrEqual(LEDGE.x0);
    expect(b.ctl.pet.x).toBeLessThanOrEqual(LEDGE.x1);
    expect(b.events.some((e) => e.kind === 'mode' && e.mode === 'climb')).toBe(true);
  });

  it('keeps climbing when the window list is refreshed under it', () => {
    const b = body({ startX: 100 });
    const random = Math.random;
    Math.random = () => .999;
    try {
      for (let i = 0; i < 60 * 20 && b.ctl.pet.mode !== 'climb'; i++) b.ctl.step(1 / 60);
      expect(b.ctl.pet.mode).toBe('climb');
      const y = b.ctl.pet.fy;
      b.ctl.resize();
      expect(b.ctl.pet.mode).toBe('climb');
      b.ctl.step(1 / 60);
      expect(b.ctl.pet.fy).toBeLessThan(y);
    } finally { Math.random = random; }
  });

  /** Carries the body from `from` to `to` over `ms` stage pixels and lets go without pausing, as a hand does. */
  function carry(b, { from, to, ms = 300, steps = 8 }) {
    const t0 = performance.now();
    b.ctl.pointerDown({ x: from.x, y: from.y, t: t0 });
    for (let i = 1; i <= steps; i++) {
      b.ctl.pointerMove({ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, t: t0 + ms * i / steps });
      b.run(ms / steps / 1000);
    }
    b.ctl.pointerUp({ x: to.x, y: to.y, t: t0 + ms + 1 });
  }

  it('sets it down on a window top it is carried onto, even when the carry is quick', () => {
    const b = body({ startX: 200 });
    // it drops in from above the stage; hold still and let it reach the floor before grabbing it
    b.ctl.setRoam('off');
    b.run(1.5);
    expect(b.ctl.pet.fy).toBe(660);
    carry(b, { from: { x: 200, y: 606 }, to: { x: 600, y: 60 }, ms: 120 });
    b.run(2.5);
    expect(b.ctl.pet.fy).toBe(LEDGE.y);
    expect(b.events).toContainEqual(expect.objectContaining({ kind: 'drop' }));
  });

  it('still throws it over open floor', () => {
    const b = body({ startX: 200, ledges: [] });
    b.ctl.setRoam('off');
    b.run(1.5);
    carry(b, { from: { x: 200, y: 606 }, to: { x: 700, y: 300 }, ms: 120 });
    expect(b.ctl.pet.mode).toBe('air');
    expect(b.ctl.pet.airKind).toBe('throw');
    expect(Math.abs(b.ctl.pet.vx) + Math.abs(b.ctl.pet.vy)).toBeGreaterThan(500);
  });

  it('walks to a window it is nowhere near, and climbs it', () => {
    // 700 pixels from the nearest side: further than an opportunistic climb would ever notice
    const b = body({ startX: 200, ledges: [{ x0: 900, x1: 1400, y: 200 }], width: 2000 });
    const random = Math.random;
    Math.random = () => .999;
    try {
      for (let i = 0; i < 60 * 40 && b.ctl.pet.mode !== 'climb'; i++) b.ctl.step(1 / 60);
      expect(b.ctl.pet.mode).toBe('climb');
      for (let i = 0; i < 60 * 15 && b.ctl.pet.mode === 'climb'; i++) b.ctl.step(1 / 60);
    } finally { Math.random = random; }
    expect(b.ctl.pet.fy).toBe(200);
    expect(b.ctl.pet.x).toBeGreaterThanOrEqual(900);
    expect(b.ctl.pet.x).toBeLessThanOrEqual(1400);
  });

  it('walks off the end of the top edge and comes down', () => {
    const b = body({ startX: 600 });
    b.run(3);
    expect(b.ctl.pet.fy).toBe(LEDGE.y);
    const random = Math.random;
    // 'down' is the last option while it stands on a window
    Math.random = () => .999;
    try {
      for (let i = 0; i < 60 * 30 && b.ctl.pet.mode !== 'air'; i++) b.ctl.step(1 / 60);
      expect(b.ctl.pet.mode).toBe('air');
      for (let i = 0; i < 60 * 5 && b.ctl.pet.mode === 'air'; i++) b.ctl.step(1 / 60);
    } finally { Math.random = random; }
    expect(b.ctl.pet.fy).toBe(660);
  });

  it('falls when the window it stands on goes away', () => {
    const b = body();
    b.run(3);
    expect(b.ctl.pet.fy).toBe(LEDGE.y);
    b.bounds.ledges = [];
    b.ctl.resize();
    b.run(2);
    expect(b.ctl.pet.fy).toBe(660);
  });
});
