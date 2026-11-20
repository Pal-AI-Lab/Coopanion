// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bubblePreview } from '../console/features/pet/bubble-preview.ts';
import { S } from '../console/features/pet/strings.ts';

let life, frames, now;
beforeEach(() => {
  life = new AbortController();
  frames = []; now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
});
afterEach(() => { life.abort(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

/** Runs the sample's frames for `seconds` of its clock, 50 ms a frame. */
function advance(seconds) {
  for (let left = seconds; left > 1e-9; left -= .05) {
    now += 50;
    const due = frames; frames = [];
    for (const cb of due) cb(now);
  }
}
function mount(settings = {}) {
  const preview = bubblePreview(document, life.signal, () => ({ size: 1, font: 1, speed: 1, sayHoldSec: 0, saidHoldSec: 0, status: false, said: true, ...settings }));
  document.body.append(preview.el);
  const q = (cls) => preview.el.querySelector(cls);
  const up = (el) => !el.hidden && !el.classList.contains('is-fading');
  return { play: () => q('.bubble-preview-play').click(), said: q('.pv-heard'), say: q('.pv-say'), up, preview, frame: q('.bubble-preview-frame') };
}
const [first, last] = S.previewReply;

it('in automatic mode your line leaves half a second after the reply is written out, before the reply goes', () => {
  const { play, said, say, up } = mount();
  play();
  advance(.5);
  expect(up(said)).toBe(true);
  for (let i = 0; i < 400 && say.textContent !== last; i++) advance(.05);
  expect(say.textContent).toBe(last);
  advance(.4);
  expect([up(said), up(say)]).toEqual([true, true]);
  advance(.2);
  expect([up(said), up(say)]).toEqual([false, true]);
});

it('a click on Coo\'s line closes the whole reply, and your line follows half a second later', () => {
  const { play, said, say, up } = mount();
  play();
  for (let i = 0; i < 200 && !up(say); i++) advance(.05);
  advance(.2);
  say.click();
  expect(up(say)).toBe(false);
  advance(.4);
  expect(up(said)).toBe(true);
  advance(.2);
  expect(up(said)).toBe(false);
  // the later line never comes
  advance(3);
  expect(say.textContent).not.toBe(last);
});

it('pointing at Coo\'s written line holds it, and leaving lets it go on', () => {
  const { play, say } = mount();
  play();
  // at rest the first line already shows written out: wait for it to be typed again
  advance(1.5);
  for (let i = 0; i < 400 && say.textContent !== first; i++) advance(.05);
  say.dispatchEvent(new PointerEvent('pointerenter'));
  advance(10);
  expect(say.textContent).toBe(first);
  say.dispatchEvent(new PointerEvent('pointerleave'));
  advance(5);
  expect(say.textContent).not.toBe(first);
});

it('a size changed while Coo\'s line types keeps what is typed of it', () => {
  const { play, say, preview, frame } = mount();
  // the sample fits its bubbles only once it is laid out
  Object.defineProperty(frame, 'clientWidth', { get: () => 440 });
  play();
  for (let i = 0; i < 200 && say.hidden; i++) advance(.05);
  advance(.3);
  const typed = say.textContent;
  expect(typed.length).toBeGreaterThan(0);
  expect(typed).not.toBe(first);
  preview.refresh();
  expect(say.textContent).toBe(typed);
  expect(say.querySelector('.pv-caret')).not.toBeNull();
});

it('at rest a bubble clicked away comes back a moment later; playing, it stays closed', () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  const { play, said, say, up } = mount();
  said.click(); say.click();
  expect([up(said), up(say)]).toEqual([false, false]);
  vi.advanceTimersByTime(1500);
  expect([up(said), up(say)]).toEqual([true, true]);
  play();
  advance(.5);
  said.click();
  vi.advanceTimersByTime(1500);
  advance(.5);
  expect(up(said)).toBe(false);
  vi.useRealTimers();
});
