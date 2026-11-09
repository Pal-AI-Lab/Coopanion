/**
 * An operation's error, shown in a popover beside the control that started it until dismissed:
 * the control shakes and the popover follows it while the page scrolls. Long messages scroll
 * inside it. One popover per page; a new error replaces the last.
 */
import './problem.css';
import { closeLabel } from './strings.ts';
function icon(doc: Document, name: 'close' | 'alert', cls = 'icon'): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.75'); svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', name === 'close' ? 'M6 6l12 12M18 6L6 18' : 'M12 8v5m0 3h.01M10.3 3.9L1.8 18.5A1 1 0 0 0 2.7 20h18.6a1 1 0 0 0 .9-1.5L13.7 3.9a2 2 0 0 0-3.4 0');
  svg.append(path); return svg;
}
import type { Disposable, WebUi } from 'cortico/web/shared/client-panel.ts';

/** Reacquire a re-rendered control when the original node leaves the page. */
export type ProblemAnchor = Element | (() => Element | null | undefined);
export interface ProblemPopover { show(anchor: ProblemAnchor, text: string): void; hide(): void; readonly open: boolean }
const popovers = new WeakMap<Document, WeakMap<AbortSignal, ProblemPopover>>();

/** Capture the initiating control before awaiting. A removed or offscreen control uses a dismissible toast. */
export function actionProblem(ui: WebUi, doc: Document, signal: AbortSignal, language?: string) {
  const popup = problemPopover(doc, signal, language);
  let notification: Disposable | undefined;
  signal.addEventListener('abort', () => notification?.dispose(), { once: true });
  return (anchor: Element | null | undefined, text: string): void => {
    if (signal.aborted) return;
    notification?.dispose(); notification = undefined;
    const rect = anchor?.getBoundingClientRect();
    const scroller = anchor ? scrollerOf(anchor)?.getBoundingClientRect() : null;
    if (problemAnchorVisible(anchor) && rect && rect.bottom > Math.max(0, scroller?.top ?? 0)
      && rect.top < Math.min(doc.documentElement.clientHeight, scroller?.bottom ?? Infinity)) popup.show(anchor, text);
    else { popup.hide(); notification = ui.toast(text, 'bad'); }
  };
}

/** A control can remain mounted while its page, drawer or disclosure is hidden. */
export function problemAnchorVisible(anchor: Element | null | undefined): anchor is Element {
  if (!anchor?.isConnected || anchor.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const win = anchor.ownerDocument.defaultView!;
  for (let node: Element | null = anchor; node; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if ((node as HTMLElement).inert) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node instanceof win.HTMLDetailsElement && !node.open && !node.querySelector('summary')?.contains(anchor)) return false;
  }
  return true;
}

/** A failed list read stays with that list; retry never repeats a mutation. */
export function listProblem(doc: Document, text: string, label: string | undefined = undefined, retry?: () => Promise<unknown>): HTMLElement {
  const box = doc.createElement('div'); box.className = 'extension-list-problem'; box.setAttribute('role', 'status');
  const message = doc.createElement('span'); message.textContent = text;
  if (!retry) { box.append(message); return box; }
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'btn secondary sm'; button.textContent = label ?? '↻';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await retry(); }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error); }
    finally { button.disabled = false; }
  });
  box.append(message, button); return box;
}

/** The nearest ancestor that scrolls vertically. */
export function scrollerOf(el: Element | null): HTMLElement | null {
  const win = el?.ownerDocument.defaultView;
  for (let node = el?.parentElement ?? null; node && win; node = node.parentElement) {
    const overflow = win.getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/** A wheel event's vertical distance in pixels. */
export function wheelDelta(event: WheelEvent): number {
  return event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (event.view?.innerHeight ?? 800) : 1);
}

export function problemPopover(doc: Document, signal: AbortSignal, language = doc.documentElement.lang): ProblemPopover {
  if (signal.aborted) return { show() {}, hide() {}, open: false };
  let pagePopovers = popovers.get(doc);
  if (!pagePopovers) { pagePopovers = new WeakMap(); popovers.set(doc, pagePopovers); }
  const existing = pagePopovers.get(signal);
  if (existing) return existing;
  const win = doc.defaultView!;
  const box = doc.createElement('div'); box.className = 'extension-problem hidden'; box.setAttribute('role', 'alert');
  doc.body.append(box);
  signal.addEventListener('abort', () => box.remove(), { once: true });
  let anchor: Element | null = null, find: (() => Element | null | undefined) | null = null;
  const hide = () => { box.classList.add('hidden'); anchor = find = null; };
  const place = () => {
    if (find && !anchor?.isConnected) anchor = find() ?? null;
    if (!problemAnchorVisible(anchor)) { hide(); return; }
    const target = anchor.getBoundingClientRect(), view = doc.documentElement;
    const region = anchor.closest<HTMLElement>('.modalcard, .extension-toolbar, .world-catalog-scroll, .world-workspace, .extension-category, .connection-detail, .connection-index, .featureslot, .panelslot');
    const bounds = region?.getBoundingClientRect(), style = region ? win.getComputedStyle(region) : null;
    let minLeft = Math.max(8, bounds?.width ? bounds.left + (region?.clientLeft ?? 0) + Math.max(8, parseFloat(style!.paddingLeft) || 0) : 8);
    let maxRight = Math.min(view.clientWidth - 8, bounds?.width ? bounds.left + (region?.clientLeft ?? 0) + (region?.clientWidth || bounds.width) - Math.max(8, parseFloat(style!.paddingRight) || 0) : view.clientWidth - 8);
    if (anchor !== region && region?.matches('.featureslot, .panelslot')) {
      let content = anchor;
      while (content.parentElement && content.parentElement !== region) content = content.parentElement;
      const column = content.getBoundingClientRect();
      if (column.width) { minLeft = Math.max(minLeft, column.left); maxRight = Math.min(maxRight, column.right); }
    }
    box.style.setProperty('--problem-available-width', `${Math.max(0, maxRight - minLeft)}px`);
    const tip = box.getBoundingClientRect();
    const below = target.bottom + 10, above = target.top - tip.height - 10;
    const flip = below + tip.height > view.clientHeight - 8 && above > 8;
    const left = Math.max(minLeft, Math.min(target.right - tip.width + 12, maxRight - tip.width));
    box.classList.toggle('is-above', flip);
    box.style.top = `${Math.max(8, Math.min(flip ? above : below, view.clientHeight - tip.height - 8))}px`; box.style.left = `${left}px`;
    box.style.setProperty('--problem-arrow', `${Math.max(14, Math.min(tip.width - 14, target.left + target.width / 2 - left))}px`);
  };
  box.addEventListener('wheel', event => {
    const message = (event.target as Element).closest('.extension-problem-text');
    if (message && message.scrollHeight > message.clientHeight) return;
    const target = scrollerOf(anchor);
    if (target) { event.preventDefault(); target.scrollBy({ top: wheelDelta(event) }); }
  }, { passive: false, signal });
  doc.addEventListener('pointerdown', event => { if (anchor && !box.contains(event.target as Node)) hide(); }, { signal });
  doc.addEventListener('click', event => { if (anchor?.contains(event.target as Node)) hide(); }, { capture: true, signal });
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, { signal });
  doc.addEventListener('scroll', () => { if (anchor) place(); }, { capture: true, passive: true, signal });
  win.addEventListener('resize', () => { if (anchor) place(); }, { signal });
  const observer = new win.MutationObserver(records => {
    if (anchor && records.some(record => !box.contains(record.target) && (record.type === 'childList' || (record.target as Element).contains(anchor)))) place();
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'open', 'class', 'style', 'data-view'] });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  const result: ProblemPopover = {
    hide,
    get open() { return !!anchor; },
    show(target, text) {
      if (signal.aborted) return;
      const close = doc.createElement('button'); close.type = 'button'; close.className = 'extension-problem-close';
      close.setAttribute('aria-label', closeLabel(language)); close.append(icon(doc, 'close'));
      close.addEventListener('click', hide, { signal });
      const message = doc.createElement('span'); message.className = 'extension-problem-text'; message.textContent = text;
      box.replaceChildren(icon(doc, 'alert', 'icon extension-problem-mark'), message, close);
      if (typeof target === 'function') { find = target; anchor = target() ?? null; } else { find = null; anchor = target; }
      box.classList.remove('hidden'); place();
      if (!anchor) return;
      box.animate?.([{ opacity: 0, transform: 'translateY(-4px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 130, easing: 'ease-out' });
      anchor.animate?.([0, -5, 5, -3, 2, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 290, easing: 'ease-out' });
    },
  };
  pagePopovers.set(signal, result);
  return result;
}
