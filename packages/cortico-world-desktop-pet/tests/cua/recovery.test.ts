import { expect, it, vi } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cua } from '../../src/cua/cua.ts';
import { CUA_DEFAULTS } from '../../src/cua/config.ts';
import { FakeHost } from '../helpers/fake-host.ts';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, fork: vi.fn(original.fork) };
});

it('replaces a timed-out engine and keeps the new engine’s calls alive when the old exit arrives', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pet-cua-recovery-'));
  const entry = join(dir, 'engine.cjs');
  writeFileSync(entry, `
    const held = [];
    process.on('disconnect', () => process.exit(0));
    process.on('message', (msg) => {
      if (msg.release) {
        for (const { id } of held.splice(0)) process.send({ id, ok: true, value: {
          displays: [{ index: 1, primary: true, width: 1920, height: 1080 }], layout: 'one',
          cursor: null, foreground: null, foregroundDisplay: 1,
          display: 1, jpeg: new Uint8Array(1), width: 1280, height: 720, scale: 2 / 3,
        } });
      } else if (msg.req) { held.push(msg); process.send({ held: msg.id }); }
    });
  `);
  const original = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  const children: ChildProcess[] = [];
  let lateExit: (() => void) | undefined;
  const held: Array<Promise<void>> = [];
  vi.mocked(fork).mockImplementation((_file, _args, opts) => {
    const child = original.fork(entry, [], { ...opts, execArgv: [] });
    held.push(new Promise((resolve) => child.on('message', (msg) => { if ((msg as { held?: number }).held) resolve(); })));
    if (!children.length) {
      const emit = child.emit.bind(child);
      child.emit = (event: string | symbol, ...args: unknown[]) => {
        if (event !== 'exit') return emit(event, ...args);
        lateExit = () => { lateExit = undefined; emit(event, ...args); };
        return true;
      };
    }
    children.push(child);
    return child;
  });
  const w = new Cua({ cfg: () => ({ ...structuredClone(CUA_DEFAULTS), permission: 'never-ask' }) });
  const shot = () => w.tools().find((t) => t.name === 'pet_cua_screenshot')!.handler({}, { role: 'main', log: new FakeHost().log }) as Promise<{ failed?: boolean; blobs?: unknown[] }>;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const first = shot();
    await Promise.resolve();
    await held[0];
    const closed = once(children[0]!, 'close');
    await vi.runOnlyPendingTimersAsync();
    expect((await first).failed).toBe(true);
    await closed;
    expect(lateExit).toBeTypeOf('function');
    const next = shot();
    await Promise.resolve();
    await held[1];
    expect(children).toHaveLength(2);
    lateExit!();
    children[1]!.send({ release: true });
    const result = await next;
    expect(result.failed).toBeUndefined();
    expect(result.blobs).toHaveLength(1);
  } finally {
    vi.useRealTimers();
    lateExit?.();
    await w.stop();
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    vi.mocked(fork).mockReset();
    rmSync(dir, { recursive: true, force: true });
  }
});
