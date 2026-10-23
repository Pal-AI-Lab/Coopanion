import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Alarms, dueTime, localLabel } from '../core/alarms.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function alarmFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coo-alarm-time-'));
  dirs.push(dir);
  return join(dir, 'alarms.json');
}

async function setDaily(alarms: Alarms, now: number, at: string): Promise<string> {
  const tool = alarms.tools(() => now).find((t) => t.name === 'alarm_set')!;
  const result = await tool.handler({ at, daily: true, note: 'stretch' }, {} as never) as { text: string; failed?: boolean };
  expect(result.failed).not.toBe(true);
  return result.text;
}

describe('alarm calendar times', () => {
  it.each([
    [Date.UTC(2026, 2, 7, 15), Date.UTC(2026, 2, 8, 13)],
    [Date.UTC(2026, 9, 31, 14), Date.UTC(2026, 10, 1, 14)],
    [Date.UTC(2026, 11, 31, 15), Date.UTC(2027, 0, 1, 14)],
  ])('chooses the next local 09:00 across a calendar boundary from %s', (now, expected) => {
    expect(dueTime('America/New_York', now, '09:00', undefined)).toBe(expected);
  });

  it.each([
    ['America/New_York', '2026-03-08 02:30', Date.UTC(2026, 2, 8, 7, 30)],
    ['Europe/Berlin', '2026-03-29 02:30', Date.UTC(2026, 2, 29, 1, 30)],
    ['Australia/Lord_Howe', '2026-10-04 02:15', Date.UTC(2026, 9, 3, 15, 45)],
  ])('moves a skipped clock time forward by its gap in %s', (zone, at, expected) => {
    expect(dueTime(zone, Date.UTC(2026, 0, 1), at, undefined)).toBe(expected);
  });

  it.each(['2027-00-01 09:00', '2027-13-01 09:00', '2027-01-00 09:00', '2027-02-29 09:00', '2027-02-31 09:00', '2027-01-01 25:00', '2027-01-01 09:75'])('rejects the invalid full timestamp %s', (at) => {
    expect(dueTime('Asia/Shanghai', Date.UTC(2026, 0, 1), at, undefined, 'en')).toContain('at must be');
  });

  it('accepts a leap day', () => {
    expect(dueTime('Asia/Shanghai', Date.UTC(2026, 0, 1), '2028-02-29 09:00', undefined)).toBe(Date.UTC(2028, 1, 29, 1));
  });
});

describe('daily alarm recurrence', () => {
  it('keeps the seconds of a relative reminder and gives in_minutes precedence over at', async () => {
    const now = Date.UTC(2026, 2, 7, 14, 0, 21, 345);
    const alarms = new Alarms(alarmFile(), 'America/New_York');
    const tool = alarms.tools(() => now).find((t) => t.name === 'alarm_set')!;
    await tool.handler({ in_minutes: 1.5, at: '22:00', daily: true, note: 'stretch' }, {} as never);
    const first = now + 90_000;
    expect(alarms.list()[0]?.at).toBe(first);
    alarms.takeDue(first);
    expect(alarms.list()[0]?.at).toBe(Date.UTC(2026, 2, 8, 13, 1, 51, 345));
  });

  it.each([
    ['2026-03-07 09:00', Date.UTC(2026, 2, 7, 14), Date.UTC(2026, 2, 8, 13), '03-08 09:00'],
    ['2026-10-31 09:00', Date.UTC(2026, 9, 31, 13), Date.UTC(2026, 10, 1, 14), '11-01 09:00'],
  ])('keeps local 09:00 after %s and after a restart', async (at, first, next, label) => {
    const file = alarmFile();
    const alarms = new Alarms(file, 'America/New_York');
    await setDaily(alarms, Date.UTC(2026, 0, 1), at);
    expect(alarms.takeDue(first)).toHaveLength(1);
    expect(alarms.list()[0]?.at).toBe(next);
    const reloaded = new Alarms(file, 'America/New_York');
    expect(localLabel('America/New_York', reloaded.list()[0]!.at)).toBe(label);
    expect(reloaded.takeDue(next)).toHaveLength(1);
    expect(reloaded.list()[0]?.at).toBe(next + 86_400_000);
  });

  it.each([
    ['America/New_York', '2026-03-08 02:30', Date.UTC(2026, 2, 8, 7, 30), Date.UTC(2026, 2, 9, 6, 30)],
    ['Europe/Berlin', '2026-03-29 02:30', Date.UTC(2026, 2, 29, 1, 30), Date.UTC(2026, 2, 30, 0, 30)],
  ])('restores the requested clock after a skipped hour in %s', async (zone, at, first, next) => {
    const file = alarmFile();
    const alarms = new Alarms(file, zone, () => 'en');
    const receipt = await setDaily(alarms, Date.UTC(2026, 0, 1), at);
    expect(receipt).toContain('03:30');
    expect(receipt).toContain('at 02:30 every day');
    expect(alarms.list()[0]?.at).toBe(first);
    const reloaded = new Alarms(file, zone);
    reloaded.takeDue(first);
    expect(reloaded.list()[0]?.at).toBe(next);
    expect(reloaded.list()[0]?.clock).toBe('02:30');
  });

  it('migrates a legacy daily clock and skips missed dates after a long shutdown', () => {
    const file = alarmFile();
    const first = Date.UTC(2026, 2, 7, 14);
    writeFileSync(file, JSON.stringify({ next: 2, alarms: [{ id: 'a1', at: first, daily: true, note: 'stretch', setAt: first - 60_000 }] }));
    const alarms = new Alarms(file, 'America/New_York');
    expect(alarms.list()[0]?.clock).toBe('09:00');
    const due = alarms.takeDue(Date.UTC(2026, 9, 1, 15));
    expect(due).toHaveLength(1);
    expect(due[0]?.missed).toBe(true);
    expect(alarms.list()[0]?.at).toBe(Date.UTC(2026, 9, 2, 13));
    expect(JSON.parse(readFileSync(file, 'utf8')).alarms[0].clock).toBe('09:00');
  });
});
