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

/** The held heading's bottom, the scroller's `scroll-padding-top`. */
const INSET = 60;

/** The page's end: the last section is 200 px tall, so its top is still 200 px down there, below the heading. */
const END = 800;

/**
 * A page 400 px tall scrolling over two 500 px sections and a last one of 200 px. Scrolling moves the page and fires
 * `scroll` as a browser does: `scrollIntoView` puts the section's top at the scroll padding, `scrollTo` goes where
 * it is told, both held within the page's ends.
 */
function page() {
  const scroller = document.createElement('div');
  scroller.style.scrollPaddingTop = `${INSET}px`;
  let top = 0;
  Object.defineProperties(scroller, {
    scrollTop: { get: () => top, set: (v) => { top = v; } },
    clientHeight: { value: 400 }, scrollHeight: { value: END + 400 },
  });
  scroller.getBoundingClientRect = () => ({ top: 0 });
  const scrollTo = (y) => { top = Math.max(0, Math.min(END, y)); scroller.dispatchEvent(new Event('scroll')); };
  scroller.scrollTo = ({ top: y }) => scrollTo(y);
  const items = ['a', 'b', 'c'].map((value, i) => {
    const el = document.createElement('section');
    el.getBoundingClientRect = () => ({ top: i * 500 - top });
    el.scrollIntoView = () => scrollTo(i * 500 - INSET);
    scroller.append(el);
    return { value, label: value.toUpperCase(), el };
  });
  document.body.append(scroller);
  const tabs = sectionTabs(document, life.signal, scroller, items);
  scroller.prepend(tabs.el);
  const current = () => tabs.el.querySelector('.pagetab.active')?.dataset.label;
  const click = (i) => tabs.el.querySelectorAll('button')[i].click();
  return { scroller, items, tabs, current, click, scrollTo };
}

it('jumps to a section on a click and hands it the focus, keeping the page one page', () => {
  const { scroller, items, tabs, current, click } = page();
  click(1);
  expect(scroller.scrollTop).toBe(500 - INSET);
  expect(current()).toBe('B');
  // the next Tab goes on inside the section
  expect(document.activeElement).toBe(items[1].el);
  expect(items[1].el.tabIndex).toBe(-1);
  // a place in the page, not another page
  expect(tabs.el.querySelector('.pagetab.active').getAttribute('aria-current')).toBe('location');
});

it('goes back to the very top for the first section', () => {
  const { scroller, items, current, click, scrollTo } = page();
  scrollTo(700);
  click(0);
  // the first section's top would sit at the scroll padding; the page's top is above it
  expect(scroller.scrollTop).toBe(0);
  expect(current()).toBe('A');
  expect(document.activeElement).toBe(items[0].el);
});

it('follows the section being read while the page is scrolled by hand, its top counted from under the heading', () => {
  const { scroller, current, scrollTo } = page();
  scroller.dispatchEvent(new Event('wheel'));
  // B's top 50 px down: under the heading, so B is read, though it is still below the scroller's own top
  scrollTo(450);
  expect(current()).toBe('B');
  // B's top 100 px down: past the heading and the slack, so A is still read
  scrollTo(400);
  expect(current()).toBe('A');
  // at the end, the last section, even when its top cannot reach the heading
  scrollTo(END);
  expect(current()).toBe('C');
});

it('keeps a clicked section that cannot reach the top until the page is scrolled by hand', () => {
  const { scroller, current, click, scrollTo } = page();
  click(1);
  // the glide passes other sections and may end at the page's end, where the last one counts as read
  scrollTo(END);
  expect(current()).toBe('B');
  scroller.dispatchEvent(new Event('wheel'));
  scrollTo(END);
  expect(current()).toBe('C');
});
