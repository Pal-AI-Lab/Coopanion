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
  nudge: '[闲暇] 你闲下来了。用 pet_say 主动和主人说一两句话：关心、提醒、提问或分享个念头，用你自己的性格和口吻。（规则：先 pet_say 说话，然后才能 end_turn；不许不说话就结束。）',
};

const en = {
  nudge: '[idle] You are free for a moment. Use pet_say to say a line or two to your person: care, a reminder, a question or a thought, in your own voice. (Rule: pet_say first, end_turn after; never end the turn without speaking.)',
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
    /** Whether the bot is up to talking (not asleep); a false skips with a short retry. */
    awake?: () => boolean;
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

  /** A suppressed beat retries soon, so a nap never swallows a whole cycle. */
  private retry(): void {
    this.timer = setTimeout(() => this.fire(), 60_000);
  }

  private fire(): void {
    this.timer = null;
    const s = this.a.settings();
    const now = this.now();
    const hour = this.a.hourOf ? this.a.hourOf(now) : new Date(now).getHours();
    // 睡着、hold 中、免打扰时段都不说话，但只等一分钟再试，不吞掉整个周期
    if ((this.a.awake && !this.a.awake()) || now < this.heldUntil || quietAt(s, hour)) return this.retry();
    this.a.push(nudgeText(this.a.language()));
    this.schedule();
  }
}
