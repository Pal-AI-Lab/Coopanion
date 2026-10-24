/**
 * Setting a hotkey from a page: the talk key in the `voice` panel and the typing key on the
 * settings window's 「习惯」 page. A hotkey is written as src/asr/hotkey.ts reads it: key names joined
 * by `+`, then `*2` or `*3` for quick taps before the press that counts.
 */

/** `KeyboardEvent.code` → the key names `src/asr/hotkey.ts` reads. */
const CODE_KEYS: Record<string, string> = {
  ControlLeft: 'LeftCtrl', ControlRight: 'RightCtrl', AltLeft: 'LeftAlt', AltRight: 'RightAlt',
  ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', MetaLeft: 'Win', MetaRight: 'RightWin',
  Space: 'Space', Tab: 'Tab', CapsLock: 'CapsLock', Backquote: 'Backquote', Enter: 'Enter', Insert: 'Insert',
  Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Pause: 'Pause', ScrollLock: 'ScrollLock',
};
const keyOfCode = (code: string): string | null =>
  CODE_KEYS[code] ?? (/^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) ? code : null);

/** Press counts offered beside a hotkey, the default first; three only for a key already set to it. */
export const PRESSES = [2, 1, 3];

/** The keys and the press count of a hotkey, as `splitTaps` in src/asr/hotkey.ts reads it. */
export const splitTaps = (hotkey: string): { combo: string; taps: number } => {
  const m = /^(.*?)\s*\*\s*([1-3])$/.exec(hotkey.trim());
  return m ? { combo: m[1]!, taps: Number(m[2]) } : { combo: hotkey.trim(), taps: 1 };
};
export const withTaps = (combo: string, taps: number) => (taps > 1 ? `${combo}*${taps}` : combo);

/**
 * Listens on `win` for a new combination: every key down until the first release, or the middle or a
 * side mouse button with the keys held then. `done` gets the combination, or null for Esc and for
 * `stop`, which ends the listening early.
 */
export function captureKey(win: Window, done: (combo: string | null) => void): { stop(): void } {
  const held: string[] = [];
  const finish = (combo: string | null) => {
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('keyup', onKeyUp, true);
    win.removeEventListener('pointerdown', onPointer, true);
    done(combo);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { finish(null); return; }
    const k = keyOfCode(e.code);
    if (k && !held.includes(k)) held.push(k);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (held.length) finish(held.join('+'));
  };
  const onPointer = (e: PointerEvent) => {
    const k = ({ 1: 'Mouse3', 3: 'Mouse4', 4: 'Mouse5' } as Record<number, string>)[e.button];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    finish([...held, k].join('+'));
  };
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('keyup', onKeyUp, true);
  win.addEventListener('pointerdown', onPointer, true);
  return { stop: () => finish(null) };
}
