import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { wheelInto } from '../shared/ui/problem.ts';

describe('a wheel turned over a box on top of a scroller (shared/ui/problem.ts wheelInto)', () => {
  let win;
  afterEach(() => win?.close());

  function scroller() {
    win = new JSDOM('<!doctype html><body><div></div></body>', { pretendToBeVisual: true }).window;
    const el = win.document.querySelector('div');
    let top = 0;
    Object.defineProperty(el, 'scrollHeight', { value: 2000 });
    Object.defineProperty(el, 'clientHeight', { value: 400 });
    Object.defineProperty(el, 'scrollTop', { get: () => top, set: (v) => { top = v; } });
    const wheel = (deltaY, more = {}) => { const e = new win.WheelEvent('wheel', { deltaY, cancelable: true, ...more }); wheelInto(el, e); return e; };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
    return { el, wheel, settle };
  }

  it('glides rather than jumping, and goes as far as the steps add up to', async () => {
    const { el, wheel, settle } = scroller();
    wheel(100);
    expect(el.scrollTop).toBe(0);
    wheel(100);
    wheel(100);
    await settle();
    expect(el.scrollTop).toBe(300);
  });

  it('stops at the ends', async () => {
    const { el, wheel, settle } = scroller();
    for (let i = 0; i < 30; i++) wheel(100);
    await settle();
    expect(el.scrollTop).toBe(1600);
    wheel(-5000);
    await settle();
    expect(el.scrollTop).toBe(0);
  });

  it('stops gliding when the scroller is moved some other way meanwhile', async () => {
    const { el, wheel, settle } = scroller();
    for (let i = 0; i < 5; i++) wheel(100);
    await new Promise((resolve) => setTimeout(resolve, 40));
    // the scrollbar dragged back to the top
    el.scrollTop = 0;
    await settle();
    expect(el.scrollTop).toBe(0);
    // the next turn starts from there
    wheel(100);
    await settle();
    expect(el.scrollTop).toBe(100);
  });

  it('leaves Ctrl with the wheel and a sideways wheel to the browser', () => {
    const { wheel } = scroller();
    expect(wheel(100, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(0, { deltaX: 100 }).defaultPrevented).toBe(false);
    expect(wheel(100).defaultPrevented).toBe(true);
  });
});
