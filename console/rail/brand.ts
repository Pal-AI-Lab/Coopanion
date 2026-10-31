import { coopanionLettering } from '../branding.ts';
import { brandMark, christmasHat } from '../base/ui/icons.ts';

/** The same C and two eyes form the wordmark and the compact mark; CSS moves their strokes. */
export function sidebarBrand(doc: Document, signal: AbortSignal): HTMLDivElement {
  const lockup = doc.createElement('div');
  lockup.className = 'companion-lockup';
  lockup.setAttribute('role', 'img');
  lockup.setAttribute('aria-label', 'Coopanion');

  const mark = brandMark(doc, 'companion-brand');
  const lettering = coopanionLettering(doc);
  mark.setAttribute('viewBox', lettering.getAttribute('viewBox')!);
  mark.children[0]!.classList.add('companion-brand-c');
  mark.children[1]!.classList.add('companion-brand-o-first');
  mark.children[2]!.classList.add('companion-brand-o-second');

  const tail = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  tail.classList.add('companion-brand-tail');
  tail.setAttribute('stroke-width', '16');
  tail.setAttribute('stroke-linejoin', 'round');
  tail.append(...Array.from(lettering.children).slice(3));
  mark.append(tail);
  lockup.append(mark);

  const hat = christmasHat(doc);
  hat.classList.add('companion-brand-c', 'companion-brand-hat');

  // Rechecked at local midnight and on focus or visibility changes.
  const win = doc.defaultView!;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  const refresh = (): void => {
    clearTimeout(midnightTimer);
    const now = new Date();
    if (now.getMonth() === 11 && (now.getDate() === 24 || now.getDate() === 25)) mark.append(hat);
    else hat.remove();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(refresh, midnight.getTime() - now.getTime());
  };
  refresh();
  win.addEventListener('focus', refresh, { signal });
  doc.addEventListener('visibilitychange', refresh, { signal });
  signal.addEventListener('abort', () => clearTimeout(midnightTimer), { once: true });
  return lockup;
}
