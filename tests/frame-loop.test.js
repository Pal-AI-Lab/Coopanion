// The pet page's frame loop (web/frame-loop.js) on simulated displays: display refreshes come at the refresh rate,
// with the refresh's time; timers fire when due, or later when said so.
import { describe, expect, it } from 'vitest';
import { MAX_GAP, MAX_STEP, runFrames, stepsFor } from '../packages/cortico-world-desktop-pet/web/frame-loop.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Runs the loop for `seconds` on a display of `hz`, each frame asking for the next as `pace` says, and returns the
 * clock time the frames advanced by, how many there were, the longest step one took, the last frame's time and the
 * longest gap between two frames (seconds). `late` delays every timer by that many ms; `asleep` is [from, to] (ms)
 * during which neither refreshes nor timers come.
 */
function simulate(hz, pace, seconds, { late = 0, asleep = null } = {}) {
  let t = 0;
  const queue = [];
  const refresh = 1000 / hz;
  const at = (ms) => (asleep && ms > asleep[0] && ms < asleep[1] ? asleep[1] : ms);
  const raf = (cb) => { const when = at((Math.floor(t / refresh + 1e-9) + 1) * refresh); queue.push({ when, run: () => cb(when) }); };
  const timer = (cb, ms) => queue.push({ when: at(t + ms + late), run: cb });
  let advanced = 0, frames = 0, longest = 0, gap = 0, last = 0;
  runFrames((steps, now, before) => {
    advanced += sum(steps);
    frames++;
    longest = Math.max(longest, ...steps);
    gap = Math.max(gap, now - before);
    last = now;
    return pace;
  }, { raf, timer, clock: () => t });
  for (;;) {
    queue.sort((a, b) => a.when - b.when);
    const next = queue.shift();
    if (next.when > seconds * 1000) break;
    t = next.when;
    next.run();
  }
  return { advanced, frames, longest, end: last / 1000, gap: gap / 1000 };
}

const DISPLAYS = [30, 50, 60, 75, 90, 120, 144, 165, 240];
const PACES = {
  'hidden, 10 a second by timer': { fps: 10, refresh: false },
  'hidden, 20 a second by timer': { fps: 20, refresh: false },
  'resting, 30 a second by timer': { fps: 30, refresh: false },
  'moving, 60 a second on refreshes': { fps: 60, refresh: true },
  'moving, every refresh': { fps: 0, refresh: true },
};

describe('frame loop', () => {
  for (const [name, pace] of Object.entries(PACES)) {
    it(`keeps the clock on real time on every display: ${name}`, () => {
      for (const hz of DISPLAYS) {
        for (const late of [0, 4]) {
          const run = simulate(hz, pace, 30, { late });
          // the clock reaches the last frame's time, whatever the refresh rate does to the gaps between frames
          expect(run.advanced, `${hz} Hz, timers ${late} ms late`).toBeCloseTo(run.end, 6);
          expect(run.end, `${hz} Hz, timers ${late} ms late`).toBeGreaterThan(30 - .15);
          expect(run.longest).toBeLessThanOrEqual(MAX_STEP + 1e-12);
          // the frames average out to the rate asked for, or the display's when that is lower
          const rate = pace.fps > 0 ? Math.min(pace.fps, hz) : hz;
          expect(Math.abs(run.frames / 30 - rate) / rate, `${hz} Hz, timers ${late} ms late`).toBeLessThan(.05);
        }
      }
    });
  }

  it('drops what a long gap holds past MAX_GAP and goes on from there', () => {
    const run = simulate(60, PACES['hidden, 10 a second by timer'], 30, { asleep: [10_000, 20_000] });
    expect(run.gap).toBeGreaterThan(10);
    expect(run.advanced).toBeCloseTo(run.end - run.gap + MAX_GAP, 6);
    expect(run.longest).toBeLessThanOrEqual(MAX_STEP + 1e-12);
  });

  it('cuts a frame\'s time into equal steps of at most MAX_STEP', () => {
    expect(stepsFor(.016)).toEqual([.016]);
    expect(stepsFor(MAX_STEP)).toEqual([MAX_STEP]);
    const steps = stepsFor(.0555);
    expect(steps).toHaveLength(2);
    expect(sum(steps)).toBeCloseTo(.0555, 12);
    expect(sum(stepsFor(5))).toBeCloseTo(MAX_GAP, 12);
    expect(Math.max(...stepsFor(5))).toBeLessThanOrEqual(MAX_STEP);
    expect(stepsFor(0)).toEqual([0]);
    expect(stepsFor(-.01)).toEqual([0]);
  });
});
