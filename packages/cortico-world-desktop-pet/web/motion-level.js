/**
 * How much interface motion a window shows: 'low', 'medium' or 'high'. Coo's own body is not part of it
 * (walking has its own setting). The choice is 'system' (the default: 'low' when the system asks for reduced
 * motion, 'high' otherwise) or one of the levels. `watchMotion` writes the level on the root element as
 * `data-motion`, which the stylesheets read, and keeps it current as the system setting changes; scripts ask
 * `motionLevel`. Used by the pet's pages and, bundled, by the settings window.
 */

const QUERY = '(prefers-reduced-motion: reduce)';
const LEVELS = ['low', 'medium', 'high'];
/** @type {WeakMap<Window, string>} */
const choices = new WeakMap();
/** @type {WeakSet<Window>} */
const watched = new WeakSet();

const systemLevel = (win) => (win?.matchMedia?.(QUERY).matches ? 'low' : 'high');

/** The level for `win`: its choice, or the system's when the choice is 'system'. */
export function motionLevel(win) {
  if (!win) return 'high';
  const choice = choices.get(win);
  if (choice && LEVELS.includes(choice)) return choice;
  return systemLevel(win);
}

const apply = (win) => { win.document.documentElement.dataset.motion = motionLevel(win); };

/** Sets `win`'s choice ('system', 'low', 'medium' or 'high'; anything else counts as 'system') and applies it. */
export function setMotionChoice(win, choice) {
  choices.set(win, LEVELS.includes(choice) ? choice : 'system');
  if (watched.has(win)) apply(win);
}

/** Writes `data-motion` on `win`'s root now and whenever the level changes. Calling it again does nothing. */
export function watchMotion(win) {
  if (watched.has(win)) return;
  watched.add(win);
  apply(win);
  win.matchMedia?.(QUERY).addEventListener?.('change', () => apply(win));
}
