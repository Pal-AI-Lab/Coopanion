/** One line of page badges; overflow remains available on hover, focus and click. */
import { placeOverflowPopover } from './overflow-popover.ts';

export function pageBadges(doc: Document, overlayHost: HTMLElement, signal: AbortSignal, badges: readonly HTMLElement[]): HTMLElement {
  const view = doc.defaultView!;
  const row = doc.createElement('div');
  row.className = 'pagedesc page-badge-row';
  row.tabIndex = -1;
  const more = doc.createElement('button');
  more.type = 'button';
  more.className = 'pill page-badge-more';
  more.setAttribute('aria-expanded', 'false');
  const pop = doc.createElement('div');
  pop.className = 'page-badge-pop';
  pop.id = 'page-badges-' + view.crypto.randomUUID();
  pop.setAttribute('role', 'tooltip');
  pop.tabIndex = -1;
  pop.hidden = true;
  more.setAttribute('aria-describedby', pop.id);
  overlayHost.append(pop);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(hideTimer);
    pop.hidden = true;
    more.setAttribute('aria-expanded', 'false');
  };
  const show = (): void => {
    clearTimeout(hideTimer);
    if (!pop.childElementCount) return;
    pop.hidden = false;
    placeOverflowPopover(pop, more, row);
    more.setAttribute('aria-expanded', 'true');
  };
  const hasFocus = (): boolean => doc.activeElement === more || pop.contains(doc.activeElement);
  const hideSoon = (): void => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!hasFocus()) hide(); }, 180);
  };
  for (const el of [more, pop]) {
    el.addEventListener('mouseenter', show, { signal });
    el.addEventListener('mouseleave', hideSoon, { signal });
  }
  more.addEventListener('focus', show, { signal });
  for (const el of [more, pop] as HTMLElement[]) el.addEventListener('focusout', event => {
    if (event.relatedTarget !== more && !pop.contains(event.relatedTarget as Node | null)) hide();
  }, { signal });
  more.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); show(); pop.focus({ preventScroll: true }); }
  }, { signal });
  more.addEventListener('click', show, { signal });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || pop.hidden) return;
    if (pop.contains(doc.activeElement)) more.focus({ preventScroll: true });
    hide();
  }, { signal });
  doc.addEventListener('pointerdown', event => {
    if (!more.contains(event.target as Node) && !pop.contains(event.target as Node)) hide();
  }, { signal });
  view.addEventListener('resize', () => { if (!pop.hidden) show(); }, { signal });
  doc.addEventListener('scroll', () => { if (!pop.hidden) show(); }, { capture: true, signal });

  const layout = (): void => {
    if (signal.aborted || !row.isConnected) return;
    const focused = hasFocus() ? doc.activeElement as HTMLElement : null;
    const wasOpen = !pop.hidden;
    const scrollTop = pop.scrollTop;
    row.replaceChildren(...badges);
    pop.replaceChildren();
    const width = row.clientWidth;
    const gap = parseFloat(view.getComputedStyle(row).columnGap) || 0;
    const widths = badges.map(b => b.getBoundingClientRect().width);
    let used = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, badges.length - 1) * gap;
    if (used <= width) {
      hide();
      if (focused) row.focus({ preventScroll: true });
      return;
    }
    row.append(more);
    let count = badges.length;
    do {
      count--;
      used -= widths[count] + (count ? gap : 0);
      more.textContent = `+${badges.length - count}`;
    } while (count > 0 && used + gap + more.getBoundingClientRect().width > width);
    row.replaceChildren(...badges.slice(0, count), more);
    pop.replaceChildren(...badges.slice(count));
    if (wasOpen) show();
    focused?.focus({ preventScroll: true });
    if (!wasOpen) hide();
    pop.scrollTop = scrollTop;
  };
  row.append(...badges);
  const frame = view.requestAnimationFrame(layout);
  const resize = view.ResizeObserver ? new view.ResizeObserver(layout) : null;
  resize?.observe(row);
  void doc.fonts?.ready.then(() => { if (!signal.aborted) layout(); });
  signal.addEventListener('abort', () => {
    view.cancelAnimationFrame(frame);
    resize?.disconnect();
    clearTimeout(hideTimer);
    pop.remove();
  }, { once: true });
  return row;
}
