// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mountScrollbarHover } from '../console/base/ui/scrollbars.ts';

const MARK = 'data-scroll-hover';
let life;
afterEach(() => { life?.abort(); document.body.replaceChildren(); });

/** A box laid out as overflowing (or not) along y; jsdom has no layout of its own. */
function box(parent, { scrolls = true, overflowing = true, hidden = false } = {}) {
  const el = document.createElement('div');
  el.style.overflowY = scrolls ? 'auto' : 'visible';
  if (hidden) el.style.scrollbarWidth = 'none';
  Object.defineProperty(el, 'scrollHeight', { value: overflowing ? 500 : 100 });
  Object.defineProperty(el, 'clientHeight', { value: 100 });
  parent.append(el);
  return el;
}
const over = (el) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));

it('marks every scrolling area with a visible bar under the pointer, and only while it is there', () => {
  life = new AbortController();
  mountScrollbarHover(document, life.signal);
  const left = box(document.body), right = box(document.body);
  const code = box(left);
  const gallery = box(left, { hidden: true });
  const short = box(right, { overflowing: false });

  over(code);
  expect([left.hasAttribute(MARK), code.hasAttribute(MARK), right.hasAttribute(MARK)]).toEqual([true, true, false]);
  // a gallery that hides its bar leaves the column's bar shown
  over(gallery);
  expect([left.hasAttribute(MARK), code.hasAttribute(MARK), gallery.hasAttribute(MARK)]).toEqual([true, false, false]);
  // an area that does not overflow is passed over for the one around it
  over(short);
  expect([left.hasAttribute(MARK), right.hasAttribute(MARK), short.hasAttribute(MARK)]).toEqual([false, true, false]);

  document.documentElement.dispatchEvent(new PointerEvent('pointerleave'));
  expect(document.querySelector(`[${MARK}]`)).toBeNull();
});
