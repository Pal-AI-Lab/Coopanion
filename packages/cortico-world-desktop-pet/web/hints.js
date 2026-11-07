/**
 * Hover hints, drawn as the settings window draws its own (`console/base/ui/hover-hint.ts`, `.u-tip`): a title
 * moves to `data-tip` the first time the pointer reaches it, and shows a moment later in a box under the
 * element, or above it when there is no room below. A title set again later replaces the hint the next time.
 */
const DELAY_MS = 450;
const EDGE = 8;

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

export function mountHints(doc) {
  const win = doc.defaultView;
  const box = doc.createElement('div');
  box.className = 'hint';
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true');
  doc.body.append(box);
  let current = null, timer = 0;
  const hide = () => { win.clearTimeout(timer); current = null; box.hidden = true; };
  const show = (el, text) => {
    if (!el.isConnected) return;
    box.textContent = text;
    box.hidden = false;
    const r = el.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = box;
    const below = r.bottom + 6;
    box.style.top = `${below + h > win.innerHeight - EDGE ? Math.max(EDGE, r.top - 6 - h) : below}px`;
    box.style.left = `${Math.max(EDGE, Math.min(win.innerWidth - w - EDGE, r.left + r.width / 2 - w / 2))}px`;
  };
  doc.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[title], [data-tip]');
    if (el === current) return;
    hide();
    if (!el) return;
    const text = takeTitle(el);
    if (!text) return;
    current = el;
    timer = win.setTimeout(() => show(el, text), DELAY_MS);
  });
  doc.addEventListener('pointerout', (e) => { if (current && !current.contains(e.relatedTarget)) hide(); });
  doc.addEventListener('pointerdown', hide, true);
}
