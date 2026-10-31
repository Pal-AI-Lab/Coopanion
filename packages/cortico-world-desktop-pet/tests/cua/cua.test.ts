import { describe, expect, it, vi } from 'vitest';
import jpeg from 'jpeg-js';
import { parseKeys } from '../../src/cua/engine/keys.ts';
import { appleString, dialogAnswer, macKey, unicodeChunks } from '../../src/cua/engine/mac-keys.ts';
import { linuxKeysym, zenityAnswer } from '../../src/cua/engine/linux-keys.ts';
import { downscale, drawCursor, encodeJpeg, fit } from '../../src/cua/engine/image.ts';
import { displayAt, ordered, toLocal, toNative } from '../../src/cua/engine/display.ts';
import { CUA_DEFAULTS, type CuaConfig } from '../../src/cua/config.ts';
import { Cua } from '../../src/cua/cua.ts';
import { FakeHost } from '../helpers/fake-host.ts';

describe('parseKeys', () => {
  it('reads chords and sequences, case-insensitively', () => {
    expect(parseKeys('Ctrl+S')).toEqual({ chords: [[{ vk: 0x11, extended: false }, { vk: 0x53, extended: false }]] });
    const seq = parseKeys('ctrl+a delete');
    expect('chords' in seq && seq.chords.map((c) => c.map((k) => k.vk))).toEqual([[0x11, 0x41], [0x2E]]);
    expect(parseKeys('ctrl++')).toEqual({ chords: [[{ vk: 0x11, extended: false }, { vk: 0xBB, extended: false }]] });
  });

  it('marks navigation keys as extended', () => {
    const r = parseKeys('left');
    expect('chords' in r && r.chords[0][0]).toEqual({ vk: 0x25, extended: true });
  });

  it('names the first unknown key', () => {
    expect(parseKeys('ctrl+hyper')).toEqual({ error: '不认识的键「hyper」' });
    expect(parseKeys('   ')).toEqual({ error: '没有给出按键' });
  });
});

describe('image', () => {
  it('fits without upscaling and keeps the aspect ratio', () => {
    expect(fit(2560, 1600, 1280, 800)).toEqual({ width: 1280, height: 800, scale: .5 });
    expect(fit(1920, 1080, 1280, 800)).toMatchObject({ width: 1280, height: 720 });
    expect(fit(800, 600, 1280, 800)).toEqual({ width: 800, height: 600, scale: 1 });
  });

  it('averages each output pixel over its source box and swaps BGRA to RGBA', () => {
    // 2×2 BGRA → 1×1: blue channel 0 and 200 average to 100, red 40 and 0 to 20
    const bgra = new Uint8Array([0, 0, 40, 255, 200, 0, 0, 255, 0, 0, 40, 255, 200, 0, 0, 255]);
    expect([...downscale(bgra, 2, 2, { width: 1, height: 1, scale: .5 })]).toEqual([20, 0, 100, 255]);
  });

  it('draws the pointer and encodes a JPEG of the requested size', () => {
    const rgba = new Uint8Array(40 * 30 * 4).fill(128);
    drawCursor(rgba, 40, 30, 5, 5);
    expect(rgba[(5 * 40 + 5) * 4]).toBe(0); // arrow tip is outline
    expect(rgba[(7 * 40 + 6) * 4]).toBe(255); // inside is filled white
    const out = jpeg.decode(encodeJpeg(rgba, 40, 30, 80));
    expect([out.width, out.height]).toEqual([40, 30]);
  });
});

/** What an engine reports about one 1920×1080 display, as every result carries it. */
const ONE_DISPLAY = { displays: [{ index: 1, primary: true, width: 1920, height: 1080 }], layout: 'one', cursor: { display: 1, x: 0, y: 0 }, foreground: null, foregroundDisplay: 1 };
/** A 10×10 screenshot of that display. */
const SHOT = { ...ONE_DISPLAY, display: 1, jpeg: new Uint8Array(1), width: 10, height: 10, scale: 10 / 1920 };

describe('computer use without the engine', () => {
  const world = () => {
    const cfg = structuredClone(CUA_DEFAULTS);
    return { cfg, world: new Cua({ cfg: () => cfg }) };
  };
  const call = (w: Cua, name: string, args: Record<string, unknown>) =>
    w.tools().find((t) => t.name === name)!.handler(args, { role: 'main', log: new FakeHost().log }) as Promise<{ text: string; failed?: true }>;

  it('rejects points outside the screenshot before touching the screen', async () => {
    const { world: w } = world();
    const out = await call(w, 'pet_cua_click', { x: 5000, y: 10 });
    expect(out.failed).toBe(true);
    expect(out.text).toContain('不在截图范围内');
  });

  it('refuses input when control is off', async () => {
    const { world: w, cfg } = world();
    cfg.control = false;
    for (const [name, args] of [['pet_cua_click', { x: 1, y: 1 }], ['pet_cua_type', { text: 'x' }], ['pet_cua_key', { keys: 'enter' }], ['pet_cua_focus', { window: 'x' }]] as const) {
      const out = await call(w, name, args);
      expect(out.failed).toBe(true);
      expect(out.text).toContain('worlds.desktop-pet.cua.control');
    }
  });

  it('reports an unknown key without pressing anything', async () => {
    const { world: w } = world();
    expect(await call(w, 'pet_cua_key', { keys: 'ctrl+nope' })).toEqual({ text: '[pet_cua_key 没执行] 不认识的键「nope」。', failed: true });
  });

  it('asks once per turn before touching the screen, by the name the bot has then; a refusal fails every call of that turn', async () => {
    const asked: string[] = [];
    let answer: 'no' | 'timeout' = 'no';
    let name = 'Bot';
    const w = new Cua({ cfg: () => ({ ...structuredClone(CUA_DEFAULTS), permission: 'ask-each-turn' }), botName: () => name, askPermission: async (q) => { asked.push(q); return answer; } });
    const shot = await call(w, 'pet_cua_screenshot', {});
    const click = await call(w, 'pet_cua_click', { x: 1, y: 1 });
    expect([shot.failed, click.failed]).toEqual([true, true]);
    expect(shot.text).toContain('没有允许');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('Bot');
    w.onTurnEnded();
    answer = 'timeout';
    name = 'Mochi';
    expect((await call(w, 'pet_cua_windows', {})).text).toContain('没有回应');
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain('Mochi');
  });

  it('checks arguments before asking', async () => {
    const asked: string[] = [];
    const w = new Cua({ cfg: () => structuredClone(CUA_DEFAULTS), askPermission: async (q) => { asked.push(q); return 'no'; } });
    expect((await call(w, 'pet_cua_click', { x: 5000, y: 10 })).text).toContain('不在截图范围内');
    expect(asked).toEqual([]);
  });

  describe('permission levels', () => {
    /** A world whose engine answers every request at once without touching the screen, `foregroundApp` in front; `asked` collects the questions. */
    const levelWorld = (permission: CuaConfig['permission'], answers: Array<'yes' | 'no'>, foregroundApp: string | null = null, foreground: string | null = null) => {
      const cfg = { ...structuredClone(CUA_DEFAULTS), permission, grantMinutes: 30 };
      cfg.screenshot.afterAction = false;
      const asked: string[] = [];
      const w = new Cua({ cfg: () => cfg, askPermission: async (q) => { asked.push(q); return answers.shift() ?? 'no'; } });
      // stands in for the engine child: answers each request through the world's own pending table
      const inner = w as unknown as { spawn: () => unknown; pending: Map<number, { done: (v: unknown) => void; timer: NodeJS.Timeout }> };
      inner.spawn = () => ({
        exitCode: null,
        send({ id, req }: { id: number; req: { op: string } }) {
          const value = req.op === 'screenshot' ? SHOT : req.op === 'windows' ? [] : { ...ONE_DISPLAY, foreground, foregroundApp, yielded: false, waitedMs: 0 };
          const p = inner.pending.get(id)!;
          inner.pending.delete(id);
          clearTimeout(p.timer);
          p.done(value);
        },
      });
      return { w, cfg, asked };
    };
    const see = (w: Cua) => call(w, 'pet_cua_screenshot', {});
    const act = (w: Cua) => call(w, 'pet_cua_click', { x: 1, y: 1 });

    it.each(['Pet typing', ''])('reports the foreground target %j even when it is absent from the window list', async (title) => {
      const { w, cfg } = levelWorld('never-ask', [], 'pet', title);
      cfg.screenshot.settleMs = 0;
      const out = await act(w);
      expect(out.failed).toBeUndefined();
      expect(out.text).toContain(title || '标题不可用');
      expect(out.text).not.toContain('没有窗口在接收键盘输入');
      expect(out.text).not.toContain('前台窗口「无」');
    });

    it('ask-each-turn asks before the first look of every turn', async () => {
      const { w, asked } = levelWorld('ask-each-turn', ['yes', 'yes']);
      expect([(await see(w)).failed, (await act(w)).failed]).toEqual([undefined, undefined]);
      w.onTurnEnded();
      await see(w);
      expect(asked).toHaveLength(2);
    });

    it('ask-before-acting looks without asking and asks before the first input of every turn', async () => {
      const { w, asked } = levelWorld('ask-before-acting', ['no', 'yes']);
      expect((await see(w)).failed).toBeUndefined();
      expect(asked).toHaveLength(0);
      expect((await act(w)).text).toContain('没有允许动鼠标键盘');
      expect((await see(w)).failed).toBeUndefined();
      w.onTurnEnded();
      expect((await act(w)).failed).toBeUndefined();
      expect(asked).toHaveLength(2);
    });

    it('ask-once holds a yes across turns for grantMinutes, then asks again', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const { w, asked } = levelWorld('ask-once', ['yes', 'yes']);
        await act(w);
        w.onTurnEnded();
        await act(w);
        expect(asked).toHaveLength(1);
        expect(asked[0]).toContain('30 分钟');
        vi.setSystemTime(Date.now() + 31 * 60_000);
        await act(w);
        expect(asked).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pet_cua_wait never asks, and under ask-each-turn adds a screenshot only after this turn\'s yes', async () => {
      const { w, asked } = levelWorld('ask-each-turn', ['yes']);
      const wait = () => call(w, 'pet_cua_wait', { seconds: 0 });
      const before = await wait();
      expect([before.failed, 'blobs' in before, asked]).toEqual([undefined, false, []]);
      await see(w);
      expect('blobs' in await wait()).toBe(true);
      expect(asked).toHaveLength(1);
    });

    it('never-ask never asks', async () => {
      const { w, asked } = levelWorld('never-ask', []);
      expect([(await see(w)).failed, (await act(w)).failed]).toEqual([undefined, undefined]);
      expect(asked).toEqual([]);
    });

    it('typing in a terminal is asked about on its own even under never-ask, unless skipTerminalAsk is on', async () => {
      const type = (w: Cua) => call(w, 'pet_cua_type', { text: 'dir' });
      const strict = levelWorld('never-ask', ['no'], 'pwsh');
      expect((await type(strict.w)).text).toContain('命令行窗口');
      expect(strict.asked).toHaveLength(1);
      const skipping = levelWorld('never-ask', [], 'pwsh');
      skipping.cfg.skipTerminalAsk = true;
      expect((await type(skipping.w)).failed).toBeUndefined();
      expect(skipping.asked).toEqual([]);
    });

    it('with skipTerminalAsk on, typing in a terminal gets only the question of the permission level', async () => {
      const { w, cfg, asked } = levelWorld('ask-before-acting', ['yes'], 'pwsh');
      cfg.skipTerminalAsk = true;
      expect((await call(w, 'pet_cua_type', { text: 'dir' })).failed).toBeUndefined();
      expect(asked).toHaveLength(1);
      expect(asked[0]).not.toContain('dir');
    });
  });

  describe('interrupt', () => {
    /** A never-ask world whose engine answers a screenshot at once and holds `type` until a cancel for it arrives. */
    const interruptWorld = () => {
      const cfg = { ...structuredClone(CUA_DEFAULTS), permission: 'never-ask' as const };
      const w = new Cua({ cfg: () => cfg });
      const inner = w as unknown as { spawn: () => unknown; pending: Map<number, { done: (v: unknown) => void; timer: NodeJS.Timeout }> };
      const answer = (id: number, value: unknown) => {
        const p = inner.pending.get(id)!;
        inner.pending.delete(id);
        clearTimeout(p.timer);
        p.done(value);
      };
      const at = ONE_DISPLAY;
      inner.spawn = () => ({
        exitCode: null,
        connected: true,
        send(msg: { id: number; req: { op: string } } | { cancel: number }) {
          if ('cancel' in msg) answer(msg.cancel, { ...at, yielded: false, cancelled: false, waitedMs: 0, typed: 16, stoppedBy: 'cancel' });
          else if (msg.req.op === 'screenshot') answer(msg.id, SHOT);
          else if (msg.req.op === 'info') answer(msg.id, at);
        },
      });
      return w;
    };
    const callAborted = (w: Cua, name: string, args: Record<string, unknown>) => {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 50);
      return w.tools().find((t) => t.name === name)!.handler(args, { role: 'main', log: new FakeHost().log, signal: ac.signal }) as Promise<{ text: string; blobs?: unknown[] }>;
    };

    it('pet_cua_wait ends at the abort, reports the time waited and takes no screenshot', async () => {
      const out = await callAborted(interruptWorld(), 'pet_cua_wait', { seconds: 30 });
      expect(out.text).toMatch(/^等了 0\.\d\/30 秒时收到打断/);
      expect(out.blobs).toBeUndefined();
    });

    it('pet_cua_type sends the engine a cancel on abort and reports how much of the text went out', async () => {
      const out = await callAborted(interruptWorld(), 'pet_cua_type', { text: 'x'.repeat(40) });
      expect(out.text).toContain('只输入了 16/40 个字符:收到打断');
      expect(out.blobs).toBeUndefined();
    });
  });

  it('gives the bot no Chinese of its own when the model text is English: environment prompt, tool declarations, receipts', async () => {
    const cfg = { ...structuredClone(CUA_DEFAULTS), permission: 'never-ask' as const };
    const w = new Cua({ cfg: () => cfg, modelLanguage: () => 'en' });
    // stands in for the engine child: a screenshot, an empty window list, input sent after a short wait
    const inner = w as unknown as { spawn: () => unknown; pending: Map<number, { done: (v: unknown) => void; timer: NodeJS.Timeout }> };
    inner.spawn = () => ({
      exitCode: null,
      send({ id, req }: { id: number; req: { op: string } }) {
        const at = { ...ONE_DISPLAY, foreground: 'Notes' };
        const value = req.op === 'screenshot' ? { ...SHOT, foreground: 'Notes' }
          : req.op === 'windows' ? [] : { ...at, yielded: false, waitedMs: 500 };
        const p = inner.pending.get(id)!;
        inner.pending.delete(id);
        clearTimeout(p.timer);
        p.done(value);
      },
    });
    const HAN = /\p{Script=Han}/u;
    const prompt = await w.envPrompt();
    expect(prompt).not.toMatch(HAN);
    expect(prompt).not.toMatch(/\{\{/);
    expect(JSON.stringify(w.tools().map(({ handler: _, ...decl }) => decl))).not.toMatch(HAN);
    const receipts = [
      await call(w, 'pet_cua_screenshot', {}),
      await call(w, 'pet_cua_click', { x: 1, y: 1, screenshot: false }),
      await call(w, 'pet_cua_click', { x: 5000, y: 1 }),
      await call(w, 'pet_cua_key', { keys: 'ctrl+nope' }),
      await call(w, 'pet_cua_windows', {}),
    ];
    cfg.control = false;
    receipts.push(await call(w, 'pet_cua_type', { text: '你好' }));
    for (const r of receipts) expect(r.text).not.toMatch(HAN);
  });
});

describe('the macOS engine\'s pure parts', () => {
  it('maps the keys pet_cua_key names to Mac key codes, modifiers with their flags', () => {
    const r = parseKeys('cmd+shift+s');
    const keys = 'chords' in r ? r.chords[0]!.map((k) => macKey(k.vk)) : [];
    expect(keys).toEqual([{ key: 0x37, flag: 0x100000 }, { key: 0x38, flag: 0x20000 }, { key: 0x01, flag: 0 }]);
    for (const name of ['enter', 'esc', 'tab', 'backspace', 'delete', 'left', 'pagedown', 'f12', ';', '[', "'", 'a', '0']) {
      const k = parseKeys(name);
      expect('chords' in k && macKey(k.chords[0]![0]!.vk), name).not.toBeNull();
    }
    // keys a Mac keyboard does not have
    for (const name of ['printscreen', 'menu', 'f24']) {
      const k = parseKeys(name);
      expect('chords' in k && macKey(k.chords[0]![0]!.vk), name).toBeNull();
    }
  });

  it('reads the reply of a yes/no dialog', () => {
    expect(dialogAnswer('button returned:可以, gave up:false\n', '可以')).toBe('yes');
    expect(dialogAnswer('button returned:不行, gave up:false', '可以')).toBe('no');
    expect(dialogAnswer('button returned:, gave up:true', '可以')).toBe('timeout');
  });

  it('quotes text for AppleScript', () => {
    expect(appleString('say "hi" \\ bye')).toBe('"say \\"hi\\" \\\\ bye"');
  });

  it('cuts typed text into key events without splitting an emoji', () => {
    const chunks = unicodeChunks('a'.repeat(19) + '😀b', 20);
    expect(chunks.map((c) => c.length)).toEqual([19, 3]);
    expect(String.fromCharCode(...chunks[1]!)).toBe('😀b');
  });
});

describe('the Linux engine\'s pure parts', () => {
  it('maps every key pet_cua_key names to an X11 keysym', () => {
    const r = parseKeys('ctrl+shift+s');
    expect('chords' in r ? r.chords[0]!.map((k) => linuxKeysym(k.vk)) : []).toEqual([0xffe3, 0xffe1, 0x73]);
    for (const name of ['enter', 'esc', 'tab', 'backspace', 'delete', 'left', 'pagedown', 'f12', 'f24', ';', '[', "'", 'a', '0', 'printscreen', 'menu', 'win', 'volumeup']) {
      const k = parseKeys(name);
      expect('chords' in k && linuxKeysym(k.chords[0]![0]!.vk), name).not.toBeNull();
    }
  });

  it('reads the exit code of a zenity question', () => {
    expect(zenityAnswer(0)).toBe('yes');
    expect(zenityAnswer(1)).toBe('no');
    expect(zenityAnswer(5)).toBe('timeout');
    expect(zenityAnswer(null)).toBe('no');
  });
});

describe('displays', () => {
  it('maps a display left of and above the primary, at twice the pixels per unit, both ways; a point in a gap is on none', () => {
    const primary = { id: 'a', primary: true, x: 0, y: 0, width: 1920, height: 1080, scale: 1 };
    const left = { id: 'b', primary: false, x: -1440, y: -900, width: 1440, height: 900, scale: 2 };
    const list = ordered([primary, left]);
    expect(list.map((d) => d.id)).toEqual(['b', 'a']);
    const p = toNative(left, 100, 50);
    expect(p).toEqual({ x: -1390, y: -875 });
    expect(toLocal(left, p.x, p.y)).toEqual({ x: 100, y: 50 });
    expect(displayAt(list, p.x, p.y)).toBe(0);
    expect(displayAt(list, -10, 500)).toBe(-1);
  });

  it('aims input at the display the latest screenshot showed, in its physical pixels and arrangement', async () => {
    const cfg = { ...structuredClone(CUA_DEFAULTS), permission: 'never-ask' as const };
    cfg.screenshot.afterAction = false;
    cfg.screenshot.settleMs = 0;
    const w = new Cua({ cfg: () => cfg });
    const two = { displays: [{ index: 1, primary: true, width: 2560, height: 1600 }, { index: 2, primary: false, width: 3840, height: 2160 }], layout: 'two', cursor: { display: 1, x: 5, y: 5 }, foreground: null, foregroundDisplay: 1 };
    const sent: Array<Record<string, unknown>> = [];
    const inner = w as unknown as { spawn: () => unknown; pending: Map<number, { done: (v: unknown) => void; timer: NodeJS.Timeout }> };
    inner.spawn = () => ({
      exitCode: null,
      send({ id, req }: { id: number; req: Record<string, unknown> }) {
        sent.push(req);
        const value = req.op === 'screenshot' ? { ...two, display: req.display, jpeg: new Uint8Array(1), width: 1280, height: 720, scale: 1280 / 3840 }
          : req.op === 'zoom' ? { jpeg: new Uint8Array(1), width: req.width, height: req.height }
          : { ...two, yielded: false, cancelled: false, waitedMs: 0 };
        const p = inner.pending.get(id)!;
        inner.pending.delete(id);
        clearTimeout(p.timer);
        p.done(value);
      },
    });
    const call = (name: string, args: Record<string, unknown>) =>
      w.tools().find((t) => t.name === name)!.handler(args, { role: 'main', log: new FakeHost().log }) as Promise<{ text: string; failed?: true }>;
    const shot = await call('pet_cua_screenshot', { display: 2 });
    expect(shot.text).toContain('显示器 2/2');
    expect(shot.text).toContain('鼠标在显示器 1 上');
    await call('pet_cua_click', { x: 640, y: 360 });
    expect(sent.find((r) => r.op === 'click')).toMatchObject({ at: { display: 2, layout: 'two' }, x: 1920, y: 1080 });
    await call('pet_cua_click', { x: 1279.9, y: 719.9 });
    expect(sent.filter((r) => r.op === 'click').at(-1)).toMatchObject({ at: { display: 2, layout: 'two' }, x: 3839, y: 2159 });
    await call('pet_cua_zoom', { x: 1279.5, y: 719.5, width: 100, height: 100 });
    expect(sent.find((r) => r.op === 'zoom')).toMatchObject({ x: 3837, y: 2157, width: 3, height: 3 });
    expect((await call('pet_cua_screenshot', { display: 3 })).text).toContain('没有显示器 3');
  });

  it('after an input brings a window forward on another display, the screenshot shows that display', async () => {
    const cfg = { ...structuredClone(CUA_DEFAULTS), permission: 'never-ask' as const };
    cfg.screenshot.settleMs = 0;
    const w = new Cua({ cfg: () => cfg });
    const two = { displays: [{ index: 1, primary: true, width: 2560, height: 1600 }, { index: 2, primary: false, width: 2560, height: 1440 }], layout: 'two', cursor: null };
    // a new window comes up on display 1 once the key has been pressed
    let pressed = false;
    const fg = () => (pressed ? { foreground: 'New window', foregroundDisplay: 1 } : { foreground: 'Browser', foregroundDisplay: 2 });
    const shots: unknown[] = [];
    const inner = w as unknown as { spawn: () => unknown; pending: Map<number, { done: (v: unknown) => void; timer: NodeJS.Timeout }> };
    inner.spawn = () => ({
      exitCode: null,
      send({ id, req }: { id: number; req: Record<string, unknown> }) {
        if (req.op === 'key') pressed = true;
        if (req.op === 'screenshot') shots.push(req.display);
        const display = req.op === 'screenshot' ? (req.display ?? fg().foregroundDisplay) : undefined;
        const value = req.op === 'screenshot' ? { ...two, ...fg(), display, jpeg: new Uint8Array(1), width: 1280, height: 720, scale: 0.5 }
          : { ...two, ...fg(), yielded: false, cancelled: false, waitedMs: 0 };
        const p = inner.pending.get(id)!;
        inner.pending.delete(id);
        clearTimeout(p.timer);
        p.done(value);
      },
    });
    const call = (name: string, args: Record<string, unknown>) =>
      w.tools().find((t) => t.name === name)!.handler(args, { role: 'main', log: new FakeHost().log }) as Promise<{ text: string }>;
    await call('pet_cua_screenshot', { display: 2 });
    const out = await call('pet_cua_key', { keys: 'ctrl+n' });
    expect(shots).toEqual([2, 1]);
    expect(out.text).toContain('显示器 1/2');
  });
});
