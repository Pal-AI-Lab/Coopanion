export const BUBBLE_HOLD_AUTO_SEC = 0;
export const BUBBLE_HOLD_MIN_SEC = 1;
export const BUBBLE_HOLD_MAX_SEC = 60;
export const BUBBLE_TYPING_CPS = 20;
export const SAY_ACTION_LEAD_SEC = .45;
export const SAY_ACTION_ONLY_HOLD_SEC = .8;

/** Time to read a fully written speech bubble, also used in the World's speech receipt. */
export function sayHoldSeconds(length, last, speed, holdSec = BUBBLE_HOLD_AUTO_SEC) {
  return holdSec > BUBBLE_HOLD_AUTO_SEC ? holdSec : (last ? 1.6 + length * .07 : .9 + length * .03) / speed;
}
