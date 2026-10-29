// @vitest-environment jsdom
/** The settings window's reflow motion (`console/base/motion.ts`). jsdom lays nothing out and animates nothing, so both are stubbed. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureReflow } from '../console/base/motion.ts';

const tops = new Map();
const rect = (top) => ({ top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40 });
let played = [];
function item(key, top) {
  const el = document.createElement('div'); el.className = 'item'; el.dataset.key = key; tops.set(el, top);
  return el;
}
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () { return tops.has(this) ? rect(tops.get(this)) : rect(0); });
  HTMLElement.prototype.animate = function (frames, options) { const animation = { id: options?.id ?? '', frames, finished: new Promise(() => {}), cancel() {} }; played.push([this, animation]); return animation; };
  HTMLElement.prototype.getAnimations = () => [];
}
afterEach(() => { vi.restoreAllMocks(); delete HTMLElement.prototype.animate; delete HTMLElement.prototype.getAnimations; tops.clear(); played = []; document.body.replaceChildren(); });

describe('measureReflow', () => {
  it('slides what stays, fades in what appears and leaves a fading copy of what went', () => {
    stubLayout();
    const list = document.createElement('div'); document.body.append(list);
    const a = item('a', 0), b = item('b', 50), c = item('c', 100);
    list.append(a, b, c);
    const reflow = measureReflow(list, '.item', el => el.dataset.key);
    b.remove(); tops.set(c, 50);
    const d = item('d', 100); list.append(d);
    reflow.play();
    const of = (el) => played.filter(([target]) => target === el).map(([, animation]) => animation.frames[0]);
    expect(of(a)).toEqual([]);
    expect(of(c)).toEqual([{ transform: 'translate(0px, 50px)' }]);
    expect(of(d)[0]).toMatchObject({ opacity: 0 });
    const ghost = list.querySelector('.motion-ghost');
    expect(ghost.dataset.key).toBeUndefined();
    expect(ghost.inert).toBe(true);
    expect(ghost.style.top).toBe('50px');
    expect(of(ghost)[0]).toMatchObject({ opacity: 1 });
  });
  it('does nothing for a first render or with reduced motion', () => {
    stubLayout();
    const list = document.createElement('div'); document.body.append(list);
    measureReflow(list, '.item', el => el.dataset.key).play();
    list.append(item('a', 0));
    measureReflow(list, '.item', el => el.dataset.key).play();
    expect(played).toEqual([]);
    window.matchMedia = () => ({ matches: true });
    const reflow = measureReflow(list, '.item', el => el.dataset.key);
    list.firstElementChild.remove(); reflow.play();
    expect(list.querySelector('.motion-ghost')).toBeNull();
    delete window.matchMedia;
  });
});
