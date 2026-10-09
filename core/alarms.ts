/**
 * Wake-ups Coo sets for itself (`alarm_set`, `alarm_list`, `alarm_cancel` of the `coopanion` World).
 * Nothing in the app shows them: when one is due Coo gets an internal event and is woken, as if it
 * had remembered on its own. They are kept in `alarms.json` in the deployment directory, so they
 * outlive a restart; one that fell due while the app was closed is delivered at the next start,
 * saying when it was meant for. A daily one is then set for its next day.
 *
 * Tool descriptions are English; receipts and the due event are in the model-text language.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ToolDef } from 'cortico/core/types.ts';
import type { ModelLanguage } from './language.ts';

export interface Alarm {
  id: string;
  /** When it is due, epoch ms. */
  at: number;
  note: string;
  daily: boolean;
  /** When it was set, epoch ms. */
  setAt: number;
}

interface Saved { next: number; alarms: Alarm[] }

const DAY_MS = 86_400_000;
/** A due alarm this much past its time was missed while the app was closed (the World looks every second). */
const MISSED_AFTER_MS = 60_000;

const zh = {
  minutesTooFew: 'in_minutes 至少是 1',
  noTime: '要给 at 或 in_minutes',
  past: (at: string) => `${at} 已经过去了`,
  badAt: (got: string) => `at 应为 HH:MM 或 YYYY-MM-DD HH:MM,收到 ${got}`,
  due: (setAt: string, id: string, daily: boolean, note: string) => `[唤醒器] 你在 ${setAt} 设的唤醒到了(${id}${daily ? ',每天' : ''}):${note}`,
  missed: (when: string) => `原定 ${when},那时应用没开着,现在才送到。`,
  listLine: (id: string, when: string, daily: boolean, note: string) => `- ${id}:${when}${daily ? '(每天)' : ''} ${note}`,
  noteEmpty: '[alarm_set 没执行] note 不能为空。',
  setFailed: (why: string) => `[alarm_set 没执行] ${why}。`,
  set: (id: string, when: string, daily: boolean) => `已设 ${id}:${when}${daily ? ',之后每天这个时间' : ''}。`,
  none: '没有设着的唤醒器。',
  missing: (id: string) => `[alarm_cancel 没执行] 没有 ${id} 这个唤醒器。`,
  cancelled: (id: string) => `已取消 ${id}。`,
};

const en: typeof zh = {
  minutesTooFew: 'in_minutes must be at least 1',
  noTime: 'give at or in_minutes',
  past: (at) => `${at} has already passed`,
  badAt: (got) => `at must be HH:MM or YYYY-MM-DD HH:MM; got ${got}`,
  due: (setAt, id, daily, note) => `[alarm] The alarm you set at ${setAt} is due (${id}${daily ? ', daily' : ''}): ${note}`,
  missed: (when) => `It was due at ${when}; the app was not running then, so it arrives only now.`,
  listLine: (id, when, daily, note) => `- ${id}: ${when}${daily ? ' (daily)' : ''} ${note}`,
  noteEmpty: '[alarm_set not run] note must not be empty.',
  setFailed: (why) => `[alarm_set not run] ${why}.`,
  set: (id, when, daily) => `Set ${id}: ${when}${daily ? ', then at this time every day' : ''}.`,
  none: 'No alarms set.',
  missing: (id) => `[alarm_cancel not run] There is no alarm ${id}.`,
  cancelled: (id) => `Cancelled ${id}.`,
};

const ALARM_TEXT: Record<ModelLanguage, typeof zh> = { zh, en };

/** UTC minus local, in minutes, for `timezone` at `d`. */
function offsetMinutes(timezone: string, d: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return (d.getTime() - d.getMilliseconds() - local) / 60_000;
}

/** Epoch ms of a wall-clock time in `timezone`. */
export function localToEpoch(timezone: string, y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess + offsetMinutes(timezone, new Date(guess)) * 60_000;
  // across a daylight-saving change the offset at the result can differ from the guess's
  return guess + offsetMinutes(timezone, new Date(first)) * 60_000;
}

/** `MM-DD HH:MM` in `timezone`. */
export function localLabel(timezone: string, ms: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * When an alarm asked for as `at` (`HH:MM`, the next such time; or `YYYY-MM-DD HH:MM`) or
 * `inMinutes` is due, or why it cannot be set (in `language`).
 */
export function dueTime(timezone: string, now: number, at: unknown, inMinutes: unknown, language: ModelLanguage = 'zh'): number | string {
  const t = ALARM_TEXT[language];
  if (typeof inMinutes === 'number') {
    if (!(inMinutes >= 1)) return t.minutesTooFew;
    return now + Math.round(inMinutes * 60_000);
  }
  if (typeof at !== 'string') return t.noTime;
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(at.trim());
  if (full) {
    const ms = localToEpoch(timezone, +full[1]!, +full[2]!, +full[3]!, +full[4]!, +full[5]!);
    return ms > now ? ms : t.past(at);
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!clock || +clock[1]! > 23 || +clock[2]! > 59) return t.badAt(JSON.stringify(at));
  const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const ms = localToEpoch(timezone, +today.year!, +today.month!, +today.day!, +clock[1]!, +clock[2]!);
  return ms > now ? ms : ms + DAY_MS;
}

export class Alarms {
  private saved: Saved;

  /** `language`: the model-text language, read at each use. */
  constructor(private readonly file: string, private readonly timezone: string, private readonly language: () => ModelLanguage = () => 'zh') {
    this.saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Saved : { next: 1, alarms: [] };
  }

  private get t(): typeof zh {
    return ALARM_TEXT[this.language()];
  }

  private save(): void {
    writeFileSync(this.file, `${JSON.stringify(this.saved, null, 2)}\n`);
  }

  /** Takes the alarms due at `now` off the list (a daily one is set again for its next day), each with whether it was missed. */
  takeDue(now: number): Array<{ alarm: Alarm; missed: boolean }> {
    const due = this.saved.alarms.filter((a) => a.at <= now);
    if (!due.length) return [];
    this.saved.alarms = this.saved.alarms.filter((a) => a.at > now);
    for (const a of due) {
      if (!a.daily) continue;
      let at = a.at;
      while (at <= now) at += DAY_MS;
      this.saved.alarms.push({ ...a, at });
    }
    this.save();
    return due.map((alarm) => ({ alarm, missed: now - alarm.at > MISSED_AFTER_MS }));
  }

  dueText(alarm: Alarm, missed: boolean): string {
    const t = this.t;
    return [
      t.due(localLabel(this.timezone, alarm.setAt), alarm.id, alarm.daily, alarm.note),
      ...(missed ? [t.missed(localLabel(this.timezone, alarm.at))] : []),
    ].join('\n');
  }

  tools(now: () => number = Date.now): ToolDef[] {
    const tz = this.timezone;
    const list = () => this.saved.alarms.slice().sort((a, b) => a.at - b.at)
      .map((a) => this.t.listLine(a.id, localLabel(tz, a.at), a.daily, a.note)).join('\n');
    return [
      {
        name: 'alarm_set',
        tags: ['write'],
        description: 'Set an alarm for yourself: when it is due you are woken by an event carrying the note as you wrote it. The person does not see alarms. Use one to remind the person on time, to do something at a set time, or to come back and check after a while. One that falls due while the app is closed arrives at the next start, with the time it was meant for.',
        parameters: {
          type: 'object',
          properties: {
            at: { type: 'string', description: 'The person\'s local time: HH:MM (tomorrow if today\'s has passed), or YYYY-MM-DD HH:MM. Give this or in_minutes.' },
            in_minutes: { type: 'number', minimum: 1, description: 'Minutes from now.' },
            note: { type: 'string', description: 'What to do when it is due and why you set it, written for yourself at that time.' },
            daily: { type: 'boolean', description: 'true wakes you at this time every day until alarm_cancel.' },
          },
          required: ['note'],
        },
        handler: async (args) => {
          const t = this.t;
          const note = typeof args.note === 'string' ? args.note.trim() : '';
          if (!note) return { text: t.noteEmpty, failed: true };
          const time = now();
          const at = dueTime(tz, time, args.at, args.in_minutes, this.language());
          if (typeof at === 'string') return { text: t.setFailed(at), failed: true };
          const alarm: Alarm = { id: `a${this.saved.next++}`, at, note, daily: args.daily === true, setAt: time };
          this.saved.alarms.push(alarm);
          this.save();
          return { text: t.set(alarm.id, localLabel(tz, at), alarm.daily) };
        },
      },
      {
        name: 'alarm_list',
        tags: ['read'],
        description: 'List the alarms you have set: id, time (the person\'s local time) and note.',
        parameters: { type: 'object', properties: {} },
        handler: async () => ({ text: this.saved.alarms.length ? list() : this.t.none }),
      },
      {
        name: 'alarm_cancel',
        tags: ['write'],
        description: 'Cancel an alarm; a daily one stops altogether.',
        parameters: { type: 'object', properties: { id: { type: 'string', description: 'The id from the alarm_set receipt or alarm_list, such as a3.' } }, required: ['id'] },
        handler: async (args) => {
          const before = this.saved.alarms.length;
          this.saved.alarms = this.saved.alarms.filter((a) => a.id !== args.id);
          if (this.saved.alarms.length === before) return { text: this.t.missing(JSON.stringify(args.id)), failed: true };
          this.save();
          return { text: this.t.cancelled(String(args.id)) };
        },
      },
    ];
  }
}
