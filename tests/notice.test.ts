import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorldHost } from 'cortico/core/types.ts';
import { noticeDefinition, releaseLetter, releaseNotes, type AlarmsState } from '../core/notice.ts';

/** A releases directory with one file per version, each `## 下载` section after its body. */
function releases(versions: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'coo-notes-'));
  for (const v of versions) writeFileSync(join(dir, `v${v}.md`), `# Coopanion v${v}\n\n本版 ${v}\n\n## 下载\n\n- 安装包 ${v}\n`);
  return dir;
}

describe('releaseNotes', () => {
  it('takes the versions after the last one run up to the running one, in version order', () => {
    // 0.1.9 sorts after 0.1.10 as text
    const dir = releases(['0.1.8', '0.1.9', '0.1.10', '0.1.11', '0.1.12']);
    expect(releaseNotes(dir, '0.1.8', '0.1.11').map((n) => n.version)).toEqual(['0.1.9', '0.1.10', '0.1.11']);
  });

  it('takes only the running version when the last one is unknown', () => {
    const dir = releases(['0.1.12', '0.1.13']);
    expect(releaseNotes(dir, null, '0.1.13').map((n) => n.version)).toEqual(['0.1.13']);
  });

  it('reads a version\'s English notes for English model text, its Chinese ones where there are none, each without its download list', () => {
    const dir = releases(['0.1.12', '0.1.13']);
    writeFileSync(join(dir, 'v0.1.13.en.md'), '# Coopanion v0.1.13\n\nThis release 0.1.13\n\n## Download\n\n- installer 0.1.13\n');
    const notes = releaseNotes(dir, '0.1.11', '0.1.13', 'en');
    expect(notes.map((n) => n.version)).toEqual(['0.1.12', '0.1.13']);
    expect(notes[0]!.text).toContain('本版 0.1.12');
    expect(notes[1]!.text).toContain('This release 0.1.13');
    expect(notes[1]!.text).not.toContain('installer');
  });

  it('leaves the download list out', () => {
    const [note] = releaseNotes(releases(['0.1.13']), null, '0.1.13');
    expect(note!.text).toContain('本版 0.1.13');
    expect(note!.text).not.toContain('安装包');
  });
});

describe('releaseLetter', () => {
  /** Releases 0.1.11 to 0.1.14, with letters for the versions given. */
  function lettered(versions: string[]): string {
    const dir = releases(['0.1.11', '0.1.12', '0.1.13', '0.1.14']);
    for (const v of versions) writeFileSync(join(dir, `v${v}.letter.md`), `给你的信 ${v}\n\n## 下载\n\n信里的段落\n`);
    return dir;
  }

  it('takes only the newest letter in the range, whole, and is not taken as notes', () => {
    const dir = lettered(['0.1.12', '0.1.13', '0.1.14']);
    const letter = releaseLetter(dir, '0.1.11', '0.1.13');
    expect(letter!.version).toBe('0.1.13');
    expect(letter!.text).toContain('信里的段落');
    expect(letter!.url).toBe('https://github.com/Pal-AI-Lab/Coopanion/blob/v0.1.13/docs/releases/v0.1.13.letter.md');
    expect(releaseNotes(dir, '0.1.11', '0.1.13').map((n) => n.version)).toEqual(['0.1.12', '0.1.13']);
    expect(releaseLetter(dir, '0.1.13', '0.1.13')).toBeNull();
  });

  it('reads the English letter for English model text, the Chinese one where there is none', () => {
    const dir = lettered(['0.1.12', '0.1.13']);
    writeFileSync(join(dir, 'v0.1.13.letter.en.md'), 'A letter 0.1.13\n');
    expect(releaseLetter(dir, '0.1.11', '0.1.13', 'en')!.url).toMatch(/v0\.1\.13\.letter\.en\.md$/);
    expect(releaseLetter(dir, '0.1.11', '0.1.12', 'en')!.text).toContain('给你的信 0.1.12');
  });
});

describe('alarms panel', () => {
  it('deletes an alarm from Coo\'s list and tells Coo which one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-notice-'));
    const world = noticeDefinition({
      version: 'dev', notesDir: dir, stateFile: join(dir, 'notice.json'), alarmsFile: join(dir, 'alarms.json'),
      newInstall: () => true, read: () => undefined, petConnected: () => false, guiding: () => false,
      refreshTools: async () => {}, label: () => 'notice',
    }).create({ timezone: 'Asia/Shanghai' } as never);
    const pushed: Array<{ type: string; render: () => string | null }> = [];
    await world.start({ pushDeferred: (e: { type: string; render: () => string | null }) => pushed.push(e) } as unknown as WorldHost);
    try {
      const run = (name: string, args: Record<string, unknown>) => world.tools().find((t) => t.name === name)!.handler(args, {} as never) as Promise<{ text: string }>;
      await run('alarm_set', { note: '提醒喝水', in_minutes: 30 });
      await run('alarm_set', { note: '提醒睡觉', in_minutes: 90 });
      const panel = world.webUi!('zh');
      const [first] = ((await panel.invoke!('alarms', 'list', [])) as AlarmsState).alarms;
      const after = (await panel.invoke!('alarms', 'cancel', [first!.id])) as AlarmsState;
      expect(after.alarms.map((a) => a.note)).toEqual(['提醒睡觉']);
      expect((await run('alarm_list', {})).text).not.toContain('提醒喝水');
      expect(pushed.map((e) => e.type)).toEqual(['coopanion.alarm-cancelled']);
      expect(pushed[0]!.render()).toContain('提醒喝水');
      await expect(panel.invoke!('alarms', 'cancel', [first!.id])).rejects.toThrow();
    } finally {
      await world.stop();
    }
  });
});


describe('notice state recovery', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it.each(['', '{"version":', 'null', '{"version":7}'])('starts with invalid state %j', async (content) => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-notice-state-'));
    dirs.push(dir);
    const stateFile = join(dir, 'notice.json');
    writeFileSync(stateFile, content);
    const world = noticeDefinition({
      version: '0.2.6', notesDir: dir, stateFile, alarmsFile: join(dir, 'alarms.json'),
      newInstall: () => true, read: () => undefined, petConnected: () => false, guiding: () => false,
      refreshTools: async () => {}, label: () => 'notice',
    }).create({ timezone: 'UTC' } as never);
    await world.start({ pushDeferred: () => {} } as unknown as WorldHost);
    try {
      expect(readFileSync(`${stateFile}.bad`, 'utf8')).toBe(content);
      expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({ version: '0.2.6' });
    } finally { await world.stop(); }
  });
});
