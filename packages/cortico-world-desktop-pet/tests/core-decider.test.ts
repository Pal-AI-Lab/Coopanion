/**
 * Decider mode through Cortico Core: switching it on reaches the model with the next prefix (the app rebuilds it on
 * `onModeChange`), and Core runs a round's tools one after another, so a bubble that waits for its words still goes
 * out before the question after it, which it would otherwise take down. A restart keeps the stored prefix, and the
 * World starts in the mode it was built for until the rebuild.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Bot } from 'cortico/bot.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { desktopPetDefinition } from '../src/definition.ts';
import type { DesktopPetWorld } from '../src/world.ts';
import { ScriptedModel, startBot } from './helpers/harness.ts';
import { FakePage } from './helpers/page.ts';
import { DeciderMock } from './helpers/decider-mock.ts';

let bot: Bot<CoreConfig> | null = null;
let page: FakePage | null = null;
const mock = new DeciderMock();
const root = mkdtempSync(join(tmpdir(), 'pet-core-decider-'));
const sections = (enabled: boolean) => ({ 'desktop-pet': { port: 0, window: { ...DESKTOP_PET_DEFAULTS.window, enabled: false }, asr: { ...DESKTOP_PET_DEFAULTS.asr, enabled: false }, decider: { ...DESKTOP_PET_DEFAULTS.decider, enabled } } });
const systemOf = (turn: { records: Array<{ item: Record<string, unknown> }> }) => turn.records.filter((r) => r.item.role === 'system');
afterAll(async () => {
  await page?.close();
  await bot?.stop();
  await mock.stop();
});

describe('decider mode through Core', () => {
  it('a switch takes effect at the next prefix, and a bubble and the question after it reach the page in order', async () => {
    await mock.start();
    mock.delayMs = 200;
    mock.answer = () => ({ face: [['开心', .8]] });
    let asked = false;
    const model = new ScriptedModel((turn) => {
      if (turn.tools.includes('pet_feel') && !asked) {
        asked = true;
        return { calls: [
          { name: 'pet_say', args: { text: '在呢!', feeling: '见到对方很开心' } },
          { name: 'pet_ask', args: { question: '想做什么?', options: ['聊天', '休息'] } },
        ] };
      }
      return { calls: [{ name: 'end_turn' }] };
    });
    // the harness lends every secret, the World's OpenRouter key among them
    const definition = desktopPetDefinition({ onModeChange: () => void bot?.core.loop.reloadSystemPrefix(), deciderUrl: mock.url });
    bot = await startBot({ worlds: [definition as never], sections: sections(false), model, root });
    const world = bot.assembly.mounted.find((w) => w.id === 'desktop-pet') as unknown as DesktopPetWorld;
    page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    page.send({ t: 'text', text: '在吗' });
    await expect.poll(() => model.turns.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(model.turns[0]!.tools).toContain('pet_act');

    (world as unknown as { cfg: { decider: { enabled: boolean } } }).cfg.decider.enabled = true;
    await expect.poll(() => world.petMode).toBe('decider');
    const before = model.turns.length;
    page.send({ t: 'text', text: '还在吗' });
    await expect.poll(() => page!.messages.some((m) => m.t === 'ask'), { timeout: 20_000 }).toBe(true);
    expect(model.turns[before]!.tools).toContain('pet_feel');
    expect(model.turns[before]!.tools).not.toContain('pet_act');
    // a bubble sent after the question would come later than the decision's delay
    await sleep(mock.delayMs + 100);
    const orders = page.messages.filter((m) => m.t === 'say' || m.t === 'ask');
    expect(orders.map((m) => m.t)).toEqual(['say', 'ask']);
    expect(orders[0]!.beats).toEqual([{ actions: ['happy'], text: '在呢!', anchors: [] }]);
    expect((world as unknown as { ask: { question: string } | null }).ask?.question).toBe('想做什么?');
  });

  it('after a restart with the switch off, the stored decider prefix is rebuilt for classic mode', async () => {
    // the test before left a session whose prefix was built for decider mode
    expect(JSON.stringify(systemOf({ records: bot!.core.session.records as never }))).toContain('pet_feel');
    await page?.close();
    await bot?.stop();
    page = null;
    bot = null;
    const model = new ScriptedModel(() => ({ calls: [{ name: 'end_turn' }] }));
    let started!: (b: Bot<CoreConfig>) => void;
    const ready = new Promise<Bot<CoreConfig>>((resolve) => { started = resolve; });
    const definition = desktopPetDefinition({ onModeChange: () => void ready.then((b) => b.core.loop.reloadSystemPrefix()), deciderUrl: mock.url });
    bot = await startBot({ worlds: [definition as never], sections: sections(false), model, root });
    started(bot);
    const world = bot.assembly.mounted.find((w) => w.id === 'desktop-pet') as unknown as DesktopPetWorld;
    await expect.poll(() => [world.petMode, world.promptMode]).toEqual(['classic', 'classic']);
    page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    page.send({ t: 'text', text: '又见面了' });
    await expect.poll(() => model.turns.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const turn = model.turns.at(-1)!;
    expect(turn.tools).toContain('pet_act');
    expect(turn.tools).not.toContain('pet_feel');
    const system = systemOf(turn);
    expect(system).toHaveLength(1);
    expect(JSON.stringify(system)).not.toContain('pet_feel');
  });
});
