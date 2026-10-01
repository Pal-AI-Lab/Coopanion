import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dryMountWorld } from 'cortico/extensions/dry-mount.ts';
import { DESKTOP_PET } from '../src/definition.ts';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld, type DesktopPetWorldOptions, type PetBotControls } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

const ctx = { role: 'main', log: new FakeHost().log };

function makeWorld(patch: (c: DesktopPetConfigSection) => void = () => {}, extra: Partial<DesktopPetWorldOptions> = {}) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  patch(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-'));
  const persisted: unknown[] = [];
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai',
    persist: (p) => { persisted.push(p); Object.assign(cfg, p); },
    runtimesRoot: () => join(dir, 'runtimes'), modelsDir: () => join(dir, 'models'),
    ...extra,
  });
  return { world, cfg, persisted };
}

const origin = (w: DesktopPetWorld) => w.petUrl.replace(/\/pet$/, '');
const tool = (w: DesktopPetWorld, name: string) => w.tools().find((t) => t.name === name)!;

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function mounted(patch?: (c: DesktopPetConfigSection) => void, extra?: Partial<DesktopPetWorldOptions>) {
  const made = makeWorld(patch, extra);
  const host = new FakeHost();
  await made.world.start(host);
  cleanup.push(() => made.world.stop());
  return { ...made, host };
}

describe('definition', () => {
  it('passes the extension dry mount', async () => {
    const report = await dryMountWorld(DESKTOP_PET as never, { scratchDir: mkdtempSync(join(tmpdir(), 'pet-dry-')), packageDir: fileURLToPath(new URL('../', import.meta.url)), hasConsoleClient: true });
    expect(report.failures).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});

describe('tools without a page', () => {
  it('fail and say the window is not connected', async () => {
    const { world } = await mounted();
    const out = await tool(world, 'pet_say').handler({ script: '你好' }, ctx);
    expect(out).toMatchObject({ failed: true });
    expect((out as { text: string }).text).toContain('没有连接');
  });
});

describe('with a pet page', () => {
  it('pet_say sends parsed beats and reports dropped markers', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_say').handler({ script: '【开心,飞】你好<眨眼>呀' }, ctx) as { text: string };
    const say = await page.next((m) => m.t === 'say');
    expect(say.beats).toEqual([{ actions: ['happy'], text: '你好呀', anchors: [{ at: 2, actions: ['wink'] }] }]);
    expect(out.text).toContain('飞');
  });

  it('pet_ask delivers the chosen option as an answer event that wakes', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    await tool(world, 'pet_ask').handler({ question: '喝什么?', options: ['茶', '咖啡', '水', '果汁'] }, ctx);
    const ask = await page.next((m) => m.t === 'ask');
    expect(ask.options).toEqual(['茶', '咖啡', '水']);
    page.send({ t: 'answer', askId: ask.id, index: 1 });
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.answer', source: 'desktop-pet', text: '[回答] 伙伴回答「喝什么?」:选了第 2 项「咖啡」' });
    expect(host.pushOpts[0]).toEqual({ trigger: 'flush' });
  });

  it('pet_ask reports a free answer and a dismissal', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    await tool(world, 'pet_ask').handler({ question: 'A?', options: ['x'] }, ctx);
    const a1 = await page.next((m) => m.t === 'ask');
    page.send({ t: 'answer', askId: a1.id, text: '都不要' });
    await expect.poll(() => host.events.length).toBe(1);
    await tool(world, 'pet_ask').handler({ question: 'B?', options: ['y'] }, ctx);
    const a2 = await page.next((m) => m.t === 'ask');
    page.send({ t: 'answer', askId: a2.id, dismissed: true });
    await expect.poll(() => host.events.length).toBe(2);
    expect(host.events.map((e) => e.text)).toEqual(['[回答] 伙伴回答「A?」:自己写了:「都不要」', '[回答] 伙伴关掉了提问「B?」,没有作答。']);
  });

  it('an answer to a replaced question is ignored', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    await tool(world, 'pet_ask').handler({ question: 'old?', options: ['x'] }, ctx);
    const old = await page.next((m) => m.t === 'ask');
    const out = await tool(world, 'pet_say').handler({ script: '算了' }, ctx) as { text: string };
    expect(out.text).toContain('替换了还没回答的提问「old?」');
    page.send({ t: 'answer', askId: old.id, index: 0 });
    page.send({ t: 'text', text: 'ping' });
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].type).toBe('desktop-pet.message');
  });

  it('pet_walk_to waits for the page to report arrival or interruption', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const arriving = tool(world, 'pet_walk_to').handler({ to: 'right', run: true }, ctx);
    const walk = await page.next((m) => m.t === 'walk');
    expect(walk).toMatchObject({ to: .95, run: true });
    page.send({ t: 'arrived', walkId: walk.id, x: .95 });
    expect(await arriving).toEqual({ text: '走到了屏幕横向 95% 处。' });

    const interrupted = tool(world, 'pet_walk_to').handler({ to: .1 }, ctx);
    const w2 = await page.next((m) => m.t === 'walk');
    page.send({ t: 'interrupted', walkId: w2.id, x: .4, by: 'drag' });
    expect(await interrupted).toEqual({ text: '没走到:走到 40% 处时被伙伴拎起来了。' });
  });

  it('pet_walk_to rejects a target it cannot read', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(await tool(world, 'pet_walk_to').handler({ to: 'moon' }, ctx)).toMatchObject({ failed: true });
  });

  it('pet_act forwards known actions', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['跳', 'happy', 'sit', 'fly'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['jump', 'happy', 'sit']);
    expect(out.text).toContain('sit 会一直保持到下一个动作');
    expect(out.text).toContain('fly');
  });

  it('merges repeated pokes into one touch event', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    for (let i = 0; i < 3; i++) page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.touch', text: '[互动] 伙伴戳了你 3 下' });
    expect(host.pushOpts[0]).toEqual({ trigger: 'debounce' });
  });

  it('petting and a drop wait for the next wake; a poke wakes once until a turn ends', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'touch', kind: 'pet' });
    page.send({ t: 'touch', kind: 'grab' });
    page.send({ t: 'touch', kind: 'drop', x: 300 });
    page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(3);
    page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(4);
    world.onTurnEnded();
    page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(5);
    expect(host.pushOpts.map((o) => o?.trigger)).toEqual(['piggyback', 'piggyback', 'debounce', 'piggyback', 'debounce']);
  });

  it('reports a throw that ends in a crash as one event', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'touch', kind: 'grab' });
    page.send({ t: 'touch', kind: 'throw', x: 300 });
    page.send({ t: 'touch', kind: 'crash' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(1);
    expect(host.events[0].text).toBe('[互动] 伙伴把你拎起来甩了出去,你重重落地,摔晕了一会儿');
  });

  it('sends no touch events when touch reporting is off', async () => {
    const { world, host } = await mounted((c) => { c.touch.enabled = false; });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'touch', kind: 'poke' });
    page.send({ t: 'text', text: 'hi' });
    await expect.poll(() => host.events.length).toBe(1);
    await new Promise((r) => setTimeout(r, 2800));
    expect(host.events.map((e) => e.type)).toEqual(['desktop-pet.message']);
  });

  it('a skin saved from the dressing page is persisted and pushed to the pet', async () => {
    const { world, persisted } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const skin = { ...DESKTOP_PET_DEFAULTS.skin, head: 'cat', palette: 'fox' };
    const res = await fetch(`${origin(world)}/api/skin`, { method: 'POST', body: JSON.stringify({ skin }) });
    expect(res.status).toBe(200);
    expect(persisted).toContainEqual({ skin });
    expect((await page.next((m) => m.t === 'prefs')).skin).toEqual(skin);
  });

  it('the position the page reports is written once, on stop, and the next run starts there', async () => {
    const made = await mounted((c) => { c.rememberPosition = true; });
    const page = await FakePage.open(origin(made.world));
    page.send({ t: 'position', x: 0.3 });
    page.send({ t: 'position', x: 'left' });
    page.send({ t: 'position', x: 0.6 });
    page.send({ t: 'text', text: 'ping' });
    await expect.poll(() => made.host.events.length).toBe(1);
    expect(made.persisted).toEqual([]);
    await page.close();
    await made.world.stop();
    expect(made.persisted).toEqual([{ petX: 0.6 }]);

    const again = await mounted((c) => { c.rememberPosition = true; c.petX = 0.6; });
    const next = await FakePage.open(origin(again.world));
    expect(next.init.startX).toBe(0.6);
    await next.close();
    await again.world.stop();
    expect(again.persisted).toEqual([]);
  });

  it('with rememberPosition off the page gets no start position and a saved one is cleared on stop', async () => {
    const made = await mounted((c) => { c.petX = 0.6; });
    const page = await FakePage.open(origin(made.world));
    expect(page.init.startX).toBeNull();
    await page.close();
    await made.world.stop();
    expect(made.persisted).toEqual([{ petX: null }]);
  });

  it('a browser tab only watches while the pet window is connected', async () => {
    const { world } = await mounted();
    const win = await FakePage.open(origin(world), 'role=pet&host=window');
    cleanup.push(() => win.close());
    const tab = await FakePage.open(origin(world), 'role=pet&host=tab');
    cleanup.push(() => tab.close());
    await tab.next((m) => m.t === 'watching');
    await tool(world, 'pet_act').handler({ actions: ['nod'] }, ctx);
    await win.next((m) => m.t === 'act');
    expect(tab.messages.some((m) => m.t === 'act')).toBe(false);
  });

  it('a watching tab still sends typed text and a theme switch, which reaches the pet window', async () => {
    const { world, host, persisted } = await mounted();
    const win = await FakePage.open(origin(world), 'role=pet&host=window');
    cleanup.push(() => win.close());
    const tab = await FakePage.open(origin(world), 'role=pet&host=tab');
    cleanup.push(() => tab.close());
    await tab.next((m) => m.t === 'watching');
    tab.send({ t: 'text', text: 'hi' });
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.message', text: '[打字] 伙伴:hi' });
    const theme = DESKTOP_PET_DEFAULTS.theme === 'dark' ? 'light' : 'dark';
    tab.send({ t: 'prefs', theme });
    expect((await win.next((m) => m.t === 'prefs')).theme).toBe(theme);
    expect(persisted).toContainEqual({ theme });
    expect((await (await fetch(`${origin(world)}/api/state`)).json()).theme).toBe(theme);
  });

  it('confirm resolves from the bubble without an event to the bot', async () => {
    const { world, host } = await mounted();
    expect(await world.confirm('可以吗?', ['可以', '不行'])).toBe('unavailable');
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const yes = world.confirm('可以吗?', ['可以', '不行']);
    const c1 = await page.next((m) => m.t === 'confirm');
    expect(c1).toMatchObject({ question: '可以吗?', options: ['可以', '不行'] });
    page.send({ t: 'confirmed', id: c1.id, index: 0 });
    expect(await yes).toBe('yes');
    const closed = world.confirm('再问一次?', ['可以', '不行']);
    page.send({ t: 'confirmed', id: (await page.next((m) => m.t === 'confirm')).id, index: null });
    expect(await closed).toBe('dismissed');
    const gone = world.confirm('还在吗?', ['可以', '不行']);
    await page.next((m) => m.t === 'confirm');
    await page.close();
    expect(await gone).toBe('unavailable');
    expect(host.events).toHaveLength(0);
  });

  it('dialog steps resolve from the bubble without an event to the bot', async () => {
    const { world, host } = await mounted();
    expect(await world.dialog({ text: '在吗?' }).answer).toEqual({ unavailable: true });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());

    const name = world.dialog({ text: '怎么称呼你?', actions: ['思考', '不存在'], step: [1, 5], closable: true, input: { kind: 'text', submit: '好' } });
    const d1 = await page.next((m) => m.t === 'dialog');
    // vocabulary words arrive as ids, unknown ones are left out
    expect(d1).toMatchObject({ text: '怎么称呼你?', actions: ['thinking'], step: [1, 5], closable: true, input: { kind: 'text' } });
    page.send({ t: 'dialog', id: d1.id, text: '小明' });
    expect(await name.answer).toEqual({ text: '小明' });

    const pick = world.dialog({ text: '选一个', input: { kind: 'buttons', options: [{ label: 'A' }, { label: 'B' }] } });
    page.send({ t: 'dialog', id: (await page.next((m) => m.t === 'dialog')).id, index: 1 });
    expect(await pick.answer).toEqual({ index: 1 });

    const closed = world.dialog({ text: '跳过?', closable: true, input: { kind: 'text', submit: '好', alt: '算了' } });
    page.send({ t: 'dialog', id: (await page.next((m) => m.t === 'dialog')).id, closed: true });
    expect(await closed.answer).toEqual({ closed: true });

    // a progress step moves with update and ends when the app closes it
    const bar = world.dialog({ text: '下载中', input: { kind: 'progress' } });
    const d4 = await page.next((m) => m.t === 'dialog');
    bar.update({ progress: .5 });
    expect(await page.next((m) => m.t === 'dialog-update')).toMatchObject({ id: d4.id, progress: .5 });
    bar.close();
    expect(await page.next((m) => m.t === 'dialog-close')).toMatchObject({ id: d4.id });
    expect(await bar.answer).toEqual({ done: true });

    const gone = world.dialog({ text: '还在吗?', input: { kind: 'buttons', options: [{ label: '在' }] } });
    await page.next((m) => m.t === 'dialog');
    await page.close();
    expect(await gone.answer).toEqual({ unavailable: true });
    expect(host.events).toHaveLength(0);
  });

  it('the pet panel runs the app\'s introduction when the app lends one', async () => {
    let runs = 0;
    const { world } = await mounted(undefined, { controls: { guide: () => { runs++; } } });
    await world.console().invoke!('pet', 'guide', []);
    expect(runs).toBe(1);
    const bare = await mounted();
    await expect(bare.world.console().invoke!('pet', 'guide', [])).rejects.toThrow('没有引导');
  });

  it('the menu header carries the bot and its run controls; clicks reach them', async () => {
    const calls: string[] = [];
    let paused = false;
    const controls: PetBotControls = {
      isPaused: () => paused,
      setPaused: (p) => { paused = p; calls.push(p ? 'pause' : 'resume'); },
      openSettings: () => calls.push('settings'),
      quit: () => calls.push('quit'),
      quitLabel: '退出 App',
    };
    const dir = mkdtempSync(join(tmpdir(), 'pet-avatar-'));
    const avatarFile = join(dir, 'avatar.png');
    writeFileSync(avatarFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { world } = await mounted(undefined, { botName: 'Bot', avatarFile, controls });
    const res = await fetch(`${origin(world)}/api/avatar`);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const win = await FakePage.open(origin(world), 'role=pet&host=window');
    cleanup.push(() => win.close());
    const tab = await FakePage.open(origin(world), 'role=pet&host=tab');
    cleanup.push(() => tab.close());
    const state = await (await fetch(`${origin(world)}/api/state`)).json() as { bot: Record<string, unknown> };
    expect(state.bot).toMatchObject({
      name: 'Bot', controls: true, buttons: { pause: true, settings: true, dress: false, quit: true }, paused: false, quitLabel: '退出 App', avatar: expect.any(String),
    });
    win.send({ t: 'control', action: 'pause' });
    expect((await win.next((m) => m.t === 'prefs')).bot).toMatchObject({ paused: true });
    tab.send({ t: 'control', action: 'settings' });
    tab.send({ t: 'control', action: 'quit' });
    await expect.poll(() => calls).toEqual(['pause', 'settings', 'quit']);
  });

  it('the menu header shows only the controls the app lends', async () => {
    const calls: string[] = [];
    const { world } = await mounted(undefined, { botName: 'Bot', controls: { openSettings: () => calls.push('settings') } });
    const win = await FakePage.open(origin(world), 'role=pet&host=window');
    cleanup.push(() => win.close());
    const state = await (await fetch(`${origin(world)}/api/state`)).json() as { bot: Record<string, unknown> };
    expect(state.bot).toMatchObject({ controls: true, buttons: { pause: false, settings: true, dress: false, quit: false }, paused: null, quitLabel: '', quitPrompt: '' });
    // controls that were not lent are ignored
    win.send({ t: 'control', action: 'pause' });
    win.send({ t: 'control', action: 'quit' });
    win.send({ t: 'control', action: 'settings' });
    await expect.poll(() => calls).toEqual(['settings']);
  });

  it('rejects requests whose Host is not a loopback name', async () => {
    const { world } = await mounted();
    const url = new URL(origin(world));
    const res = await new Promise<number>((done) => {
      import('node:http').then(({ request }) => {
        const req = request({ host: '127.0.0.1', port: url.port, path: '/api/state', headers: { host: 'evil.example' } }, (r) => done(r.statusCode ?? 0));
        req.end();
      });
    });
    expect(res).toBe(421);
  });
});
