/**
 * Through Cortico Core: an event wakes the bot, the scripted model calls the computer-use tools in
 * Core's loop, the screenshot comes back as an image blob in the tool result, and the real
 * target window receives the input. `pnpm test:e2e` only.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { Bot } from 'cortico/bot.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { DESKTOP_PET } from '../../../src/definition.ts';
import { DESKTOP_PET_DEFAULTS } from '../../../src/config.ts';
import { ScriptedModel, startBot, triggerWorld, type Turn } from './harness.ts';
import { Target, center, type Ready, type Rect } from './target.ts';

const outputs = (t: Turn) => t.records.filter((r) => r.item.type === 'function_call_output');
const outputText = (r: Turn['records'][number]) => {
  const o = r.item.output;
  if (typeof o === 'string') return o;
  return (o as Array<{ type: string; text?: string }>).filter((p) => p.type === 'input_text').map((p) => p.text).join('');
};

let bot: Bot<CoreConfig> | null = null;
let target: Target | null = null;
afterAll(async () => {
  target?.close();
  await bot?.stop();
});

describe.runIf(process.platform === 'win32')('CUA through Core', () => {
  it('a woken bot looks at the screen, fills the text box and submits it', async () => {
    let ready!: Ready;
    ({ target, ready } = await Target.open(`CUA Core ${process.pid}`));
    let scale = 1;
    const at = (r: Rect) => { const c = center(r); return { x: Math.round(c.x * scale), y: Math.round(c.y * scale) }; };
    let screenshotBlob: { mime: string } | undefined;

    const model = new ScriptedModel((turn) => {
      if (turn.n === 0) {
        expect(turn.tools).toEqual(expect.arrayContaining(['pet_cua_screenshot', 'pet_cua_click', 'pet_cua_type', 'end_turn']));
        expect(JSON.stringify(turn.records)).toContain('请把输入框填上');
        return { calls: [{ name: 'pet_cua_screenshot' }] };
      }
      if (turn.n === 1) {
        const out = outputs(turn).at(-1)!;
        screenshotBlob = out.context?.blobs?.[0];
        const m = /截图 (\d+)×\d+\(屏幕 (\d+)×\d+\)/.exec(outputText(out));
        scale = Number(m![1]) / Number(m![2]);
        return { calls: [
          { name: 'pet_cua_click', args: { ...at(ready.box), screenshot: false } },
          { name: 'pet_cua_type', args: { text: 'via core 你好', screenshot: false } },
          { name: 'pet_cua_click', args: { ...at(ready.button), screenshot: false } },
        ] };
      }
      return { calls: [{ name: 'end_turn' }] };
    });

    bot = await startBot({
      worlds: [DESKTOP_PET as never, triggerWorld('[e2e] 请把输入框填上 via core 你好 并提交')],
      // the pet window stays closed: computer use alone, as the desktop-pet World's tools
      sections: { 'desktop-pet': {
        window: { ...DESKTOP_PET_DEFAULTS.window, enabled: false },
        asr: { ...DESKTOP_PET_DEFAULTS.asr, enabled: false },
        cua: { ...DESKTOP_PET_DEFAULTS.cua, enabled: true, userIdleMs: 300, maxYieldWaitMs: 8000 },
      } },
      model,
    });

    const submit = await target.next((e) => e.event === 'submit', 60_000);
    expect(submit.text).toBe('via core 你好');
    expect(screenshotBlob?.mime).toBe('image/jpeg');
    await expect.poll(() => model.turns.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
    const results = outputs(model.turns[2]).map(outputText);
    expect(results.some((t) => t.includes('已在') && t.includes('左键单击'))).toBe(true);
    expect(results.some((t) => t.includes('已发送 11 个字符'))).toBe(true);
  });
});
