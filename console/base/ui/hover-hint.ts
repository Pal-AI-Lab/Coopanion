/**
 * Hover hints. A plain `title` would bring up the system's own tooltip; instead the hint moves to
 * `data-tip` the first time the pointer reaches it and shows a moment later in the console's box
 * (`.u-tip`): under the element, or above it when there is no room below. A title set again later
 * replaces the hint the next time. Text an ellipsis or a line clamp cuts short, with no title of its own,
 * has its full text as the hint. In the rail, only an item's name cut short has one, in the open rail: folded, the
 * rail's own tooltip names its items, and a title there, such as a World status dot's, is only taken away.
 */
import { hideTip, showTip } from './tip.ts';
const DELAY_MS = 450;
const EDGE = 8;

/** Moves the element's title into `data-tip`, keeping what it told a screen reader; returns the hint. */
function takeTitle(el: HTMLElement): string {
  const title = el.getAttribute('title');
  if (title !== null) {
    el.removeAttribute('title');
    if (title) {
      el.dataset.tip = title;
      // A title named an element with nothing else to name it, and described one that had.
      if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title);
      else if (!el.hasAttribute('aria-description') && el.getAttribute('aria-label') !== title) el.setAttribute('aria-description', title);
    } else delete el.dataset.tip;
  }
  return el.dataset.tip ?? '';
}

export function mountHoverHints(doc: Document, signal: AbortSignal): void {
  const win = doc.defaultView!;
  const box = doc.createElement('div');
  box.className = 'u-tip hover-hint hidden';
  box.setAttribute('aria-hidden', 'true');
  doc.body.append(box);
  let current: HTMLElement | null = null;
  let timer = 0;

  /** Leaving one element for another, or for none: the hint fades out; a press, a key or a scroll hides it at once. */
  const hide = (soft = false): void => { win.clearTimeout(timer); current = null; hideTip(box, !soft); };
  const show = (el: HTMLElement, text: string): void => {
    if (!el.isConnected) return;
    hideTip(box, true);
    box.textContent = text;
    showTip(box);
    const rect = el.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = box;
    const below = rect.bottom + 6;
    box.style.top = `${below + height > win.innerHeight - EDGE ? Math.max(EDGE, rect.top - 6 - height) : below}px`;
    box.style.left = `${Math.max(EDGE, Math.min(win.innerWidth - width - EDGE, rect.left + rect.width / 2 - width / 2))}px`;
  };

  const cutText = (el: HTMLElement): string => {
    const style = win.getComputedStyle(el);
    if (style.textOverflow !== 'ellipsis' && (style.webkitLineClamp || 'none') === 'none') return '';
    const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    return cut ? el.textContent?.trim() ?? '' : '';
  };

  doc.addEventListener('pointerover', (event) => {
    const target = event.target as Element;
    // anywhere on an item of the open rail stands for its name
    const name = target.closest?.('#rail:not(.is-collapsed) a.navitem')?.querySelector<HTMLElement>('.lbl');
    if (name) {
      // a title in it (a World's status dot) is only taken away, as elsewhere in the rail
      const titled = target.closest<HTMLElement>('[title]');
      if (titled) takeTitle(titled);
      const text = cutText(name);
      if (name === current) return;
      hide(true);
      if (!text) return;
      current = name;
      timer = win.setTimeout(() => show(name, text), DELAY_MS);
      return;
    }
    const titled = target.closest?.<HTMLElement>('[title], [data-tip]');
    const cut = !titled && target instanceof win.HTMLElement ? cutText(target) : '';
    const el = titled ?? (cut ? target as HTMLElement : null);
    if (el === current) return;
    hide(true);
    if (!el || el instanceof HTMLIFrameElement) return;
    const text = titled ? takeTitle(el) : cut;
    // In the rail a title (a World's status dot) is only taken away: the rail shows no hints.
    if (!text || el.closest('#rail')) return;
    current = el;
    timer = win.setTimeout(() => show(el, text), DELAY_MS);
  }, { signal });
  doc.addEventListener('pointerout', (event) => {
    const to = event.relatedTarget as Node | null;
    // a rail name's hint stays while the pointer moves about its item
    if (current && !current.contains(to) && !(current.closest('a.navitem')?.contains(to))) hide(true);
  }, { signal });
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) doc.addEventListener(type, () => hide(), { capture: true, signal });
  doc.addEventListener('scroll', () => hide(), { capture: true, passive: true, signal });
  win.addEventListener('blur', () => hide(), { signal });
  signal.addEventListener('abort', () => { win.clearTimeout(timer); hideTip(box, true); box.remove(); }, { once: true });
}
