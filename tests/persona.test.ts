import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolDef } from 'cortico/core/types.ts';
import { Cormini } from '../vendor/cortico/bots/cormini/persona/persona.ts';
import { gitInstalled } from '../vendor/cortico/bots/cormini/persona/workspaceGit.ts';
import { ARCHIVE_DIR, AUTHOR_COO, PARTNER_DIR, PARTNER_FILE, PARTNER_NOTE, SNAPSHOT_TAG, arrangePartner, coopanionPersona } from '../core/persona.ts';

const CoopanionPersona = coopanionPersona(Cormini);
const ctx = { role: 'main', log: { emit: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } } as never;
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

function persona() {
  const dir = mkdtempSync(join(tmpdir(), 'coo-persona-'));
  const p = new CoopanionPersona({ memoryDir: dir });
  const tool = (name: string): ToolDef => p.declareSessions()[0]!.tools().find((t) => t.name === name)!;
  return { dir, p, run: (name: string, args: Record<string, unknown>) => tool(name).handler(args, ctx) };
}

describe.skipIf(!gitInstalled())('Coo’s workspace history', () => {
  it('commits each write Coo makes, as Coo, and nothing for a write that failed', async () => {
    const { dir, run } = persona();
    await run('write_file', { path: 'notes/today.md', content: 'tea' });
    await run('edit_file', { path: 'notes/today.md', old_string: 'tea', new_string: 'coffee' });
    await run('edit_file', { path: 'notes/today.md', old_string: 'absent', new_string: 'x' });
    expect(git(dir, 'log', '--format=%an|%s').split('\n')).toEqual([
      `${AUTHOR_COO.name}|Coo edited notes/today.md`,
      `${AUTHOR_COO.name}|Coo wrote notes/today.md`,
      expect.stringContaining('checkpoint0'),
    ]);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });

  it('commits a move of whole files and a move of lines once each, naming the file moved from', async () => {
    const { dir, run } = persona();
    await run('write_file', { path: 'log/2026-09.md', content: 'one\ntwo\n' });
    await run('move_file', { from: 'log/2026-09.md', to: `${ARCHIVE_DIR}/log/2026-09.md` });
    await run('move_file', { from: `${ARCHIVE_DIR}/log/2026-09.md`, to: 'log/kept.md', offset: 1, limit: 1 });
    expect(git(dir, 'log', '--format=%s', '-2').split('\n')).toEqual([
      `Coo moved ${ARCHIVE_DIR}/log/2026-09.md`,
      'Coo moved log/2026-09.md',
    ]);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });

  it('snapshots the workspace once per version, with blobs/ out of the repository', async () => {
    const { dir, p } = persona();
    p.snapshot('1.0.0');
    // a blob committed before blobs/ was ignored, and a change made while the app was not running
    mkdirSync(join(dir, 'blobs'));
    writeFileSync(join(dir, 'blobs', 'cat.png'), 'png');
    git(dir, 'add', '-f', 'blobs/cat.png');
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'blob');
    writeFileSync(join(dir, 'hand-edit.md'), 'edited by hand');
    p.snapshot('1.0.1');
    expect(git(dir, 'tag', '--list')).toContain(SNAPSHOT_TAG('1.0.1'));
    expect(git(dir, 'ls-files')).not.toContain('blobs/cat.png');
    expect(readFileSync(join(dir, 'blobs', 'cat.png'), 'utf8')).toBe('png');
    expect(git(dir, 'show', `${SNAPSHOT_TAG('1.0.1')}:hand-edit.md`)).toBe('edited by hand');
    // the same version again commits what changed since and makes no second tag
    writeFileSync(join(dir, 'hand-edit.md'), 'again');
    p.snapshot('1.0.1');
    expect(git(dir, 'tag', '--list').split('\n').filter((t) => t === SNAPSHOT_TAG('1.0.1'))).toHaveLength(1);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });
});

describe('PARTNER.md', () => {
  it('goes into the prefix whole and cannot be deleted', async () => {
    const { p, run } = persona();
    await run('write_file', { path: PARTNER_FILE, content: 'Likes cats. Works late.' });
    const prefix = (await p.systemSegments({ now: new Date(), timezone: 'UTC', worlds: [] })).map((s) => s.text).join('\n');
    expect(prefix).toContain(`${PARTNER_NOTE}

Likes cats. Works late.`);
    expect(String(await run('delete_file', { path: PARTNER_FILE }))).toContain('[delete failed]');
  });

  it('can have lines moved out of it but cannot be moved whole', async () => {
    const { dir, run } = persona();
    await run('write_file', { path: PARTNER_FILE, content: 'Likes cats.\n2026-09: moved house.\n' });
    expect(String(await run('move_file', { from: PARTNER_FILE, to: 'old.md' }))).toContain('[move failed]');
    await run('move_file', { from: PARTNER_FILE, to: `${PARTNER_DIR}/2026-09.md`, offset: 2 });
    expect(readFileSync(join(dir, PARTNER_FILE), 'utf8')).toBe('Likes cats.\n');
    expect(readFileSync(join(dir, PARTNER_DIR, '2026-09.md'), 'utf8')).toBe('2026-09: moved house.\n');
  });
});

describe('archive/', () => {
  it('shows in the prefix listing as one line however many files it holds', async () => {
    const { p, run } = persona();
    for (let i = 0; i < 12; i++) await run('write_file', { path: `${ARCHIVE_DIR}/log/2025-${String(i + 1).padStart(2, '0')}.md`, content: 'x' });
    const prefix = (await p.systemSegments({ now: new Date(), timezone: 'UTC', worlds: [] })).map((s) => s.text).join('\n');
    expect(prefix).toContain(`- ${ARCHIVE_DIR}/ (12 archived files;`);
    expect(prefix).not.toContain(`${ARCHIVE_DIR}/log/2025-01.md`);
  });
});

/** Whether this file system tells `a` and `A` apart; the case-variant merges only arise where it does. */
function caseSensitive(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'coo-case-'));
  writeFileSync(join(dir, 'a'), '');
  return !existsSync(join(dir, 'A'));
}

describe('arranging the partner notes', () => {
  it('moves a file named partner into the partner directory and leaves PARTNER.md as it was', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-partner-'));
    writeFileSync(join(dir, PARTNER_FILE), 'Likes cats.');
    writeFileSync(join(dir, PARTNER_DIR), 'old notes');
    expect(arrangePartner(dir)).toBe(true);
    expect(statSync(join(dir, PARTNER_DIR)).isDirectory()).toBe(true);
    expect(readFileSync(join(dir, PARTNER_DIR, PARTNER_DIR), 'utf8')).toBe('old notes');
    expect(readFileSync(join(dir, PARTNER_FILE), 'utf8')).toBe('Likes cats.');
    expect(arrangePartner(dir)).toBe(false);
  });

  it('renames a partner.md Coo wrote before to PARTNER.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-partner-'));
    writeFileSync(join(dir, 'partner.md'), 'Works late.');
    expect(arrangePartner(dir)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual([PARTNER_FILE, PARTNER_DIR].sort());
    expect(readFileSync(join(dir, PARTNER_FILE), 'utf8')).toBe('Works late.');
  });

  it.skipIf(!caseSensitive())('merges a partner.md and a Partner directory left beside the real ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-partner-'));
    writeFileSync(join(dir, PARTNER_FILE), 'Likes cats.');
    writeFileSync(join(dir, 'partner.md'), 'Works late.');
    mkdirSync(join(dir, PARTNER_DIR));
    writeFileSync(join(dir, PARTNER_DIR, 'trips.md'), 'Kyoto');
    mkdirSync(join(dir, 'Partner'));
    writeFileSync(join(dir, 'Partner', 'trips.md'), 'Osaka');
    expect(arrangePartner(dir)).toBe(true);
    expect(readFileSync(join(dir, PARTNER_FILE), 'utf8')).toContain('Likes cats.');
    expect(readFileSync(join(dir, PARTNER_FILE), 'utf8')).toContain('Works late.');
    expect(readdirSync(dir).sort()).toEqual([PARTNER_FILE, PARTNER_DIR].sort());
    expect(readdirSync(join(dir, PARTNER_DIR)).sort()).toEqual(['Partner-trips.md', 'trips.md']);
  });

  it.skipIf(!gitInstalled())('commits the arranging after the start tag, so the tag keeps the workspace as it was', () => {
    const { dir, p } = persona();
    writeFileSync(join(dir, PARTNER_DIR), 'old notes');
    p.snapshot('2.0.0');
    expect(git(dir, 'show', `${SNAPSHOT_TAG('2.0.0')}:${PARTNER_DIR}`)).toBe('old notes');
    expect(git(dir, 'show', `HEAD:${PARTNER_DIR}/${PARTNER_DIR}`)).toBe('old notes');
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });
});
