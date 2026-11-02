import { afterEach, describe, expect, it, vi } from 'vitest';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIpcLogger, type LogNote } from 'cortico/core/ipc-logger.ts';
import { CUA_DEFAULTS } from '../../src/cua/config.ts';
import { Cua } from '../../src/cua/cua.ts';
import type { InputResult, TypeResult, YieldDiagnostics } from '../../src/cua/engine-ipc.ts';
import { UserActivity } from '../../src/cua/engine/user-activity.ts';
import { INPUT_POLL_MS, recordActivity } from '../../src/cua/engine/wait-idle.ts';
import { MODEL_TEXT, type ModelLanguage } from '../../src/cua/model-text.ts';
import { FakeHost } from '../helpers/fake-host.ts';

vi.mock('node:child_process', async (original) => {
  const child = await original<typeof import('node:child_process')>();
  return { ...child, fork: vi.fn(child.fork) };
});

function yielded(kind: 'systemInput' | 'pointerMovement' | 'both', waitedMs = CUA_DEFAULTS.maxYieldWaitMs): TypeResult {
  const input = new UserActivity();
  input.markOwn(1000, { x: 0, y: 0 });
  const activity: YieldDiagnostics = { blockedBy: [], systemInput: { count: 0, lastTick: null }, pointerMovement: { count: 0, lastTick: null }, lastSample: null };
  for (let elapsed = 0; elapsed <= waitedMs; elapsed += INPUT_POLL_MS) {
    const now = 2000 + elapsed;
    recordActivity(activity, input.sample({
      now, lastInputTick: kind === 'pointerMovement' ? 1000 : now,
      cursor: { x: kind === 'systemInput' ? 0 : now, y: 0 },
    }), CUA_DEFAULTS.userIdleMs);
  }
  return {
    displays: [{ index: 1, primary: true, width: 1920, height: 1080 }], layout: 'one', cursor: { display: 1, x: 0, y: 0 },
    foreground: 'Pet typing', foregroundApp: 'pet', foregroundDisplay: 1,
    yielded: true, cancelled: false, waitedMs, activity, typed: 0, stoppedBy: null,
  };
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.mocked(fork).mockReset(); });

/** Real fork IPC and logging, with a child that returns a sampled input result without desktop access. */
async function receiptWorld(result: InputResult, language: ModelLanguage) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-receipt-'));
  const entry = join(dir, 'engine.cjs');
  writeFileSync(entry, `
    const result = ${JSON.stringify(result)};
    process.on('disconnect', () => process.exit(0));
    process.on('message', ({ id, req }) => {
      if (!req) return;
      const value = req.op === 'windows' ? [{
        handle: '1', title: 'Notes', pid: 101, rect: { x: 0, y: 0, width: 640, height: 480 },
        display: 1, minimized: false, foreground: false,
      }] : result;
      process.send({ id, ok: true, value });
    });
  `);
  const original = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  vi.mocked(fork).mockImplementation((_file, _args, options) => original.fork(entry, [], { ...options, execArgv: [] }));
  const cfg = { ...structuredClone(CUA_DEFAULTS), permission: 'never-ask' as const, skipTerminalAsk: true };
  cfg.screenshot.afterAction = false;
  cfg.screenshot.settleMs = 0;
  const world = new Cua({ cfg: () => cfg, modelLanguage: () => language });
  const host = new FakeHost();
  const logs: LogNote[] = [];
  host.log = createIpcLogger((note) => logs.push(JSON.parse(JSON.stringify(note))), 'desktop-pet');
  world.start(host);
  cleanup.push(async () => { await world.stop(); rmSync(dir, { recursive: true, force: true }); });
  const call = (name: string, args: Record<string, unknown>) => world.tools().find((t) => t.name === name)!.handler(args, { role: 'main', log: host.log }) as Promise<{ text: string; failed?: boolean }>;
  return { call, logs };
}

describe.each(['zh', 'en'] as const)('yield receipts in %s', (language) => {
  it.each(['systemInput', 'pointerMovement', 'both'] as const)('names %s, counts, ticks and the foreground program, with one diagnostic per yielded call', async (kind) => {
    const result = yielded(kind);
    const { call, logs } = await receiptWorld(result, language);
    const receipt = await call('pet_cua_click', { x: 1, y: 1 });
    expect(receipt.failed).toBe(true);
    expect(receipt.text).toContain('Pet typing');
    expect(receipt.text).toContain('pet');
    const signals = language === 'zh' ? { systemInput: '系统最后输入时间', pointerMovement: '指针位移' } : { systemInput: 'system last-input time', pointerMovement: 'pointer displacement' };
    for (const signal of result.activity.blockedBy) {
      expect(receipt.text).toContain(signals[signal]);
      expect(receipt.text).toContain(String(result.activity[signal].count));
      expect(receipt.text).toContain(String(result.activity[signal].lastTick));
    }
    if (kind === 'systemInput') expect(receipt.text).toContain(language === 'zh' ? '具体输入设备未知' : 'input device is unknown');
    if (language === 'en') expect(receipt.text).not.toMatch(/\p{Script=Han}/u);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: 'debug', area: 'desktop-pet.cua', msg: 'input yielded', data: {
      tool: 'pet_cua_click', waitedMs: CUA_DEFAULTS.maxYieldWaitMs, activity: result.activity,
      foreground: result.foreground, foregroundApp: result.foregroundApp, cursor: result.cursor,
    } });
  });

  it.each([
    ['pet_cua_move', { x: 1, y: 1 }], ['pet_cua_drag', { from: [1, 1], to: [2, 2] }],
    ['pet_cua_scroll', { x: 1, y: 1, down: 1 }], ['pet_cua_key', { keys: 'enter' }],
    ['pet_cua_type', { text: 'sample text' }], ['pet_cua_focus', { window: 'Notes' }],
  ] as const)('preserves the yield evidence through %s', async (tool, args) => {
    const result = yielded('systemInput');
    const { call, logs } = await receiptWorld(result, language);
    const receipt = await call(tool, args);
    expect(receipt.failed).toBe(true);
    expect(receipt.text).toContain(MODEL_TEXT[language].yieldDetails(result.activity, result.foreground, result.foregroundApp));
    expect(logs[0]).toMatchObject({ data: { tool, activity: result.activity } });
  });

  it('reports the stopping signal and sent character count when typing yields between chunks', async () => {
    const result = { ...yielded('pointerMovement', 0), yielded: false, typed: 16, stoppedBy: 'user' as const };
    const { call, logs } = await receiptWorld(result, language);
    const text = 'sample text '.repeat(4);
    const receipt = await call('pet_cua_type', { text });
    expect(receipt.text).toContain(`16/${text.length}`);
    expect(receipt.text).toContain(MODEL_TEXT[language].yieldDetails(result.activity, result.foreground, result.foregroundApp));
    expect(logs[0]).toMatchObject({ data: { tool: 'pet_cua_type', activity: result.activity } });
    expect(JSON.stringify(logs)).not.toContain(text);
  });

  it.each(['', null])('distinguishes unavailable titles and absent foreground targets (%j)', async (foreground) => {
    const result = { ...yielded('systemInput'), foreground, foregroundApp: foreground === null ? null : 'pet' };
    const { call } = await receiptWorld(result, language);
    const receipt = await call('pet_cua_click', { x: 1, y: 1 });
    expect(receipt.text).toContain(foreground === null ? (language === 'zh' ? '前台窗口「无」' : 'Foreground window "none"') : (language === 'zh' ? '标题不可用' : 'title unavailable'));
  });
});
