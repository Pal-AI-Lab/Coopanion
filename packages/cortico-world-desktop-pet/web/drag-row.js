/**
 * Reordering a row by dragging, as the settings window reorders its lists (console/base/drag.ts), across instead
 * of down: the pressed item lifts out as a copy that follows the pointer along the row with the pointer hidden,
 * and stays behind as an empty place the row moves to where it would land, the items it passes sliding aside.
 * Near the row's ends the row scrolls, faster the nearer the pointer is. Esc, a cancelled pointer or the window
 * losing focus puts the item back. `drop(order)` gets the items' keys in their new order when it changed.
 */
const DRAG_SLOP = 4, SCROLL_EDGE = 56, SCROLL_MAX = 18;

/**
 * Wired once on `root`, which outlives the rows drawn in it: `item(target)` is the item a press on `target` lifts, or
 * null (a button in it), its parent being the scrolling row; `key(el)` an item's key; `copyClass` the lifted copy's class.
 */
export function dragRow(root, { item, key, copyClass, drop }) {
  const doc = root.ownerDocument, win = doc.defaultView;
  let press = null, lift = null, row = null;
  const items = () => [...row.children].filter((el) => !el.classList.contains(copyClass));

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || lift) return;
    const el = item(e.target);
    if (el) press = { id: e.pointerId, x: e.clientX, y: e.clientY, el, source: e.target };
  });
  // an image inside would start the browser's own drag, which cancels this one
  root.addEventListener('dragstart', (e) => { if (press) e.preventDefault(); });

  function start(e) {
    const { el } = press, box = el.getBoundingClientRect();
    row = el.parentElement;
    const copy = el.cloneNode(true);
    copy.classList.add(copyClass);
    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, { width: `${box.width}px`, height: `${box.height}px`, top: `${box.top}px`, left: `${box.left}px` });
    doc.body.append(copy);
    lift = { el, copy, offset: press.x - box.left, x: e.clientX, home: el.nextElementSibling, before: items().map(key).join('\n'), frame: 0 };
    el.classList.add('is-dragging');
    doc.documentElement.classList.add('is-list-dragging');
    row.style.scrollBehavior = 'auto';
    win.getSelection()?.removeAllRanges();
    try { press.source.setPointerCapture?.(e.pointerId); } catch { /* the drag goes on without capture */ }
  }

  /** Keeps the copy under the pointer, inside the row. */
  function place() {
    const box = row.getBoundingClientRect(), w = lift.copy.offsetWidth;
    lift.copy.style.left = `${Math.max(box.left, Math.min(lift.x - lift.offset, box.right - w))}px`;
  }

  /** Moves the empty place to where a drop at the pointer would land; the items it passes slide aside. */
  function locate() {
    const others = items().filter((el) => el !== lift.el);
    const next = others.find((el) => { const b = el.getBoundingClientRect(); return lift.x < b.left + b.width / 2; }) ?? null;
    if (lift.el.nextElementSibling === next) return;
    const from = new Map(others.map((el) => [el, el.getBoundingClientRect().left]));
    row.insertBefore(lift.el, next);
    for (const [el, left] of from) {
      const d = left - el.getBoundingClientRect().left;
      if (Math.abs(d) > .5) el.animate?.([{ transform: `translateX(${d}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.32,.72,0,1)' });
    }
  }

  /** Scrolls the row while the pointer is near its ends, faster the nearer it is. */
  function scroll() {
    if (!lift) return;
    lift.frame = 0;
    const box = row.getBoundingClientRect(), x = lift.x;
    const depth = x < box.left + SCROLL_EDGE ? x - box.left - SCROLL_EDGE : x > box.right - SCROLL_EDGE ? x - box.right + SCROLL_EDGE : 0;
    if (!depth) return;
    const was = row.scrollLeft;
    row.scrollLeft += Math.sign(depth) * Math.max(1, Math.min(SCROLL_MAX, Math.abs(depth) / SCROLL_EDGE * SCROLL_MAX));
    if (row.scrollLeft === was) return;
    locate(); place();
    lift.frame = win.requestAnimationFrame(scroll);
  }

  win.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!lift) { if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP) return; start(e); }
    e.preventDefault();
    lift.x = e.clientX;
    locate(); place();
    if (!lift.frame) lift.frame = win.requestAnimationFrame(scroll);
  });

  win.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    if (!lift) return;
    // the click that follows a drag, in the same turn, is the drop, not a click on the item
    const swallow = (stop) => { stop.stopPropagation(); stop.preventDefault(); };
    win.addEventListener('click', swallow, { capture: true, once: true });
    win.setTimeout(() => win.removeEventListener('click', swallow, { capture: true }), 0);
    const { el, copy, before } = lift, from = copy.getBoundingClientRect().left, at = row;
    end();
    // the item slides in from where its copy showed
    const d = from - el.getBoundingClientRect().left;
    if (Math.abs(d) > .5) el.animate?.([{ transform: `translateX(${d}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.32,.72,0,1)' });
    const order = [...at.children].map(key);
    if (order.join('\n') !== before) drop(order);
  });

  const abandon = () => {
    press = null;
    if (!lift) return;
    const { el, home } = lift, at = row;
    end();
    at.insertBefore(el, home);
  };
  win.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.id) abandon(); });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lift) abandon(); });
  win.addEventListener('blur', abandon);

  function end() {
    if (!lift) return;
    if (lift.frame) win.cancelAnimationFrame(lift.frame);
    lift.copy.remove();
    lift.el.classList.remove('is-dragging');
    doc.documentElement.classList.remove('is-list-dragging');
    row.style.scrollBehavior = '';
    lift = null;
    row = null;
  }
}
