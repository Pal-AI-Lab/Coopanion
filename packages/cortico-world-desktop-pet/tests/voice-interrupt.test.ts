import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import type { Bot } from 'cortico/bot.ts';
import { INTERRUPTED_WHILE_RUNNING, NOT_EXECUTED_INTERRUPTED } from 'cortico/core/markers.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import type { TranscribeResult } from '../src/asr/result.ts';
import type { Utterance } from '../src/asr/segmenter.ts';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import type { Cua } from '../src/cua/cua.ts';
import type { MainToChild, ScreenInfo } from '../src/cua/engine-ipc.ts';
import { desktopPetDefinition } from '../src/definition.ts';
import type { DesktopPetWorld } from '../src/world.ts';
import { ScriptedModel, startBot, type Turn } from './helpers/harness.ts';
import { FakePage } from './helpers/page.ts';

/** The native engine supplies display metadata; no screen capture or input reaches the desktop. */
function displayOnlyEngine(cua: Cua): void {
  const boundary = cua as unknown as {
    spawn(): unknown;
    pending: Map<number, { done(value: unknown): void; fail(error: Error): void; timer: NodeJS.Timeout }>;
  };
  const screen: ScreenInfo = {
    displays: [{ index: 1, primary: true, width: 1920, height: 1080 }], layout: 'test-display',
    cursor: { display: 1, x: 0, y: 0 }, foreground: null, foregroundApp: null, foregroundDisplay: 1,
  };
  const engine = Object.assign(new EventEmitter(), {
    connected: true, exitCode: null as number | null,
    send(message: MainToChild) {
      if (!('req' in message)) return;
      const pending = boundary.pending.get(message.id)!;
      boundary.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.req.op === 'info') pending.done(screen);
      else pending.fail(new Error(`Unexpected desktop operation: ${message.req.op}`));
    },
    disconnect() { engine.exitCode = 0; engine.connected = false; engine.emit('exit', 0); },
  });
  cua.unsupported = () => null;
  boundary.spawn = () => engine;
}

function receipt(turn: Turn, name: string): string {
  const call = turn.records.find(({ item }) => item.type === 'function_call' && item.name === name)!.item;
  const result = turn.records.find(({ item }) => item.type === 'function_call_output' && item.call_id === call.call_id)!.item;
  return JSON.stringify(result.output);
}

let bot: Bot<CoreConfig> | null = null;
let page: FakePage | null = null;
afterEach(async () => {
  await page?.close();
  await bot?.stop();
  page = null;
  bot = null;
});

describe('transcribed speech through Core', () => {
  it('ends an active computer-use wait and skips the next tool only after transcription is delivered', async () => {
    let world!: DesktopPetWorld;
    let running: readonly string[] = [];
    const definition = desktopPetDefinition({ onCreate: (created) => {
      world = created;
      displayOnlyEngine((world as unknown as { cua: Cua }).cua);
      const onPhase = world.onRunPhase.bind(world);
      world.onRunPhase = (phase) => { running = phase.running; onPhase(phase); };
    } });
    const model = new ScriptedModel((turn) => turn.n === 0 ? { calls: [
      { name: 'pet_cua_wait', args: { seconds: 30 } },
      { name: 'pet_say', args: { script: '继续下一步' } },
    ] } : { calls: [{ name: 'end_turn' }] });
    bot = await startBot({
      worlds: [definition as never], model,
      sections: { 'desktop-pet': {
        port: 0,
        window: { ...DESKTOP_PET_DEFAULTS.window, enabled: false },
        asr: { ...DESKTOP_PET_DEFAULTS.asr, enabled: false, mic: { ...DESKTOP_PET_DEFAULTS.asr.mic, mode: 'always' } },
        typeKey: { ...DESKTOP_PET_DEFAULTS.typeKey, enabled: false },
        cua: { ...DESKTOP_PET_DEFAULTS.cua, enabled: true, permission: 'ask-each-turn' },
      } },
    });
    page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    page.send({ t: 'text', text: '等待一下' });
    await expect.poll(() => running).toContain('pet_cua_wait');

    // Feed the recognizer's result at the segmenter boundary, with Core and the delivery pipeline running.
    let finish!: (result: TranscribeResult) => void;
    const result = new Promise<TranscribeResult>((resolve) => { finish = resolve; });
    (world as unknown as { enqueue(utterance: Utterance): void }).enqueue({
      pcm: new Int16Array(4800), startMs: 0, durationMs: 300, forced: false, result,
    });
    await page.next((message) => message.t === 'listen' && message.phase === 'transcribing');
    expect(running).toContain('pet_cua_wait');
    expect(model.turns).toHaveLength(1);

    finish({ text: '请停下', ms: 300, error: null });
    expect((await page.next((message) => message.t === 'listen' && message.phase === 'heard')).text).toBe('请停下');
    await expect.poll(() => model.turns.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    const next = model.turns[1];
    expect(receipt(next, 'pet_cua_wait')).toContain(INTERRUPTED_WHILE_RUNNING);
    expect(receipt(next, 'pet_cua_wait')).toContain('/30 秒时收到打断');
    expect(receipt(next, 'pet_say')).toContain(NOT_EXECUTED_INTERRUPTED);
    expect(JSON.stringify(next.records)).toContain('[voice] 伙伴:请停下');
    expect(page.messages.some((message) => message.t === 'say')).toBe(false);
  });
});
