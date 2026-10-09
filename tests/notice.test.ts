import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { releaseNotes } from '../core/notice.ts';

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
