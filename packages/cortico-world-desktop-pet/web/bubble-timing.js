export const BUBBLE_HOLD_MAX_SEC = 60;

/** Time to read a fully written speech bubble, also used in the World's speech receipt. */
export function sayHoldSeconds(length, last, speed, holdSec = 0) {
  return holdSec || (last ? 1.6 + length * .07 : .9 + length * .03) / speed;
}
