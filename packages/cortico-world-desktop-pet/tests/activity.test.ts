import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { activityOf, ActivityTracker } from '../src/activity.ts';

const created = () => ({ type: 'response.created', sequence_number: 0, response: { id: 'r' } }) as StreamEvent;
const call = (id: string, name: string, args = '', done = false): StreamEvent => ({
  type: done ? 'response.output_item.done' : 'response.output_item.added', sequence_number: 1, output_index: 0,
  item: { type: 'function_call', id, call_id: id, name, arguments: args, status: done ? 'completed' : 'in_progress' },
});
const delta = (id: string, text: string): StreamEvent => ({
  type: 'response.function_call_arguments.delta', sequence_number: 2, output_index: 0, item_id: id, delta: text,
});
const textDelta = (): StreamEvent => ({ type: 'response.output_text.delta', sequence_number: 3, output_index: 0, item_id: 'text', content_index: 0, delta: 'a', logprobs: [] });

afterEach(() => vi.useRealTimers());

describe('activityOf', () => {
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
    ['private_extension', { path: 'private', text: 'private' }, { kind: 'work', text: '在忙' }],
    ['pet_say', { script: 'private' }, null],
    ['pet_act', { actions: ['nod'] }, null],
    ['pet_custom', {}, null],
    ['terminal_send', { text: 'private' }, null],
    ['end_turn', {}, null],
  ] as const)('%s exposes only its public activity', (name, args, expected) => {
    expect(activityOf(name, args)).toEqual(expected);
    expect(activityOf(name, JSON.stringify(args))).toEqual(expected);
  });

  it('keeps only the last path segment on either platform and truncates to 20 characters', () => {
    expect(activityOf('read_file', { path: 'C:\\Users\\private\\日记.md' })?.detail).toBe('日记.md');
    const long = '🐈'.repeat(24);
    for (const name of ['read_file', 'write_file', 'edit_file', 'append_file', 'delete_file', 'save_blob']) {
      expect(activityOf(name, { path: `/private/${long}.md` })?.detail).toBe('🐈'.repeat(20) + '…');
    }
    for (const [name, args] of [
      ['list_files', { dir: long }], ['glob_files', { glob_pattern: long }], ['grep_files', { pattern: long }],
      ['cua_key', { keys: long }], ['alarm_set', { at: long }],
    ] as const) expect([...(activityOf(name, args)?.detail ?? '')]).toHaveLength(21);
  });

  it('waits for a closed string or a number followed by a delimiter', () => {
    expect(activityOf('write_file', '{"path":"notes/da')).toEqual({ kind: 'write', text: '在写' });
    expect(activityOf('write_file', '{"path":"notes/day\\u0020\\"one\\".md","content":"still streaming')).toEqual({ kind: 'write', text: '在写', detail: 'day "one".md' });
    for (const args of ['{"seconds":1', '{"seconds":1.', '{"seconds":1e']) expect(activityOf('cua_wait', args)?.detail).toBeUndefined();
    expect(activityOf('cua_wait', '{"seconds":1.5,')?.detail).toBe('1.5 秒');
    expect(activityOf('cua_wait', '{"seconds":0}')?.detail).toBe('0 秒');
    expect(activityOf('alarm_set', '{"in_minutes":12, "note":"private')?.detail).toBe('12 分钟后');
  });

  it('never exposes typed secrets or alarm notes, including partial arguments', () => {
    for (const [name, key] of [['cua_type', 'text'], ['alarm_set', 'note']]) {
      const raw = JSON.stringify({ [key]: 'secret-password', path: 'private', at: '18:30' });
      for (let i = 0; i <= raw.length; i++) expect(JSON.stringify(activityOf(name, raw.slice(0, i)))).not.toMatch(/secret|password|private/);
    }
  });
});

describe('ActivityTracker', () => {
  const setup = () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const tracker = new ActivityTracker(changed);
    return { tracker, changed };
  };

  it('starts thinking, reads a name before done, and groups calls by item id even with the same output_index', () => {
    const { tracker, changed } = setup();
    tracker.onEvent(created());
    expect(tracker.status).toEqual({ kind: 'think', text: '' });
    tracker.onEvent(call('a', 'read_file'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看' });
    tracker.onEvent(delta('a', '{"path":"memory/first'));
    expect(changed).toHaveBeenCalledTimes(2);
    tracker.onEvent(delta('a', '.md"'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看', detail: 'first.md' });
    tracker.onEvent(call('b', 'read_file'));
    tracker.onEvent(delta('b', '{"path":"second.md"}'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看', detail: 'first.md', count: 2 });
    tracker.onRoundEnd();
    expect(tracker.status?.count).toBe(2);
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it('skips pet calls within a same-kind run, keeps the first detail and uses the last wording', () => {
    const { tracker } = setup();
    tracker.onEvent(call('say', 'pet_say'));
    expect(tracker.status?.kind).toBe('think');
    tracker.onEvent(call('read', 'read_file', '{"path":"a.md"}'));
    expect(tracker.status?.kind).toBe('read');
    tracker.onEvent(call('w1', 'write_file', '{"path":"first.md"}'));
    tracker.onEvent(call('act', 'pet_act', '{}', true));
    tracker.onEvent(call('w2', 'append_file', '{"path":"last.md"}'));
    expect(tracker.status).toEqual({ kind: 'write', text: '在补记', detail: 'first.md', count: 2 });
    tracker.onEvent(call('r2', 'read_file'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看' });
  });

  it('uses full done arguments without reordering calls when done arrives late', () => {
    const { tracker } = setup();
    tracker.onEvent(call('a', 'read_file'));
    tracker.onEvent(call('b', 'read_file'));
    tracker.onEvent(call('b', 'read_file', '{"path":"second.md"}', true));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看', count: 2 });
    tracker.onEvent(call('a', 'read_file', '{"path":"first.md"}', true));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看', detail: 'first.md', count: 2 });
  });

  it('clears a round made only of finished hidden calls', () => {
    const { tracker } = setup();
    tracker.onEvent(call('s', 'pet_say'));
    tracker.onEvent(delta('s', '{"script":"hello'));
    expect(tracker.status?.kind).toBe('think');
    tracker.onEvent(call('s', 'pet_say', '{"script":"hello"}', true));
    expect(tracker.status).toBeNull();
    tracker.onEvent(call('e', 'end_turn'));
    expect(tracker.status?.kind).toBe('think');
    tracker.onEvent(call('e', 'end_turn', '{}', true));
    tracker.onRoundEnd();
    expect(tracker.status).toBeNull();
  });

  it('starts another round on any first event after round end, without requiring created', () => {
    const { tracker } = setup();
    tracker.onEvent(call('a', 'read_file'));
    tracker.onRoundEnd();
    expect(tracker.status?.kind).toBe('read');
    tracker.onEvent(textDelta());
    expect(tracker.status).toEqual({ kind: 'think', text: '' });
    tracker.onEvent(call('b', 'read_file'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看' });
    tracker.onEvent(created());
    expect(tracker.status?.kind).toBe('think');
  });

  it.each(['onAbort', 'onTurnEnded'] as const)('%s clears the state and timer once', (end) => {
    const { tracker, changed } = setup();
    tracker.onEvent(call('a', 'read_file'));
    tracker[end]();
    expect(tracker.status).toBeNull();
    const count = changed.mock.calls.length;
    tracker[end]();
    vi.advanceTimersByTime(120_000);
    expect(changed).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears after 120 seconds without any stream event, refreshing even for unparsed events', () => {
    const { tracker, changed } = setup();
    tracker.onEvent(call('a', 'read_file'));
    vi.advanceTimersByTime(119_999);
    expect(tracker.status?.kind).toBe('read');
    tracker.onEvent(textDelta());
    tracker.onRoundEnd();
    vi.advanceTimersByTime(119_999);
    expect(tracker.status?.kind).toBe('read');
    vi.advanceTimersByTime(1);
    expect(tracker.status).toBeNull();
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(vi.getTimerCount()).toBe(0);
  });
});
