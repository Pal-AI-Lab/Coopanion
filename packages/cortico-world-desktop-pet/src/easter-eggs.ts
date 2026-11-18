import type { ModelText } from './model-text.ts';

export interface EggAction {
  word: string;
  asset: string;
  width: number;
  height: number;
  durationMs: number;
}

export interface EasterEgg {
  id: keyof ModelText['holiday'];
  year?: number;
  month: number;
  day: number;
  decoration?: { kind: string; fromDay: number };
  action?: EggAction;
}

export const FIREWORKS_2027 = 'fireworks_2027';

export const EASTER_EGGS: readonly EasterEgg[] = [
  { id: 'christmas', month: 12, day: 25, decoration: { kind: 'christmasHat', fromDay: 24 } },
  {
    id: 'newYear2027', year: 2027, month: 1, day: 1,
    action: { word: FIREWORKS_2027, asset: 'new-year-2027.svg', width: 520, height: 310, durationMs: 6500 },
  },
];

export function isEggDay(egg: EasterEgg, date: Date, fromDay = egg.day): boolean {
  return (egg.year === undefined || egg.year === date.getFullYear()) && egg.month === date.getMonth() + 1
    && date.getDate() >= fromDay && date.getDate() <= egg.day;
}

export function nextLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
