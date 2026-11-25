/**
 * The settings window's motion choice: the desktop-pet World's `window.motion` (low, medium, high, or system),
 * which the pet's pages get through their prefs. The window paints from the copy in localStorage before anything
 * renders, then takes the config's value; the 「习惯」 page changes it (console/features/pet).
 */
import { setMotionChoice, type MotionChoice } from 'cortico-world-desktop-pet/web/motion-level.js';
import { get, type RequestOptions } from './api.ts';

export const MOTION_GROUP = 'world:desktop-pet';
export const MOTION_KEY = 'worlds.desktop-pet.window.motion';
const CACHE = 'companion.motion';

function cached(win: Window): string | null {
  try { return win.localStorage.getItem(CACHE); } catch { return null; }
}

/** Applies the choice this window saw last; 'system' when it has seen none. */
export function applyCachedMotion(win: Window): void {
  setMotionChoice(win, cached(win) ?? 'system');
}

/** Applies `choice` and keeps it for the next start. Anything but a choice counts as 'system'. */
export function useMotionChoice(win: Window, choice: unknown): MotionChoice {
  const next: MotionChoice = choice === 'low' || choice === 'medium' || choice === 'high' ? choice : 'system';
  setMotionChoice(win, next);
  try { win.localStorage.setItem(CACHE, next); } catch { /* a window without storage starts from the system */ }
  return next;
}

interface ConfigGroups { groups?: { group: { id: string }; values?: Record<string, unknown> }[] }

/** Reads the config's choice and applies it; a Core that cannot be reached keeps the cached one. */
export async function loadMotionChoice(win: Window, opts?: RequestOptions): Promise<void> {
  try {
    const d = await get<ConfigGroups>('/api/config', opts);
    const values = d.groups?.find((g) => g.group.id === MOTION_GROUP)?.values;
    if (values) useMotionChoice(win, values[MOTION_KEY]);
  } catch { /* offline: the cached choice stays */ }
}
