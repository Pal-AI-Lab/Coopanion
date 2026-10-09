import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
  it('gives an English bot no Chinese: tool declarations, receipts, the due event', async () => {
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
      ...alarms.takeDue(now + 2 * 3_600_000).map(({ alarm, missed }) => alarms.dueText(alarm, missed)),
    ];
    expect(texts).toHaveLength(5);
    for (const text of texts) expect(text).not.toMatch(HAN);
  });
});
