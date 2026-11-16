/**
 * Hover hints, drawn as the settings window draws its own (`console/base/ui/hover-hint.ts`, `.u-tip`): a title
 * moves to `data-tip` the first time the pointer reaches it, and shows a moment later in a box under the
 * element, or above it when there is no room below. With `autoClose` (the desktop pet's own window, where the hints
 * name its hover buttons) it closes on its own after SHOW_MS and does not come back until the pointer has left the
 * element; elsewhere it stays while the pointer does. A title set again later replaces the hint the next time.
 * It fades in and out as the settings window's hover hints do (`.hint`, pet.css; `.u-tip`, console/styles.css).
 */
export const DELAY_MS = 450;
/** How long a hint stays up while the pointer rests on its element, with `autoClose`. */
export const SHOW_MS = 1000;
/** How long a hint takes to fade out (`.hint.leaving`, pet.css). */
export const LEAVE_MS = 120;
const EDGE = 8;

/** A button's hint from its spoken label: the part before ' · ', its name and where it stands; what a click does follows the dot. */
export const tipOf = (label) => label.split('·')[0].trim();
/** `tipOf` without the note in brackets that closes the label. */
export const tipWithoutNote = (label) => tipOf(label).replace(/\s*[（(][^（(]*[）)]$/, '');

function takeTitle(el) {
  const title = el.getAttribute('title');
  if (title !== null) {
    el.removeAttribute('title');
    if (title) {
      el.dataset.tip = title;
      if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title);
    } else delete el.dataset.tip;
  }
  return el.dataset.tip ?? '';
}

export function mountHints(doc, { autoClose = false } = {}) {
  const win = doc.defaultView;
  const box = doc.createElement('div');
  box.className = 'hint';
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true');
  doc.body.append(box);
  let current = null, timer = 0, leave = 0;
  const hideNow = () => { win.clearTimeout(leave); box.classList.remove('leaving'); box.hidden = true; };
  /** Fades the hint out; `current` is kept, so a hint closed on its own does not come back while the pointer stays. */
  const fade = () => {
    if (box.hidden || box.classList.contains('leaving')) return;
    box.classList.add('leaving');
    leave = win.setTimeout(hideNow, LEAVE_MS);
  };
  const hide = (soft) => { win.clearTimeout(timer); current = null; if (soft) fade(); else hideNow(); };
  const show = (el, text) => {
    // an element hidden or fading out since the pointer reached it has no place to show a hint beside
    if (!el.isConnected || el.closest('[hidden], .leaving')) return;
    hideNow();
    box.textContent = text;
    box.hidden = false;
    // `current` stays the element, so moving within it does not bring the hint back
    if (autoClose) timer = win.setTimeout(fade, SHOW_MS);
    const r = el.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = box;
    const below = r.bottom + 6;
    box.style.top = `${below + h > win.innerHeight - EDGE ? Math.max(EDGE, r.top - 6 - h) : below}px`;
    box.style.left = `${Math.max(EDGE, Math.min(win.innerWidth - w - EDGE, r.left + r.width / 2 - w / 2))}px`;
  };
  doc.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[title], [data-tip]');
    if (el === current) return;
    hide(true);
    if (!el) return;
    const text = takeTitle(el);
    if (!text) return;
    current = el;
    timer = win.setTimeout(() => show(el, text), DELAY_MS);
  });
  doc.addEventListener('pointerout', (e) => { if (current && !current.contains(e.relatedTarget)) hide(true); });
  doc.addEventListener('pointerdown', () => hide(false), true);
}
