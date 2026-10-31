import { coopanionLettering } from '../branding.ts';
import { brandMark } from '../base/ui/icons.ts';

/** The same C and two eyes form the wordmark and the compact mark; CSS moves their strokes. */
export function sidebarBrand(doc: Document, signal: AbortSignal): HTMLDivElement {
  const lockup = doc.createElement('div');
  lockup.className = 'companion-lockup';
  lockup.setAttribute('role', 'img');
  lockup.setAttribute('aria-label', 'Coopanion');

  const mark = brandMark(doc, 'companion-brand');
  const lettering = coopanionLettering(doc);
  mark.setAttribute('viewBox', lettering.getAttribute('viewBox')!);
  const c = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  c.classList.add('companion-brand-c');
  c.append(mark.children[0]!);
  mark.children[0]!.classList.add('companion-brand-o-first');
  mark.children[1]!.classList.add('companion-brand-o-second');
  mark.prepend(c);

  const tail = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  tail.classList.add('companion-brand-tail');
  tail.setAttribute('stroke-width', '16');
  tail.setAttribute('stroke-linejoin', 'round');
  tail.append(...Array.from(lettering.children).slice(3));
  mark.append(tail);
  lockup.append(mark);

  const hat = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  hat.classList.add('companion-brand-hat');
  hat.setAttribute('transform', 'translate(-38 6) rotate(-18 128 40) translate(256 0) scale(-1 1)');
  hat.setAttribute('stroke', 'none');
  hat.innerHTML = `
    <path fill="#d94743" d="M55 39C65 7 78-36 111-46C149-58 182-28 200 9L179 20C165-4 151-17 136-13C145 3 159 21 170 42Z"/>
    <path fill="#fff9f0" stroke="#cdbdaf" stroke-width="2" d="M51 31Q112 22 176 34Q186 36 185 48Q184 60 174 59Q111 48 52 57Q41 58 41 46Q40 34 51 31Z"/>
    <circle cx="195" cy="15" r="16" fill="#fff9f0" stroke="#cdbdaf" stroke-width="2"/>
  `;

  // Local calendar days, refreshed at midnight and when the window returns from sleep.
  const win = doc.defaultView!;
  let midnightTimer: number;
  const refresh = (): void => {
    win.clearTimeout(midnightTimer);
    const now = new Date();
    if (now.getMonth() === 11 && (now.getDate() === 24 || now.getDate() === 25)) c.append(hat);
    else hat.remove();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = win.setTimeout(refresh, midnight.getTime() - now.getTime());
  };
  refresh();
  win.addEventListener('focus', refresh, { signal });
  doc.addEventListener('visibilitychange', refresh, { signal });
  signal.addEventListener('abort', () => win.clearTimeout(midnightTimer), { once: true });
  return lockup;
}
