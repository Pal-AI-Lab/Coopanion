import { describe, expect, it, vi } from 'vitest';
import type { RunPhase } from 'cortico/core/types.ts';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { POSTED_STATUS_SECONDS, PostedStatusSource, StatusTracker, postedStatusOf, stringArg, type DescribeTool } from '../src/status.ts';

const phase = (state: RunPhase['state'], round?: number, running: string[] = []): RunPhase =>
  ({ state, ...(round !== undefined ? { round } : {}), running, enteredAt: '2026-10-07T10:00:00+08:00' });
const call = (id: string, name: string, args = '', done = false): StreamEvent => ({
  type: done ? 'response.output_item.done' : 'response.output_item.added', sequence_number: 1, output_index: 0,
  item: { type: 'function_call', id, call_id: id, name, arguments: args, status: done ? 'completed' : 'in_progress' },
});
const delta = (id: string, text: string): StreamEvent => ({
  type: 'response.function_call_arguments.delta', sequence_number: 2, output_index: 0, item_id: id, delta: text,
});

// a stand-in for the app's table: reads and writes name their file, the rest is left to the default
const describe_: DescribeTool = (name, args) => {
  if (name === 'read_file') return { kind: 'read', text: '在看', ...(stringArg(args, 'path') ? { detail: stringArg(args, 'path') } : {}) };
  if (name === 'write_file') return { kind: 'write', text: '在写', ...(stringArg(args, 'path') ? { detail: stringArg(args, 'path') } : {}) };
  if (name === 'append_file') return { kind: 'write', text: '在补记', ...(stringArg(args, 'path') ? { detail: stringArg(args, 'path') } : {}) };
  if (name === 'end_turn') return null;
  return undefined;
};
const setup = (describeTool: DescribeTool | undefined = describe_) => {
  const changed = vi.fn();
  return { tracker: new StatusTracker(changed, describeTool), changed };
};

describe('StatusTracker', () => {
  it('thinks from the request on, reads a name before the call is done, and counts a run of one kind', () => {
    const { tracker, changed } = setup();
    tracker.onPhase(phase('delivering'));
    expect(tracker.status).toEqual({ kind: 'think', text: '' });
    tracker.onPhase(phase('model', 1));
    tracker.onEvent(call('a', 'read_file'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看' });
    tracker.onEvent(delta('a', '{"path":"first'));
    tracker.onEvent(delta('a', '.md"'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看', detail: 'first.md' });
    tracker.onEvent(call('b', 'read_file', '{"path":"second.md"}'));
    expect(tracker.status).toEqual({ kind: 'read', text: '在看', detail: 'first.md', count: 2 });
    tracker.onPhase(phase('tools', 1, ['read_file']));
    expect(tracker.status?.count).toBe(2);
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it('starts the next round from thinking and ends with the batch', () => {
    const { tracker } = setup();
    tracker.onPhase(phase('model', 1));
    tracker.onEvent(call('a', 'read_file', '{"path":"a.md"}', true));
    tracker.onPhase(phase('tools', 1, ['read_file']));
    tracker.onPhase(phase('delivering', 1));
    expect(tracker.status?.kind).toBe('read');
    tracker.onPhase(phase('model', 2));
    expect(tracker.status).toEqual({ kind: 'think', text: '' });
    tracker.onPhase(phase('backoff', 2));
    expect(tracker.status?.kind).toBe('think');
    tracker.onPhase(phase('idle'));
    expect(tracker.status).toBeNull();
  });

  it('keeps the first detail and the last wording across hidden calls, and uses late done arguments in call order', () => {
    const { tracker } = setup();
    tracker.onPhase(phase('model', 1));
    tracker.onEvent(call('w1', 'write_file'));
    tracker.onEvent(call('say', 'pet_say', '{}', true));
    tracker.onEvent(call('w2', 'append_file', '{"path":"last.md"}'));
    expect(tracker.status).toEqual({ kind: 'write', text: '在补记', count: 2 });
    tracker.onEvent(call('w1', 'write_file', '{"path":"first.md"}', true));
    expect(tracker.status).toEqual({ kind: 'write', text: '在补记', detail: 'first.md', count: 2 });
  });

  it('shows nothing for a round made only of finished hidden calls, and busy for undescribed tools', () => {
    const { tracker } = setup();
    tracker.onPhase(phase('model', 1));
    tracker.onEvent(call('s', 'pet_say'));
    expect(tracker.status?.kind).toBe('think');
    tracker.onEvent(call('s', 'pet_say', '{"script":"hello"}', true));
    expect(tracker.status).toBeNull();
    tracker.onEvent(call('x', 'some_tool'));
    expect(tracker.status).toEqual({ kind: 'work', text: '在忙' });
  });

  it('reads the stream only while the model writes or tools run', () => {
    const { tracker } = setup();
    tracker.onEvent(call('a', 'read_file'));
    expect(tracker.status).toBeNull();
  });

  it('without a describer shows the pet\'s own tools as nothing and every other tool as busy', () => {
    const tracker = new StatusTracker(vi.fn());
    tracker.onPhase(phase('model', 1));
    tracker.onEvent(call('a', 'read_file', '{"path":"a.md"}'));
    expect(tracker.status).toEqual({ kind: 'work', text: '在忙' });
  });
});

describe('posted status', () => {
  const accepted = (body: unknown) => {
    const out = postedStatusOf(body as Record<string, unknown>);
    if ('error' in out) throw new Error(out.error);
    return out;
  };
  const refused = (body: unknown) => {
    const out = postedStatusOf(body as Record<string, unknown>);
    return 'error' in out ? out.error : null;
  };

  it('takes the wording, the count and the lifetime as posted', () => {
    expect(accepted({ status: { kind: 'work', text: '在跑测试', detail: 'D:/x/a.md', count: 3 }, ttlSeconds: 45 }))
      .toEqual({ status: { kind: 'work', text: '在跑测试', detail: 'D:/x/a.md', count: 3 }, ttlSeconds: 45, actions: [] });
    expect(accepted({ status: { kind: 'think', text: '' } }))
      .toEqual({ status: { kind: 'think', text: '' }, ttlSeconds: POSTED_STATUS_SECONDS, actions: [] });
  });

  it('clears with null and caps how long a caller may hold the bubble', () => {
    expect(accepted({ status: null })).toEqual({ status: null, ttlSeconds: POSTED_STATUS_SECONDS, actions: [] });
    expect(accepted({ status: { kind: 'work', text: 'x' }, ttlSeconds: 99_999 }).ttlSeconds).toBe(3600);
  });

  it('takes the words to play, cut to the six one post carries', () => {
    expect(accepted({ status: null, actions: ['nod'] }).actions).toEqual(['nod']);
    expect(accepted({ status: { kind: 'wait', text: '在等' }, actions: [' wave ', 'nod'] }).actions).toEqual(['wave', 'nod']);
    expect(accepted({ status: null, actions: Array(9).fill('hop') }).actions).toEqual(Array(6).fill('hop'));
    expect(refused({ status: null, actions: 'wave' })).toBe('actions must be an array of strings');
    expect(refused({ status: null, actions: ['wave', 3] })).toBe('actions must be an array of strings');
    expect(refused({ status: null, actions: [''] })).toBe('actions must be an array of strings');
  });

  it('refuses a kind the bubble has no icon for, and a body that is not a status', () => {
    expect(refused({})).toBe('status must be an object or null');
    expect(refused({ status: 'busy' })).toBe('status must be an object or null');
    expect(refused({ status: { kind: 'sleep', text: '在睡' } })).toBe('unknown kind: sleep');
    expect(refused({ status: { kind: 'work' } })).toBe('text must be a string');
    expect(refused({ status: { kind: 'work', text: 'x', count: 0 } })).toBe('count must be a positive integer');
    expect(refused({ status: { kind: 'work', text: 'x' }, ttlSeconds: 0 })).toBe('ttlSeconds must be a positive number');
  });

  it('cuts wording the bubble cannot show, one character at a time', () => {
    const cut = accepted({ status: { kind: 'work', text: '鲸'.repeat(60), detail: 'd'.repeat(200) } });
    expect([...cut.status!.text].length).toBe(40);
    expect([...cut.status!.detail!].length).toBe(80);
    // a family emoji is one character to the person, several code points to the string
    const emoji = accepted({ status: { kind: 'work', text: '🐋'.repeat(40) + '👩‍👩‍👧' } });
    expect(emoji.status!.text).toBe('🐋'.repeat(40));
  });

  it('shows a posted status while it is fresh and hands the bubble back when it expires', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const posted = new PostedStatusSource(changed);
    expect(posted.current).toBeNull();
    posted.set({ kind: 'work', text: '在跑' }, 5);
    expect(posted.current).toEqual({ kind: 'work', text: '在跑' });
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4_000);
    posted.set({ kind: 'work', text: '在跑' }, 5); // a refresh restarts the lifetime
    vi.advanceTimersByTime(4_000);
    expect(posted.current).not.toBeNull();
    vi.advanceTimersByTime(1_100);
    expect(posted.current).toBeNull();
    expect(changed).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('clears at once with null, and drops the status and its timer on stop', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const posted = new PostedStatusSource(changed);
    posted.set({ kind: 'read', text: '在看' }, 30);
    posted.set(null, 30);
    expect(posted.current).toBeNull();
    posted.set({ kind: 'read', text: '在看' }, 30);
    posted.stop();
    expect(posted.current).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(changed).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
