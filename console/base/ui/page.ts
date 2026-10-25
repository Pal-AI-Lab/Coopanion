import type { WebUi } from 'cortico/web/shared/client-panel.ts';

export function pageIntro(ui: Pick<WebUi, 'h'>, title: string, description?: string): HTMLElement {
  const intro = ui.h('header', 'featureintro');
  intro.appendChild(ui.h('h1', 'pagetitle', title));
  if (description) intro.appendChild(ui.h('p', 'pagedesc', description));
  return intro;
}

/** Keep native scroll tracks and focused content below the slot's sticky controls. */
export function watchPageScrollInset(slot: HTMLElement, signal: AbortSignal): void {
  const view = slot.ownerDocument.defaultView;
  if (!view?.ResizeObserver) return;
  let controls: Element[] = [];
  const place = (): void => {
    const top = slot.getBoundingClientRect().top;
    const inset = Math.max(0, ...controls.map(control => control.getBoundingClientRect().bottom - top));
    const value = inset + 'px';
    if (slot.style.getPropertyValue('--page-scroll-inset') !== value) slot.style.setProperty('--page-scroll-inset', value);
  };
  const size = new view.ResizeObserver(place);
  const refresh = (): void => {
    size.disconnect();
    controls = Array.from(slot.children).filter(child => view.getComputedStyle(child).position === 'sticky');
    for (const child of slot.children) size.observe(child);
    place();
  };
  const children = new view.MutationObserver(refresh);
  children.observe(slot, { childList: true });
  slot.addEventListener('scroll', place, { passive: true, signal });
  refresh();
  signal.addEventListener('abort', () => {
    children.disconnect();
    size.disconnect();
    slot.style.removeProperty('--page-scroll-inset');
  }, { once: true });
}
