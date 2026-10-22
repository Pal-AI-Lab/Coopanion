import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Alarms, dueTime, localLabel } from '../core/alarms.ts';

describe('dueTime', () => {
  // 2026-10-05 14:00 in Shanghai (UTC+8)
  const now = Date.UTC(2026, 9, 5, 6, 0);

  it('reads HH:MM as the person\'s local time, today or else tomorrow', () => {
    expect(localLabel('Asia/Shanghai', dueTime('Asia/Shanghai', now, '18:30', undefined) as number)).toBe('10-05 18:30');
    expect(localLabel('Asia/Shanghai', dueTime('Asia/Shanghai', now, '09:00', undefined) as number)).toBe('10-06 09:00');
  });

  it('keeps the wall-clock time across a daylight-saving change', () => {
    // New York leaves daylight saving on 2026-11-01
    const at = dueTime('America/New_York', now, '2026-11-02 08:00', undefined) as number;
    expect(localLabel('America/New_York', at)).toBe('11-02 08:00');
  });
});

describe('Alarms', () => {
  it('gives an English bot no Chinese: tool declarations, receipts, the cancel and due events', async () => {
    const HAN = /\p{Script=Han}/u;
    const now = Date.UTC(2026, 9, 5, 6, 0);
    const alarms = new Alarms(join(mkdtempSync(join(tmpdir(), 'coo-alarms-')), 'alarms.json'), 'Asia/Shanghai', () => 'en');
    const tools = alarms.tools(() => now);
    const run = (name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.handler(args, {} as never) as Promise<{ text: string }>;
    expect(JSON.stringify(tools.map(({ handler: _, ...decl }) => decl))).not.toMatch(HAN);
    const texts = [
      (await run('alarm_set', { note: 'stretch', in_minutes: 30, daily: true })).text,
      (await run('alarm_set', { note: 'tea', at: '25:00' })).text,
      (await run('alarm_list', {})).text,
      (await run('alarm_cancel', { id: 'a9' })).text,
      alarms.cancelledText(alarms.list()[0]!),
      ...alarms.takeDue(now + 2 * 3_600_000).map(({ alarm, missed }) => alarms.dueText(alarm, missed)),
    ];
    expect(texts).toHaveLength(6);
    for (const text of texts) expect(text).not.toMatch(HAN);
  });
});


describe('alarm state recovery', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const stateFile = () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-alarms-state-'));
    dirs.push(dir);
    return join(dir, 'alarms.json');
  };

  it.each(['', '{"next":', 'null', '{"next":1,"alarms":[null]}'])('recovers invalid state %j', async (content) => {
    const file = stateFile();
    writeFileSync(file, content);
    const alarms = new Alarms(file, 'UTC');
    expect(alarms.list()).toEqual([]);
    expect(readFileSync(`${file}.bad`, 'utf8')).toBe(content);
    await alarms.tools(() => 0).find((tool) => tool.name === 'alarm_set')!.handler({ note: 'tea', in_minutes: 1 }, {} as never);
    expect(new Alarms(file, 'UTC').list()).toEqual(alarms.list());
  });

  it('delivers a due alarm once in the running process when its next save fails', async () => {
    const file = stateFile();
    const alarms = new Alarms(file, 'UTC');
    await alarms.tools(() => 0).find((tool) => tool.name === 'alarm_set')!.handler({ note: 'tea', in_minutes: 1 }, {} as never);
    const previous = readFileSync(file, 'utf8');
    mkdirSync(`${file}.tmp`);
    expect(alarms.takeDue(60_000).map(({ alarm }) => alarm.note)).toEqual(['tea']);
    expect(alarms.takeDue(60_001)).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(previous);
  });

  it('throws on a file it cannot read and leaves it in place', () => {
    const file = stateFile();
    mkdirSync(file);
    expect(() => new Alarms(file, 'UTC')).toThrow(/EISDIR/);
    expect(statSync(file).isDirectory()).toBe(true);
    expect(existsSync(`${file}.bad`)).toBe(false);
  });
});
