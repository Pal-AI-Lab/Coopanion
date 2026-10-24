import { describe, expect, it } from 'vitest';
import { petToolDescriber } from '../core/pet-status.ts';
import zh from '../core/i18n/zh.ts';

const describePetTool = petToolDescriber(() => 'zh');
const T = zh.status;

describe('the status bubble for each tool', () => {
  it.each([
    ['read_file', { path: 'notes/today.md' }, { kind: 'read', text: T.read, detail: 'today.md' }],
    ['list_files', {}, { kind: 'browse', text: T.browse, detail: T.memory }],
    ['list_files', { dir: 'memory/notes/' }, { kind: 'browse', text: T.browse, detail: 'notes/' }],
    ['glob_files', { glob_pattern: '*.md', target_directory: 'private' }, { kind: 'browse', text: T.find, detail: '*.md' }],
    ['grep_files', { pattern: '周末', path: 'private' }, { kind: 'search', text: T.search, detail: '「周末」' }],
    ['write_file', { path: 'notes/today.md', content: 'private' }, { kind: 'write', text: T.write, detail: 'today.md' }],
    ['edit_file', { path: 'notes/today.md' }, { kind: 'write', text: T.edit, detail: 'today.md' }],
    ['append_file', { path: 'notes/today.md' }, { kind: 'write', text: T.append, detail: 'today.md' }],
    ['delete_file', { path: 'notes/today.md' }, { kind: 'delete', text: T.delete, detail: 'today.md' }],
    ['move_file', { from: 'log/2026-09.md', to: 'archive/log/' }, { kind: 'write', text: T.moveFile, detail: '2026-09.md' }],
    ['save_blob', { path: 'blobs/cat.png', handle: 'private' }, { kind: 'save', text: T.save, detail: 'cat.png' }],
    ['pet_cua_screenshot', {}, { kind: 'look', text: T.screen }],
    ['pet_cua_windows', {}, { kind: 'look', text: T.windows }],
    ['pet_cua_click', { x: 123, y: 456 }, { kind: 'click', text: T.click }],
    ['pet_cua_click', { clicks: 2 }, { kind: 'click', text: T.doubleClick }],
    ['pet_cua_click', { button: 'right' }, { kind: 'click', text: T.rightClick }],
    ['pet_cua_move', { x: 123, y: 456 }, { kind: 'click', text: T.move }],
    ['pet_cua_drag', { from: [1, 2], to: [3, 4] }, { kind: 'click', text: T.drag }],
    ['pet_cua_scroll', { x: 123, y: 456, down: 3 }, { kind: 'scroll', text: T.scroll }],
    ['pet_cua_focus', { window: 'private' }, { kind: 'click', text: T.focus }],
    ['pet_cua_type', { text: 'private' }, { kind: 'type', text: T.type }],
    ['pet_cua_key', { keys: 'ctrl+s' }, { kind: 'type', text: T.key, detail: 'ctrl+s' }],
    ['pet_cua_wait', { seconds: 2.5 }, { kind: 'wait', text: T.wait, detail: '2.5 秒' }],
    ['alarm_set', { at: '18:30', note: 'private' }, { kind: 'alarm', text: T.alarmSet, detail: '18:30' }],
    ['alarm_set', { in_minutes: 5, note: 'private' }, { kind: 'alarm', text: T.alarmSet, detail: '5 分钟后' }],
    ['alarm_list', {}, { kind: 'alarm', text: T.alarmList }],
    ['alarm_cancel', { id: 'private' }, { kind: 'alarm', text: T.alarmCancel }],
    ['private_extension', { path: 'private', text: 'private' }, undefined],
    ['console_send', { text: 'private' }, null],
    ['end_turn', {}, null],
  ] as const)('%s exposes only its public activity', (name, args, expected) => {
    expect(describePetTool(name, args, true)).toEqual(expected);
    expect(describePetTool(name, JSON.stringify(args), true)).toEqual(expected);
  });

  it('keeps only the last path segment on either platform and truncates to 20 characters', () => {
    expect(describePetTool('read_file', { path: 'C:\\Users\\private\\日记.md' }, true)?.detail).toBe('日记.md');
    const long = '🐈'.repeat(24);
    for (const name of ['read_file', 'write_file', 'edit_file', 'append_file', 'delete_file', 'save_blob']) {
      expect(describePetTool(name, { path: `/private/${long}.md` }, true)?.detail).toBe('🐈'.repeat(20) + '…');
    }
    for (const [name, args] of [
      ['list_files', { dir: long }], ['glob_files', { glob_pattern: long }], ['grep_files', { pattern: long }],
      ['pet_cua_key', { keys: long }], ['alarm_set', { at: long }],
    ] as const) expect([...(describePetTool(name, args, true)?.detail ?? '')]).toHaveLength(21);
  });

  it('waits for a closed string or a number followed by a delimiter', () => {
    expect(describePetTool('write_file', '{"path":"notes/da', false)).toEqual({ kind: 'write', text: T.write });
    expect(describePetTool('write_file', '{"path":"notes/day\\u0020\\"one\\".md","content":"still streaming', false)).toEqual({ kind: 'write', text: T.write, detail: 'day "one".md' });
    for (const args of ['{"seconds":1', '{"seconds":1.', '{"seconds":1e']) expect(describePetTool('pet_cua_wait', args, false)?.detail).toBeUndefined();
    expect(describePetTool('pet_cua_wait', '{"seconds":1.5,', false)?.detail).toBe('1.5 秒');
    expect(describePetTool('pet_cua_wait', '{"seconds":0}', true)?.detail).toBe('0 秒');
    expect(describePetTool('alarm_set', '{"in_minutes":12, "note":"private', false)?.detail).toBe('12 分钟后');
  });

  it('says nothing an unfinished call may contradict', () => {
    expect(describePetTool('pet_cua_click', '{"x":1', false)).toBeNull();
    expect(describePetTool('pet_cua_click', '{"button":"right"', false)).toEqual({ kind: 'click', text: T.rightClick });
    expect(describePetTool('list_files', '{"di', false)).toEqual({ kind: 'browse', text: T.browse });
  });

  it('never exposes typed secrets or alarm notes, including partial arguments', () => {
    for (const [name, key] of [['pet_cua_type', 'text'], ['alarm_set', 'note']]) {
      const raw = JSON.stringify({ [key]: 'secret-password', path: 'private', at: '18:30' });
      for (let i = 0; i <= raw.length; i++) expect(JSON.stringify(describePetTool(name, raw.slice(0, i), i === raw.length))).not.toMatch(/secret|password|private/);
    }
  });
});
