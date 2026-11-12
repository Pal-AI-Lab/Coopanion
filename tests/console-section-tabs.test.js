// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sectionTabs } from '../console/base/ui/section-tabs.ts';

let life;
beforeEach(() => {
  life = new AbortController();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  // a frame at once: the line moves within the scroll event
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(0); return 0; });
});
afterEach(() => { life.abort(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** A page 400 px tall scrolling over three 500 px sections; the held heading's bottom is 60 px down. */
function page() {
  const scroller = document.createElement('div');
  scroller.style.scrollPaddingTop = '60px';
  let top = 0;
  Object.defineProperties(scroller, {
    scrollTop: { get: () => top, set: (v) => { top = v; } },
    clientHeight: { value: 400 }, scrollHeight: { value: 1500 },
  });
  scroller.getBoundingClientRect = () => ({ top: 0 });
  const items = ['a', 'b', 'c'].map((value, i) => {
    const el = document.createElement('section');
    el.getBoundingClientRect = () => ({ top: i * 500 - top });
    el.scrollIntoView = vi.fn();
    scroller.append(el);
    return { value, label: value.toUpperCase(), el };
  });
  document.body.append(scroller);
  const tabs = sectionTabs(document, life.signal, scroller, items);
  scroller.prepend(tabs.el);
  const current = () => tabs.el.querySelector('.pagetab.active')?.dataset.label;
  const scrollTo = (y) => { top = y; scroller.dispatchEvent(new Event('scroll')); };
  return { scroller, items, tabs, current, scrollTo };
}

it('jumps to a section on a click, keeping the page one page', () => {
  const { items, tabs, current } = page();
  tabs.el.querySelectorAll('button')[1].click();
  expect(items[1].el.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  expect(current()).toBe('B');
  // a place in the page, not another page
  expect(tabs.el.querySelector('.pagetab.active').getAttribute('aria-current')).toBe('location');
});

it('goes back to the very top for the first section', () => {
  const { scroller, items, tabs, current } = page();
  scroller.scrollTo = vi.fn();
  tabs.el.querySelectorAll('button')[0].click();
  expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  expect(items[0].el.scrollIntoView).not.toHaveBeenCalled();
  expect(current()).toBe('A');
});

it('follows the section being read while the page is scrolled by hand', () => {
  const { scroller, current, scrollTo } = page();
  scroller.dispatchEvent(new Event('wheel'));
  scrollTo(480);
  expect(current()).toBe('B');
  scrollTo(100);
  expect(current()).toBe('A');
  // at the end, the last section, even when its top cannot reach the heading
  scrollTo(1100);
  expect(current()).toBe('C');
});

it('keeps a clicked section that cannot reach the top until the page is scrolled by hand', () => {
  const { scroller, tabs, current, scrollTo } = page();
  tabs.el.querySelectorAll('button')[1].click();
  // the glide passes other sections and may end at the page's end
  scrollTo(1100);
  expect(current()).toBe('B');
  scroller.dispatchEvent(new Event('wheel'));
  scrollTo(1100);
  expect(current()).toBe('C');
});
