/**
 * The remote's gesture classifier (pure) and the helper process wrapper, which is tested
 * by feeding the line protocol through a fake child process.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REMOTE_RESTARTS, RESTART_BASE_MS, VokieRemote,
  type VokieRemoteState,
} from '../src/vokie/remote.ts';
import {
  BACK_USAGE, DEFAULT_HOLD_MS, DEFAULT_REMOTE_USAGE, SELECT_USAGE, VOICE_USAGE,
  createGestureClassifier, remoteButtonFor, type GestureEvent, type RemoteEdge,
} from '../src/vokie/gesture.ts';
import { FakeHost } from './helpers/fake-host.ts';

const log = new FakeHost().log;

const edge = (down: boolean, ts: number, usage = VOICE_USAGE, page = 12): RemoteEdge =>
  ({ button: remoteButtonFor(page, usage), page, usage, down, ts });

describe('gesture classifier', () => {
  function classifier(holdMs = DEFAULT_HOLD_MS) {
    const events: GestureEvent[] = [];
    const g = createGestureClassifier({ holdMs, onEvent: (e) => events.push(e) });
    return { g, events };
  }

  it('makes a press released before the threshold a tap of its measured length', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.edge(edge(false, 1180));
    expect(events).toEqual([{ type: 'press' }, { type: 'tap', heldMs: 180 }]);
    expect(g.pressed).toBe(false);
  });

  it('emits hold at the threshold while still down, then hold-end with the full length', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.tick(1000 + DEFAULT_HOLD_MS - 1);
    expect(events).toEqual([{ type: 'press' }]);
    g.tick(1000 + DEFAULT_HOLD_MS);
    expect(events).toEqual([{ type: 'press' }, { type: 'hold', heldMs: DEFAULT_HOLD_MS }]);
    g.tick(1000 + DEFAULT_HOLD_MS + 50);
    expect(events).toHaveLength(2); // a hold is reported once
    g.edge(edge(false, 1750));
    expect(events.at(-1)).toEqual({ type: 'hold-end', heldMs: 750 });
  });

  it('reports a late tick as the length the key had been down, not the threshold', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.tick(1600);
    expect(events).toEqual([{ type: 'press' }, { type: 'hold', heldMs: 600 }]);
    g.edge(edge(false, 1700));
    expect(events.at(-1)).toEqual({ type: 'hold-end', heldMs: 700 });
  });

  it('a tick after the release changes nothing', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.edge(edge(false, 1100));
    g.tick(5000);
    expect(events).toEqual([{ type: 'press' }, { type: 'tap', heldMs: 100 }]);
  });

  it('ignores duplicate and bouncing reports, so there is one press and one tap', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.edge(edge(true, 1000)); // the same report twice
    g.edge(edge(true, 1005)); // contact bounce while already down
    g.edge(edge(false, 1100));
    g.edge(edge(false, 1100)); // duplicate release
    expect(events).toEqual([{ type: 'press' }, { type: 'tap', heldMs: 100 }]);
  });

  it('ignores repeated downs while held, so there is one hold', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.edge(edge(true, 1010));
    g.edge(edge(true, 1020));
    g.tick(1600);
    g.edge(edge(true, 1700));
    g.tick(1800);
    g.edge(edge(false, 1900));
    expect(events).toEqual([{ type: 'press' }, { type: 'hold', heldMs: 600 }, { type: 'hold-end', heldMs: 900 }]);
  });

  it('takes only the configured voice key; other keys are ignored', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000, 0x89, 12));
    g.edge(edge(false, 1100, 0x89, 12));
    g.edge(edge(true, 1200, SELECT_USAGE, 12));
    g.edge(edge(false, 1300, SELECT_USAGE, 12));
    expect(events).toEqual([]);
  });

  it('takes only the configured page when one is given', () => {
    const events: GestureEvent[] = [];
    const g = createGestureClassifier({ holdMs: DEFAULT_HOLD_MS, onEvent: (e) => events.push(e), usage: VOICE_USAGE, page: 12 });
    g.edge(edge(true, 1000, VOICE_USAGE, 1));
    g.edge(edge(false, 1100, VOICE_USAGE, 1));
    g.edge(edge(true, 1200));
    g.edge(edge(false, 1300));
    expect(events).toEqual([{ type: 'press' }, { type: 'tap', heldMs: 100 }]);
  });

  it('flushes a due hold when any other edge arrives, with no tick needed', () => {
    const { g, events } = classifier();
    g.edge(edge(true, 1000));
    g.edge(edge(true, 1600, 0x89, 12)); // another key's report flushes the voice key's hold
    expect(events).toEqual([{ type: 'press' }, { type: 'hold', heldMs: 600 }]);
  });

  it('maps the remote’s consumer usages to buttons and everything else to other', () => {
    expect(remoteButtonFor(12, VOICE_USAGE)).toBe('voice');
    expect(remoteButtonFor(12, SELECT_USAGE)).toBe('select');
    expect(remoteButtonFor(12, BACK_USAGE)).toBe('back');
    expect(remoteButtonFor(12, 0x89)).toBe('other');
    expect(remoteButtonFor(1, VOICE_USAGE)).toBe('other');
    expect(DEFAULT_REMOTE_USAGE).toBe(VOICE_USAGE);
  });
});

interface FakeChild extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  pid: number;
  exitCode: number | null;
  kill: () => boolean;
}

/** A stand-in for the helper process: tests push its JSON lines in and make it exit. */
function fakeHelper() {
  const spawned: Array<{ args: string[]; env: NodeJS.ProcessEnv | undefined; child: FakeChild }> = [];
  const spawnImpl = ((_exe: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      pid: 4000 + spawned.length, exitCode: null as number | null,
      kill: () => { child.exitCode = 1; child.emit('exit', 1); return true; },
    }) as FakeChild;
    spawned.push({ args, env: opts.env, child });
    return child;
  }) as unknown as typeof spawn;
  const last = (): FakeChild => {
    const child = spawned.at(-1)?.child;
    if (!child) throw new Error('helper not spawned');
    return child;
  };
  const line = (msg: Record<string, unknown>): void => { last().stdout.write(JSON.stringify(msg) + '\n'); };
  const exit = (code = 1): void => { const child = last(); child.exitCode = code; child.emit('exit', code); };
  return { spawnImpl, spawned, line, exit };
}

const HELLO = { t: 'hello', vid: 0x18d1, pid: 0x9450, usages: [{ page: 12, usage: VOICE_USAGE, name: 'consumer' }] };
const key = (usage: number, down: boolean, ts: number): Record<string, unknown> =>
  ({ t: 'key', page: 12, usage, down, ts, raw: '01 04 00' });

describe('VokieRemote', () => {
  const platform = process.platform;
  beforeEach(() => Object.defineProperty(process, 'platform', { value: 'win32' }));
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
    vi.useRealTimers();
  });

  function remote(spawnImpl: typeof spawn, now: () => number = () => 1_730_000_000_000) {
    const edges: RemoteEdge[] = [];
    const r = new VokieRemote({ onEdge: (e) => edges.push(e), log, spawnImpl, now });
    return { r, edges };
  }

  const phase = (r: VokieRemote): VokieRemoteState => r.state();

  it('starts the helper with the device identity and forwards normalised edges', async () => {
    const { spawnImpl, spawned, line } = fakeHelper();
    const { r, edges } = remote(spawnImpl);
    await r.start();
    expect(phase(r)).toMatchObject({ phase: 'starting', detail: null, supported: true });
    expect(spawned[0]!.args).toContain('-EncodedCommand');
    expect(spawned[0]!.env).toMatchObject({ PET_REMOTE_VENDOR_ID: '6353', PET_REMOTE_PRODUCT_ID: '37968' });
    const script = Buffer.from(spawned[0]!.args.at(-1)!, 'base64').toString('utf16le');
    expect(script).toContain('RegisterRawInputDevices');
    expect(script).toContain('HidP_GetUsages');

    line(HELLO);
    await expect.poll(() => phase(r).phase).toBe('running');
    expect(phase(r).detail).toBeNull();

    line(key(VOICE_USAGE, true, 1000));
    line(key(SELECT_USAGE, true, 1001));
    line(key(BACK_USAGE, false, 1002));
    line(key(0x89, true, 1003));
    await expect.poll(() => edges.length).toBe(4);
    expect(edges).toEqual([
      { button: 'voice', page: 12, usage: VOICE_USAGE, down: true, ts: 1000 },
      { button: 'select', page: 12, usage: SELECT_USAGE, down: true, ts: 1001 },
      { button: 'back', page: 12, usage: BACK_USAGE, down: false, ts: 1002 },
      { button: 'other', page: 12, usage: 0x89, down: true, ts: 1003 },
    ]);
    await r.stop();
    expect(phase(r)).toMatchObject({ phase: 'stopped', detail: null });
  });

  it('uses the injected clock for a key line without ts, and ignores a bad line', async () => {
    const { spawnImpl, line } = fakeHelper();
    const now = 1_730_000_000_042;
    const { r, edges } = remote(spawnImpl, () => now);
    await r.start();
    line(HELLO);
    line({ t: 'key', page: 12, usage: VOICE_USAGE, down: true });
    line({ t: 'key', page: 'twelve', usage: VOICE_USAGE, down: true, ts: 1 });
    line({ nope: true });
    await expect.poll(() => edges.length).toBe(1);
    expect(edges).toEqual([{ button: 'voice', page: 12, usage: VOICE_USAGE, down: true, ts: 1_730_000_000_042 }]);
    await r.stop();
  });

  it('reports a helper error as a detail code and clears it once the remote is ready', async () => {
    const { spawnImpl, line } = fakeHelper();
    const { r } = remote(spawnImpl);
    await r.start();
    line({ t: 'error', code: 'no-device' });
    await expect.poll(() => phase(r).detail).toBe('no-device');
    expect(phase(r).phase).toBe('error');
    line(HELLO);
    await expect.poll(() => phase(r).phase).toBe('running');
    expect(phase(r).detail).toBeNull();
    await r.stop();
  });

  it('restarts an exited helper with a doubling delay and gives up after five', async () => {
    vi.useFakeTimers();
    const { spawnImpl, spawned, exit } = fakeHelper();
    const { r } = remote(spawnImpl);
    await r.start();
    expect(spawned).toHaveLength(1);
    const delays = [RESTART_BASE_MS, RESTART_BASE_MS * 2, RESTART_BASE_MS * 4, RESTART_BASE_MS * 8, RESTART_BASE_MS * 16];
    for (const [i, delay] of delays.entries()) {
      exit(1);
      expect(phase(r).detail).toBe('helper-exited');
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(spawned).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(spawned).toHaveLength(i + 2);
    }
    exit(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawned).toHaveLength(1 + MAX_REMOTE_RESTARTS);
    expect(phase(r)).toMatchObject({ phase: 'error', detail: 'restart-exhausted' });
  });

  it('a hello resets the restart budget, so a long-lived helper is not given up on', async () => {
    vi.useFakeTimers();
    const { spawnImpl, spawned, line, exit } = fakeHelper();
    const { r } = remote(spawnImpl);
    await r.start();
    for (let i = 0; i < MAX_REMOTE_RESTARTS + 1; i++) {
      line(HELLO); // the new instance becomes healthy again
      exit(1);
      await vi.advanceTimersByTimeAsync(RESTART_BASE_MS);
    }
    expect(spawned.length).toBeGreaterThan(1 + MAX_REMOTE_RESTARTS);
    expect(phase(r).detail).not.toBe('restart-exhausted');
    await r.stop();
  });

  it('maps a spawn failure to a detail code instead of throwing', async () => {
    const spawnImpl = (() => { throw new Error('no powershell'); }) as unknown as typeof spawn;
    const { r } = remote(spawnImpl);
    await r.start();
    expect(phase(r)).toMatchObject({ phase: 'error', detail: 'spawn-failed' });
  });

  it('does nothing where the helper cannot run', async () => {
    const { spawnImpl, spawned } = fakeHelper();
    const { r } = remote(spawnImpl);
    Object.defineProperty(process, 'platform', { value: 'linux' });
    await r.start();
    expect(spawned).toHaveLength(0);
    expect(phase(r)).toMatchObject({ phase: 'stopped', supported: false });
    await r.stop();
  });
});
