/**
 * The bot's own idle nudge (主动搭话): left alone for a while it wakes itself
 * with an internal event — the alarm's trick (`core/alarms.ts`) on a rhythm
 * instead of a clock — and says something of its own accord.
 *
 * The text here is only a nudge; what is actually said is the persona's own
 * doing, so no catchphrases travel between characters and the line never
 * repeats a stock library. The rhythm is random between `minMinutes` and
 * `maxMinutes`, skipping the `quietFrom..quietTo` hours (wrapping midnight;
 * equal means never quiet) and anything held back by `hold()`.
 */
import type { ModelLanguage } from './language.ts';

export type IdleRate = 'never' | 'low' | 'medium' | 'high';

export interface IdleTalkSettings {
  rate: IdleRate;
  /** Quiet from this hour (0–23); the stretch wraps midnight. Equal: never quiet. */
  quietFrom: number;
  quietTo: number;
}

export const IDLE_DEFAULTS: IdleTalkSettings = { rate: 'medium', quietFrom: 23, quietTo: 8 };

/** Minutes between nudges by rate; `never` schedules nothing at all. */
export const RATE_MINUTES: Record<IdleRate, [number, number] | null> = {
  never: null,
  low: [25, 60],
  medium: [8, 25],
  high: [2, 8],
};

const zh = {
  nudge: '[闲暇] 你这会儿闲下来了，主动和主人说句话吧：一两句就好，用你自己的性格和口吻，可以关心、提醒、好奇提问或分享一个念头。不要报幕，不要提闲下来这件事，不要重复最近说过的内容；若感觉主人正忙，就简短些或不说。',
};

const en = {
  nudge: '[idle] You have a quiet moment. Say something to your person of your own accord: a line or two, in your own voice — care, a reminder, a curious question or a thought. No announcements, no mention of being idle, nothing you said recently; if they seem busy, keep it short or skip it.',
};

/** The nudge handed to the model, in the model-text language. */
export function nudgeText(language: ModelLanguage): string {
  return (language === 'zh' ? zh : en).nudge;
}

/** Whether `hour` falls in the quiet stretch. */
export function quietAt(s: IdleTalkSettings, hour: number): boolean {
  if (s.quietFrom === s.quietTo) return false;
  return s.quietFrom > s.quietTo
    ? hour >= s.quietFrom || hour < s.quietTo
    : hour >= s.quietFrom && hour < s.quietTo;
}

export class IdleTalk {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heldUntil = 0;

  constructor(private a: {
    settings: () => IdleTalkSettings;
    language: () => ModelLanguage;
    /** Delivers the nudge as an internal event and wakes the model. */
    push: (text: string) => void;
    now?: () => number;
    /** The local hour, by the app's clock; tests pass their own. */
    hourOf?: (now: number) => number;
  }) {}

  start(): void {
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Holds every nudge for `ms`, e.g. while the person is talking to the bot. */
  hold(ms: number): void {
    this.heldUntil = Math.max(this.heldUntil, this.now() + ms);
  }

  private now(): number {
    return this.a.now?.() ?? Date.now();
  }

  private schedule(): void {
    const range = RATE_MINUTES[this.a.settings().rate] ?? null;
    if (!range) return;
    const [min, max] = range;
    this.timer = setTimeout(() => this.fire(), (min + Math.random() * (max - min)) * 60_000);
  }

  private fire(): void {
    this.timer = null;
    const s = this.a.settings();
    const now = this.now();
    const hour = this.a.hourOf ? this.a.hourOf(now) : new Date(now).getHours();
    if (!quietAt(s, hour) && now >= this.heldUntil) this.a.push(nudgeText(this.a.language()));
    this.schedule();
  }
}
