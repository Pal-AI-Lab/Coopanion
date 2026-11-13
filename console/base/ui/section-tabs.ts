/**
 * Page tabs (`pageTabs`) that jump within one long page instead of switching views: each names a section, a click glides
 * the page there (the section's top just under the page's held heading, through the slot's `scroll-padding-top`), and
 * scrolling by hand moves the line to the section being read. Put `el` in the page's heading (`pageIntro`), which is
 * held at the top, so the tabs stay at hand. A jump also moves the focus to the section (focusable by script only).
 */
import { pageTabs, type PageTabs } from './page-tabs.ts';

export interface SectionTabItem {
  value: string;
  label: string;
  el: HTMLElement;
}

/** How far past the heading a section's top may be and still count as the one being read, in pixels. */
const READ_SLACK = 24;

export function sectionTabs(doc: Document, signal: AbortSignal, scroller: HTMLElement, items: readonly SectionTabItem[]): PageTabs {
  const win = doc.defaultView!;
  /** The section a click went to: it keeps the line until the page is scrolled by hand, even if it cannot reach the top. */
  let held: string | null = null;
  const tabs = pageTabs(doc, signal, items, {
    value: items[0]?.value,
    // a click on the section the line is on still goes to its top
    reselect: true,
    current: 'location',
    onSelect: (value) => {
      const item = items.find((i) => i.value === value);
      if (!item) return;
      held = value;
      tabs.setValue(value);
      const still = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const behavior = still ? 'auto' : 'smooth';
      // the first section: back to the page's very top, as it was opened
      if (item === items[0]) scroller.scrollTo({ top: 0, behavior });
      else item.el.scrollIntoView({ block: 'start', behavior });
      // the next Tab goes on inside the section, not back to the controls at the page's top
      item.el.focus({ preventScroll: true });
    },
  });
  tabs.el.classList.add('sectiontabs');
  for (const i of items) if (!i.el.hasAttribute('tabindex')) i.el.tabIndex = -1;

  /** The section being read: the last one whose top is above the heading's bottom; the last one once the page is at its end. */
  function reading(): string | undefined {
    const shown = items.filter((i) => !i.el.hidden && i.el.isConnected);
    if (!shown.length) return undefined;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) return shown[shown.length - 1].value;
    const inset = parseFloat(win.getComputedStyle(scroller).scrollPaddingTop) || 0;
    const line = scroller.getBoundingClientRect().top + inset + READ_SLACK;
    let current = shown[0].value;
    for (const i of shown) if (i.el.getBoundingClientRect().top <= line) current = i.value;
    return current;
  }
  let frame = 0;
  scroller.addEventListener('scroll', () => {
    if (held || frame) return;
    frame = win.requestAnimationFrame(() => { frame = 0; const v = reading(); if (v) tabs.setValue(v); });
  }, { passive: true, signal });
  // scrolling by hand lets the line follow the page again
  const free = () => { held = null; };
  for (const type of ['wheel', 'touchstart', 'keydown'] as const) scroller.addEventListener(type, free, { passive: true, signal });
  // a press on the scrollbar, not on a tab (the tabs sit in the scroller, in the held heading)
  scroller.addEventListener('pointerdown', (e) => { if (!tabs.el.contains(e.target as Node)) free(); }, { passive: true, signal });
  signal.addEventListener('abort', () => win.cancelAnimationFrame(frame), { once: true });
  return tabs;
}
