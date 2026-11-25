/**
 * Showing and hiding an element with an entrance and an exit its stylesheet animates: `entering` while it comes in
 * (for `enterMs`), `leaving` while it goes (for the `ms` given to `hide`), then hidden. The pet's menu, hover buttons,
 * look wheel and size slider, the pet's hover hints (hints.js) and, bundled, the settings window's hint boxes
 * (console/base/ui/tip.ts) all go through it. At low motion (motion-level.js) it hides at once.
 *
 * `hiddenClass` hides by a class instead of the `hidden` attribute (the settings window's `.u-tip.hidden`).
 */
import { motionLevel } from './motion-level.js';

export function showHide(el, { enterMs = () => 0, hiddenClass = null } = {}) {
  const win = el.ownerDocument.defaultView;
  let enter = 0, leave = 0;
  const setHidden = (hidden) => { if (hiddenClass) el.classList.toggle(hiddenClass, hidden); else el.hidden = hidden; };
  const isHidden = () => (hiddenClass ? el.classList.contains(hiddenClass) : el.hidden);
  const api = {
    get hidden() { return isHidden(); },
    get leaving() { return el.classList.contains('leaving'); },
    /** Shows it from the start of its entrance, cutting short whatever it was doing. */
    show() {
      api.hideNow();
      setHidden(false);
      const ms = enterMs();
      if (ms > 0) { el.classList.add('entering'); enter = win.setTimeout(() => el.classList.remove('entering'), ms); }
    },
    /** Shows it without an entrance; one leaving is called back where it is. */
    reveal() { api.stay(); setHidden(false); },
    /** Plays its exit for `ms`, then hides it; at once at low motion or when `now`. */
    hide(ms, now = false) {
      win.clearTimeout(enter); win.clearTimeout(leave);
      el.classList.remove('entering');
      if (now || motionLevel(win) === 'low' || isHidden()) { el.classList.remove('leaving'); setHidden(true); return; }
      el.classList.add('leaving');
      leave = win.setTimeout(() => { el.classList.remove('leaving'); setHidden(true); }, ms);
    },
    /** Hides it at once, cancelling an entrance or exit under way. */
    hideNow() {
      win.clearTimeout(enter); win.clearTimeout(leave);
      el.classList.remove('entering', 'leaving');
      setHidden(true);
    },
    /** Calls back an exit under way: it stays as it is. */
    stay() {
      win.clearTimeout(leave);
      el.classList.remove('leaving');
    },
  };
  return api;
}
