/**
 * Real desktop, real input: the World drives a WinForms window through the engine child
 * process and the window reports what it received. Moves the mouse and types on this
 * machine while it runs; `pnpm test:e2e` only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import jpeg from 'jpeg-js';
import { CUA_DEFAULTS } from '../../../src/cua/config.ts';
import { Cua } from '../../../src/cua/cua.ts';
import { FakeHost } from '../../helpers/fake-host.ts';
import { Target, center, type Ready, type Rect } from './target.ts';

type Outcome = { text: string; blobs?: Array<{ bytes: Uint8Array; mime: string }>; failed?: true };
const ctx = { role: 'main', log: new FakeHost().log };

let world: Cua;
let target: Target;
let ready: Ready;
let scale = 1;
const cfg = structuredClone(CUA_DEFAULTS);

const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await world.tools().find((t) => t.name === name)!.handler(args, ctx)) as Outcome;
const shot = (p: { x: number; y: number }) => ({ x: Math.round(p.x * scale), y: Math.round(p.y * scale) });
const at = (r: Rect) => shot(center(r));

beforeAll(async () => {
  // a fixed script on its own window: nobody is there to answer a permission question
  Object.assign(cfg, { enabled: true, permission: 'never-ask', userIdleMs: 300, maxYieldWaitMs: 8000 });
  cfg.screenshot.settleMs = 250;
  world = new Cua({ cfg: () => cfg });
  world.start(new FakeHost());
  await world.ready();
  ({ target, ready } = await Target.open(`CUA Target ${process.pid}`));
}, 60_000);

afterAll(async () => {
  target?.close();
  await world?.stop();
});

describe.runIf(process.platform === 'win32')('desktop', () => {
  it('screenshot is a scaled JPEG of the real screen with the pointer position reported', async () => {
    const out = await call('pet_cua_screenshot');
    // one display: (屏幕 W×H); several: (显示器 n/m,W×H…)
    const m = /截图 (\d+)×(\d+)\((?:屏幕 |显示器 \d+\/\d+,)(\d+)×(\d+)/.exec(out.text)!;
    expect(m).not.toBeNull();
    const [w, h, sw] = [Number(m[1]), Number(m[2]), Number(m[3])];
    expect(w).toBeLessThanOrEqual(cfg.screenshot.maxWidth);
    expect(h).toBeLessThanOrEqual(cfg.screenshot.maxHeight);
    scale = w / sw;
    expect(out.blobs?.[0].mime).toBe('image/jpeg');
    const img = jpeg.decode(out.blobs![0].bytes, { useTArray: true });
    expect([img.width, img.height]).toEqual([w, h]);
    // the target's magenta block appears where the target says it is; its top-left quarter, clear of a pointer drawn at its middle
    const p = shot({ x: ready.swatch.x + ready.swatch.width / 4, y: ready.swatch.y + ready.swatch.height / 4 });
    const i = (p.y * img.width + p.x) * 4;
    expect(img.data[i]).toBeGreaterThan(200);
    expect(img.data[i + 1]).toBeLessThan(70);
    expect(img.data[i + 2]).toBeGreaterThan(200);
  });

  it('clicks into the text box, types mixed-script text and submits with the button', async () => {
    expect((await call('pet_cua_click', { ...at(ready.box), screenshot: false })).failed).toBeUndefined();
    const typed = await call('pet_cua_type', { text: 'hello 桌宠 123', screenshot: false });
    expect(typed.text).toContain('已发送 12 个字符');
    const clicked = await call('pet_cua_click', at(ready.button));
    expect(clicked.blobs?.length).toBe(1);
    expect((await target.next((e) => e.event === 'submit')).text).toBe('hello 桌宠 123');
  });

  it('presses key chords: select all, retype, Enter', async () => {
    await call('pet_cua_click', { ...at(ready.box), screenshot: false });
    await call('pet_cua_key', { keys: 'ctrl+a', screenshot: false });
    await call('pet_cua_type', { text: 'second', screenshot: false });
    const out = await call('pet_cua_key', { keys: 'enter', screenshot: false });
    expect(out.text).toContain('已按 enter');
    expect((await target.next((e) => e.event === 'submit')).text).toBe('second');
  });

  it('scrolls the list under the pointer', async () => {
    await call('pet_cua_scroll', { ...at(ready.list), down: 5, screenshot: false });
    const ev = await target.next((e) => e.event === 'scroll');
    expect(Number(ev.top)).toBeGreaterThan(0);
  });

  it('lists the target window and reports it in the foreground after focusing it', async () => {
    const list = await call('pet_cua_windows');
    expect(list.text).toContain(ready.title);
    const out = await call('pet_cua_focus', { window: ready.title, screenshot: false });
    expect(out.text).toContain(`「${ready.title}」`);
  });

  it('waits for the user to stop moving the pointer before acting', async () => {
    // an outside process moves the pointer, as a user would
    spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point 5,5'], { stdio: 'ignore' });
    const out = await call('pet_cua_move', { ...at(ready.swatch), screenshot: false });
    expect(out.text).toMatch(/先等用户停手/);
  });

  it('refuses input when control is off, and still takes screenshots', async () => {
    cfg.control = false;
    try {
      expect(await call('pet_cua_click', at(ready.button))).toMatchObject({ failed: true });
      expect((await call('pet_cua_screenshot')).blobs?.length).toBe(1);
    } finally {
      cfg.control = true;
    }
  });

  it('rejects coordinates outside the screenshot', async () => {
    const out = await call('pet_cua_click', { x: 99999, y: 5 });
    expect(out).toMatchObject({ failed: true });
    expect(out.text).toContain('不在截图范围内');
  });
});
