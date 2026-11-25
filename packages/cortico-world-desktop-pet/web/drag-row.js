/**
 * Reordering a row by dragging, across: drag.js with the copy fixed in the window and kept inside the row. The pressed
 * item lifts out as a copy that follows the pointer along the row with the pointer hidden, and stays behind as an
 * empty place the row moves to where it would land, the items it passes sliding aside. Near the row's ends the row
 * scrolls, faster the nearer the pointer is. Esc, a cancelled pointer or the window losing focus slides the item, and
 * the items it passed, back where they were. `drop(order)` gets the items' keys in their new order when it changed.
 */
import { dragItems, moveGap, settledBox, slideIn } from './drag.js';

/**
 * Wired once on `root`, which outlives the rows drawn in it: `item(target)` is the item a press on `target` lifts, or
 * null (a button in it), its parent being the scrolling row; `key(el)` an item's key; `copyClass` the lifted copy's class.
 */
export function dragRow(root, { item, key, copyClass, drop }) {
  // the pressed item and its row (known at the press: the row scrolls from the start of the drag), where it started
  let lifted = null, row = null, home = null, before = '';
  const items = () => [...row.children].filter((el) => !el.classList.contains(copyClass));
  const others = () => items().filter((el) => el !== lifted);
  dragItems(root, {
    axis: 'x',
    pick(target) {
      const el = item(target);
      if (el) { lifted = el; row = el.parentElement; }
      return el;
    },
    scroller: () => row,
    copyClass,
    lifted() {
      home = lifted.nextElementSibling;
      before = items().map(key).join('\n');
    },
    /** The empty place goes before the first item whose middle (where it settles, not mid-slide) is past the pointer. */
    locate(x) {
      const next = others().find((el) => { const b = settledBox(el); return x < b.left + b.width / 2; }) ?? null;
      moveGap(lifted, row, next, others(), 'x');
    },
    drop(el, from) {
      // the item slides in from where its copy showed
      slideIn(el, from - el.getBoundingClientRect().left, 'x');
      const order = items().map(key);
      if (order.join('\n') !== before) drop(order);
    },
    cancel() {
      const was = lifted.getBoundingClientRect().left;
      moveGap(lifted, row, home, others(), 'x');
      slideIn(lifted, was - lifted.getBoundingClientRect().left, 'x');
    },
  });
}
