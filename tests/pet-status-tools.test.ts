import { describe, expect, it } from 'vitest';
import { describePetTool } from '../core/pet-status.ts';

describe('describePetTool', () => {
  it.each([
    ['read_file', { path: 'notes/today.md' }, { kind: 'read', text: '在看', detail: 'today.md' }],
    ['list_files', {}, { kind: 'browse', text: '在翻', detail: '记忆' }],
    ['list_files', { dir: 'memory/notes/' }, { kind: 'browse', text: '在翻', detail: 'notes/' }],
    ['glob_files', { glob_pattern: '*.md', target_directory: 'private' }, { kind: 'browse', text: '在找', detail: '*.md' }],
    ['grep_files', { pattern: '周末', path: 'private' }, { kind: 'search', text: '在搜', detail: '「周末」' }],
    ['write_file', { path: 'notes/today.md', content: 'private' }, { kind: 'write', text: '在写', detail: 'today.md' }],
    ['edit_file', { path: 'notes/today.md' }, { kind: 'write', text: '在改', detail: 'today.md' }],
    ['append_file', { path: 'notes/today.md' }, { kind: 'write', text: '在补记', detail: 'today.md' }],
    ['delete_file', { path: 'notes/today.md' }, { kind: 'delete', text: '在删', detail: 'today.md' }],
    ['save_blob', { path: 'blobs/cat.png', handle: 'private' }, { kind: 'save', text: '在存', detail: 'cat.png' }],
    ['cua_screenshot', {}, { kind: 'look', text: '在看屏幕' }],
    ['cua_windows', {}, { kind: 'look', text: '在看开着的窗口' }],
    ['cua_click', { x: 123, y: 456 }, { kind: 'click', text: '在点' }],
    ['cua_click', { clicks: 2 }, { kind: 'click', text: '在双击' }],
    ['cua_click', { button: 'right' }, { kind: 'click', text: '在右键' }],
    ['cua_move', { x: 123, y: 456 }, { kind: 'click', text: '在挪鼠标' }],
    ['cua_drag', { from: [1, 2], to: [3, 4] }, { kind: 'click', text: '在拖' }],
    ['cua_scroll', { x: 123, y: 456, down: 3 }, { kind: 'click', text: '在滚动' }],
    ['cua_focus', { window: 'private' }, { kind: 'click', text: '在切窗口' }],
    ['cua_type', { text: 'private' }, { kind: 'type', text: '在打字' }],
    ['cua_key', { keys: 'ctrl+s' }, { kind: 'type', text: '在按', detail: 'ctrl+s' }],
    ['cua_wait', { seconds: 2.5 }, { kind: 'wait', text: '等', detail: '2.5 秒' }],
    ['alarm_set', { at: '18:30', note: 'private' }, { kind: 'alarm', text: '在定闹钟', detail: '18:30' }],
    ['alarm_set', { in_minutes: 5, note: 'private' }, { kind: 'alarm', text: '在定闹钟', detail: '5 分钟后' }],
    ['alarm_list', {}, { kind: 'alarm', text: '在看闹钟' }],
    ['alarm_cancel', { id: 'private' }, { kind: 'alarm', text: '在取消闹钟' }],
    ['private_extension', { path: 'private', text: 'private' }, undefined],
    ['terminal_send', { text: 'private' }, null],
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
      ['cua_key', { keys: long }], ['alarm_set', { at: long }],
    ] as const) expect([...(describePetTool(name, args, true)?.detail ?? '')]).toHaveLength(21);
  });

  it('waits for a closed string or a number followed by a delimiter', () => {
    expect(describePetTool('write_file', '{"path":"notes/da', false)).toEqual({ kind: 'write', text: '在写' });
    expect(describePetTool('write_file', '{"path":"notes/day\\u0020\\"one\\".md","content":"still streaming', false)).toEqual({ kind: 'write', text: '在写', detail: 'day "one".md' });
    for (const args of ['{"seconds":1', '{"seconds":1.', '{"seconds":1e']) expect(describePetTool('cua_wait', args, false)?.detail).toBeUndefined();
    expect(describePetTool('cua_wait', '{"seconds":1.5,', false)?.detail).toBe('1.5 秒');
    expect(describePetTool('cua_wait', '{"seconds":0}', true)?.detail).toBe('0 秒');
    expect(describePetTool('alarm_set', '{"in_minutes":12, "note":"private', false)?.detail).toBe('12 分钟后');
  });

  it('says nothing an unfinished call may contradict', () => {
    expect(describePetTool('cua_click', '{"x":1', false)).toBeNull();
    expect(describePetTool('cua_click', '{"button":"right"', false)).toEqual({ kind: 'click', text: '在右键' });
    expect(describePetTool('list_files', '{"di', false)).toEqual({ kind: 'browse', text: '在翻' });
  });

  it('never exposes typed secrets or alarm notes, including partial arguments', () => {
    for (const [name, key] of [['cua_type', 'text'], ['alarm_set', 'note']]) {
      const raw = JSON.stringify({ [key]: 'secret-password', path: 'private', at: '18:30' });
      for (let i = 0; i <= raw.length; i++) expect(JSON.stringify(describePetTool(name, raw.slice(0, i), i === raw.length))).not.toMatch(/secret|password|private/);
    }
  });
});
