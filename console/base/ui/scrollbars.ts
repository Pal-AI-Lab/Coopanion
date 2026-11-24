/**
 * Which scrolling areas the pointer is over: every element under it that scrolls with a scrollbar (a
 * column, and a code block in it) carries `data-scroll-hover`, and styles.css shows those scrollbars'
 * thumbs. Chromium does not repaint a custom scrollbar when its element's :hover changes; an attribute
 * change restyles the element and its scrollbar with it.
 */

const MARK = 'data-scroll-hover';

/** Whether `el` shows a scrollbar: it scrolls along an axis it overflows on, and its bar is not hidden. */
function scrolls(el: Element, view: Window): boolean {
  const style = view.getComputedStyle(el);
  if (style.scrollbarWidth === 'none') return false;
  return (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight)
    || (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth);
}

export function mountScrollbarHover(doc: Document, signal: AbortSignal): void {
  const view = doc.defaultView!;
  let marked: Element[] = [];
  const mark = (next: Element[]) => {
    for (const el of marked) if (!next.includes(el)) el.removeAttribute(MARK);
    for (const el of next) if (!el.hasAttribute(MARK)) el.setAttribute(MARK, '');
    marked = next;
  };
  doc.addEventListener('pointerover', (event) => {
    const next: Element[] = [];
    for (let el = event.target instanceof Element ? event.target : null; el; el = el.parentElement) if (scrolls(el, view)) next.push(el);
    mark(next);
  }, { passive: true, signal });
  doc.documentElement.addEventListener('pointerleave', () => mark([]), { signal });
  signal.addEventListener('abort', () => mark([]), { once: true });
}
