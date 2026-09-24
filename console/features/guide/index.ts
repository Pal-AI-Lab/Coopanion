/**
 * The guide: the first time the settings window opens, Coo walks onto a stage covering the whole
 * window and sets things up with the person as a conversation. Coo asks in its bubble, the answer
 * goes in the reply area under the stage, and Coo acts on it at once:
 *
 * 1. hello, and what to call the person (the desktop-pet World's `user`);
 * 2. how lively to be (`roam`): while the choices are up Coo shows each one, standing still,
 *    strolling, or running back and forth;
 * 3. the DeepSeek key, saved and tested through the same calls as the home page (model.ts);
 * 4. voice input: the speech model is downloaded here with one click when it is missing, then how
 *    to talk (the talk key as the voice input panel reports it) and where its buttons are;
 * 5. where to find it once the window is closed, then off to the home page or the dressing page.
 *
 * Coo is the pet's real body (pet-core from the desktop-pet package), in the pet's current dress,
 * so it moves, blinks and reacts to a poke as on the desktop. The small button at the top right
 * skips; finishing or skipping is remembered in the window's localStorage, and the home page's
 * 「使用引导」 opens it again through `requestGuide`. main.ts shows it and owns its lifecycle, so it
 * outlives the page under it. Styles are in guide.css.
 */
import { createPet, createSfx, normalizeSkin, skinCss, type PetController, type Roam } from 'cortico-world-desktop-pet/web/pet-core.js';
import { get, post, setConfig } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { Router } from '../../core/router.ts';
import type { ConsoleUi } from '../../../shared/client-panel.ts';
import { KEY_URL, keyConnected, readDetail, readStatus, saveKey, type Detail, type Status } from '../home/model.ts';

const SEEN = 'companion.guide';
const REQUEST = 'companion-guide-request';
const PET_PAGE = 'world:desktop-pet';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
const SOUND_KEY = 'worlds.desktop-pet.sound';
/** The seed's default name: shown as the placeholder, so the box invites a real one. */
const DEFAULT_USER = '主人';
/** Characters Coo types per second, as the pet page does. */
const TYPE_CPS = 20;
/** Seconds Coo's line stays after it is typed, before the reply area comes up. */
const LINE_REST = .35;
/** On a Mac the app's icon is in the menu bar, not in a tray at the bottom right. */
const MAC = /Macintosh|Mac OS X/.test(navigator.userAgent);
/** Motions `say` passes to `act`; any other name is an expression. */
const MOTIONS = new Set(['hop', 'nod', 'spin', 'jump', 'shake', 'look']);

const S = pick({
  zh: {
    brand: '认识 Coo',
    skip: '跳过',
    skipHint: '跳过引导;之后可以在「开始」页重新打开',
    dot: (n: number) => `第 ${n} 步`,

    hello: '你好呀!我是 Coo,以后就住在你屏幕的底边啦,库...',
    helloReply: '你好,Coo!',
    askName: '我该怎么称呼你?',
    nameSend: '就这么叫',
    gotName: (name: string) => `${name},记住啦!`,
    askRoam: '平时我该安静一点,还是活泼一点?点一下,看看我会怎样。',
    roam: { off: '不乱动', calm: '多待着', free: '常走动' } as Record<Roam, string>,
    roamLevel: { off: '低', calm: '中', free: '高' } as Record<Roam, string>,
    roamSay: {
      off: '那我就乖乖站着,你叫我我再动。',
      calm: '我会时不时溜达一圈,大多时候待着。',
      free: '我可以到处跑来跑去,库...!',
    } as Record<Roam, string>,
    roamOk: '就这样',
    roamDone: '好,就按这个来。',

    askKey: '要和你聊天,我得先连上大模型。填一个 DeepSeek 的 API Key 吧,按用量计费,注意 token 消耗哦。',
    keyPlaceholder: 'sk-…',
    keyLabel: 'API Key',
    connect: '连接',
    connecting: '正在连接…',
    getKey: '还没有 Key?去 DeepSeek 开放平台申请',
    keyLater: '稍后再填',
    keyEmpty: '先粘贴 Key',
    keyOk: (model: string) => `连上了${model ? `(${model})` : ''}!现在我能说话啦,库...`,
    keyFail: (why: string) => `没连上:${why}。看看 Key 是不是完整,账户里还有没有余额?`,
    keyAlready: (model: string) => `模型已经连好了${model ? `(${model})` : ''},省事,库...`,
    keySkipped: '没关系,等你填好我再开口。「开始」页随时能填。',

    askModel: (mb: number) => `要听懂你说话,我得先下载一个语音识别模型(FunASR,约 ${mb} MB,从 ModelScope 下载)。现在下吗?`,
    download: '下载',
    notNow: '先不用',
    downloading: (pct: number) => `正在下载…${pct}%`,
    downloaded: '下好了,现在我听得懂你说话啦,库...',
    downloadFail: (why: string) => `没下载下来:${why}。之后可以在「语音输入」页再试。`,
    modelLater: '好,之后在「语音输入」页一键就能下。',
    talkHold: (key: string) => `想和我说话,按住 ${key} 说,松开就发给我。`,
    talkToggle: (key: string) => `想和我说话,按一下 ${key} 开始,再按一下结束。`,
    talkAlways: '我一直在听,直接说话就行。',
    talkOff: '语音输入现在关着,可以在「语音输入」页打开。',
    talkType: '也可以双击我打字。',
    talkKeyDefault: '右 Ctrl',
    gotIt: '知道了',
    buttons: '鼠标停在我身上,旁边会冒出几个按钮;右键我,能打开菜单。',
    ok: '好',
    tray: '关掉这个窗口我也还在屏幕底边。想再打开设置,点任务栏右下角托盘里我的图标。',
    trayMac: '关掉这个窗口我也还在屏幕底边。想再打开设置,点屏幕顶上菜单栏里我的图标。',
    finish: '开始吧',
    dress: '先给我换身衣服',
    skipped: '引导已跳过。想再看,点「开始」页右上角的「使用引导」。',
  },
  en: {
    brand: 'Meet Coo',
    skip: 'Skip',
    skipHint: 'Skip the guide; the Start page opens it again',
    dot: (n: number) => `Step ${n}`,

    hello: "Hi! I'm Coo. I'll be living at the bottom of your screen, koo...",
    helloReply: 'Hi, Coo!',
    askName: 'What should I call you?',
    nameSend: 'Call me that',
    gotName: (name: string) => `${name}, got it!`,
    askRoam: 'Should I keep still or run around? Click one and watch me.',
    roam: { off: 'Stay put', calm: 'Now and then', free: 'Walk a lot' } as Record<Roam, string>,
    roamLevel: { off: 'Low', calm: 'Mid', free: 'High' } as Record<Roam, string>,
    roamSay: {
      off: "I'll stand still until you call me.",
      calm: "I'll stroll around now and then, and mostly stay.",
      free: "I'll run all over the place, koo...!",
    } as Record<Roam, string>,
    roamOk: 'That one',
    roamDone: 'Okay, that it is.',

    askKey: 'To talk with you I need a language model. Enter a DeepSeek API key; it is billed by use, so keep an eye on token usage.',
    keyPlaceholder: 'sk-…',
    keyLabel: 'API Key',
    connect: 'Connect',
    connecting: 'Connecting…',
    getKey: 'No key yet? Get one on the DeepSeek platform',
    keyLater: 'Later',
    keyEmpty: 'Paste the key first',
    keyOk: (model: string) => `Connected${model ? ` (${model})` : ''}! Now I can talk, koo...`,
    keyFail: (why: string) => `Not connected: ${why}. Is the key complete, and is there balance left?`,
    keyAlready: (model: string) => `The model is connected already${model ? ` (${model})` : ''}, koo...`,
    keySkipped: "No problem, I'll stay quiet until there is a key. The Start page takes it any time.",

    askModel: (mb: number) => `To understand you I need a speech model (FunASR, about ${mb} MB, from ModelScope). Download it now?`,
    download: 'Download',
    notNow: 'Not now',
    downloading: (pct: number) => `Downloading… ${pct}%`,
    downloaded: 'Done! Now I understand what you say, koo...',
    downloadFail: (why: string) => `The download failed: ${why}. Try again on the Voice input page.`,
    modelLater: 'OK, the Voice input page downloads it with one click.',
    talkHold: (key: string) => `To talk to me, hold ${key} and speak; let go to send.`,
    talkToggle: (key: string) => `To talk to me, press ${key} to start and again to stop.`,
    talkAlways: 'I am always listening; just talk.',
    talkOff: 'Voice input is off; turn it on on the Voice input page.',
    talkType: ' You can also double-click me to type.',
    talkKeyDefault: 'Right Ctrl',
    gotIt: 'Got it',
    buttons: 'Rest the pointer on me and buttons pop up beside me; right-click me for the menu.',
    ok: 'OK',
    tray: 'Closing this window does not send me away. The tray icon at the bottom right opens settings again.',
    trayMac: 'Closing this window does not send me away. My icon in the menu bar at the top opens settings again.',
    finish: "Let's go",
    dress: 'Dress me up first',
    skipped: 'Guide skipped. Open it again with "Guide" at the top right of the Start page.',
  },
});

export function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === 'done';
  } catch {
    return true; // without storage it would show on every open
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN, 'done');
  } catch { /* 无痕/配额满:这次会话里不再弹 */ }
}

/** Pages ask for the guide (the home page's link); main.ts owns it. */
export function requestGuide(): void {
  window.dispatchEvent(new CustomEvent(REQUEST));
}

export function onGuideRequest(cb: () => void, signal: AbortSignal): void {
  window.addEventListener(REQUEST, () => cb(), { signal });
}

/** The toast after a skip, so the way back is known. */
export const guideSkippedText = S.skipped;

/** The brand mark at the top left: Coo drawn after the app icon. */
const COO_MARK = `<svg class="coo" viewBox="0 0 512 512" aria-hidden="true">
  <path d="M347 182 A118 118 0 1 0 347 318" fill="none" stroke="currentColor" stroke-width="62" stroke-linecap="round"/>
  <rect x="196" y="352" width="42" height="80" rx="21" fill="currentColor"/>
  <rect x="270" y="352" width="42" height="80" rx="21" fill="currentColor"/>
  <g fill="none" stroke="#2fd39a" stroke-width="13"><circle cx="236" cy="220" r="19"/><circle cx="304" cy="220" r="19"/></g>
</svg>`;

export interface GuideOptions {
  doc: Document;
  ui: ConsoleUi;
  router: Router;
  signal: AbortSignal;
  /** The guide closed: finished (possibly on the way to another page) or skipped at the top right. */
  onClose: (how: 'done' | 'skip') => void;
}

interface VoiceState {
  enabled?: boolean;
  engine?: 'funasr' | 'system';
  model?: { phase: 'absent' | 'working' | 'ready' | 'error'; done: number; total: number | null; bytes: number; detail: string | null };
  input?: { effectiveMode?: 'hold' | 'toggle' | 'always'; hotkeyLabel?: string };
}
interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** The conversation was cut short: the guide closed while Coo talked or waited for an answer. */
class Closed extends Error {}

/** Steps of the conversation, for the progress dots. */
const STEPS = ['hello', 'name', 'roam', 'key', 'talk', 'done'] as const;
type Step = typeof STEPS[number];

const SVG_NS = 'http://www.w3.org/2000/svg';

export function openGuide(o: GuideOptions): void {
  const { ui, signal, doc } = o;
  const opts = { signal };
  const h = ui.h;

  const root = h('div', 'guide');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', S.brand);

  /* ---------- frame: brand, progress, skip ---------- */
  const top = h('header', 'guide-top');
  const brand = h('div', 'guide-brand');
  const brandMark = h('span', 'guide-brandmark');
  brandMark.innerHTML = COO_MARK;
  brand.append(brandMark, h('span', null, S.brand));
  const dots = h('div', 'guide-dots');
  const dotEls = STEPS.map((_, i) => {
    const d = h('span', 'guide-dot');
    d.setAttribute('aria-label', S.dot(i + 1));
    dots.append(d);
    return d;
  });
  const skip = h('button', 'guide-skip');
  skip.type = 'button';
  skip.title = S.skipHint;
  skip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  skip.prepend(h('span', null, S.skip));
  top.append(brand, dots, skip);

  /* ---------- the stage: Coo on the floor, its bubble over its head ---------- */
  const stage = h('main', 'guide-world');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'guide-petsvg');
  svg.setAttribute('aria-hidden', 'true');
  const shadowEl = doc.createElementNS(SVG_NS, 'ellipse');
  shadowEl.setAttribute('class', 'shadow');
  const petG = doc.createElementNS(SVG_NS, 'g');
  const fxG = doc.createElementNS(SVG_NS, 'g');
  svg.append(shadowEl, petG, fxG);
  const bubble = h('div', 'guide-say');
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.hidden = true;
  const bubbleText = h('p', 'guide-saytext');
  bubble.append(bubbleText);
  stage.append(h('div', 'guide-floor'), svg, bubble);

  /* ---------- the reply area: what the person answers with ---------- */
  const reply = h('section', 'guide-reply');
  root.append(top, stage, reply);

  /* ---------- the body ---------- */
  const sfx = createSfx({ storageKey: 'companion.guide.sound' });
  root.addEventListener('pointerdown', () => sfx.unlock(), { ...opts, once: true });
  root.addEventListener('keydown', () => sfx.unlock(), { ...opts, once: true });
  let size = { W: 0, H: 0 };
  /** Coo's size on the stage: larger than on the desktop, smaller on a short window. */
  const scaleFor = (H: number) => Math.max(.5, Math.min(.95, H / 420));
  const ctl: PetController = createPet({ petG, shadowEl, fxG }, {
    sfx,
    roam: 'off',
    enter: 'drop',
    bounds: () => ({ W: size.W, H: size.H, floorY: size.H - 34, S: scaleFor(size.H) }),
  });
  const measure = () => {
    const r = stage.getBoundingClientRect();
    size = { W: r.width, H: r.height };
    ctl.resize();
  };
  // Coo's colors follow the console's light or dark mode, as the pet follows its own theme
  const skinStyle = doc.createElement('style');
  root.append(skinStyle);
  const paint = (raw: unknown) => {
    const skin = normalizeSkin(raw);
    stage.dataset.theme = doc.documentElement.dataset.colorMode === 'dark' ? 'dark' : 'light';
    skinStyle.textContent = skinCss(skin, '.guide-world');
    ctl.setSkin(skin);
  };

  /**
   * How Coo moves while the guide runs: `still` stands in the middle, `walk` strolls to a new spot
   * now and then, `run` runs from side to side. Shown live while the person picks how lively to be.
   */
  let motion: 'still' | 'walk' | 'run' = 'still';
  let nextMove = 0;
  const direct = () => {
    if (ctl.busy() || ctl.time < nextMove || ctl.pet.mode !== 'idle') return;
    const { W } = size;
    if (motion === 'still') {
      if (Math.abs(ctl.pet.x - W / 2) > 30) ctl.walkTo(W / 2, false);
      nextMove = ctl.time + 1;
      return;
    }
    const run = motion === 'run';
    // somewhere on the other side of the stage, so every move is plain to see
    const side = ctl.pet.x < W / 2 ? .6 + Math.random() * .3 : .1 + Math.random() * .3;
    if (run && Math.random() < .3) { ctl.act('hop'); nextMove = ctl.time + .5; return; }
    if (ctl.walkTo(W * side, run)) nextMove = ctl.time + (run ? .1 : 1.4 + Math.random() * 1.4);
  };

  /* pointer: Coo can be poked, petted and picked up here too */
  const at = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  stage.addEventListener('pointermove', (e) => { stage.style.cursor = ctl.pointerMove(at(e)); }, opts);
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (ctl.pointerDown(at(e))) { stage.setPointerCapture(e.pointerId); e.preventDefault(); }
  }, opts);
  const up = () => { ctl.pointerUp(); stage.style.cursor = ''; };
  stage.addEventListener('pointerup', up, opts);
  stage.addEventListener('pointercancel', up, opts);
  stage.addEventListener('pointerleave', () => ctl.pointerLeave(), opts);

  /* the frame loop: body, then the bubble over its head */
  let last = performance.now();
  let raf = 0;
  const placeBubble = () => {
    const a = ctl.anchor();
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const left = Math.max(12, Math.min(size.W - bw - 12, a.x - bw / 2 + ctl.pet.facing * 20));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(10, a.y - bh - 18)}px`;
    bubble.style.setProperty('--tail', `${Math.max(22, Math.min(bw - 22, a.x - left))}px`);
  };
  const frame = (now: number) => {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    direct();
    ctl.step(dt);
    ctl.render();
    if (!bubble.hidden) placeBubble();
    raf = requestAnimationFrame(frame);
  };

  /* ---------- talking and answering ---------- */
  let closed = false;
  const alive = () => { if (closed || signal.aborted) throw new Closed(); };
  const wait = (s: number) => new Promise<void>((resolve, reject) => {
    if (closed || signal.aborted) { reject(new Closed()); return; }
    const onAbort = () => { clearTimeout(t); reject(new Closed()); };
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, s * 1000);
    signal.addEventListener('abort', onAbort, { once: true });
  });

  /** A newer line cuts the one being typed (the roam choices speak while clicked). */
  let saying = 0;
  /** Coo says one line: a new bubble, typed as the pet types, with an expression or motion first. */
  const say = async (text: string, act?: string) => {
    alive();
    const mine = ++saying;
    if (act) { if (MOTIONS.has(act)) ctl.act(act); else ctl.setExpr(act); }
    bubble.hidden = false;
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
    bubbleText.textContent = '';
    sfx.pop();
    for (let i = 1; i <= text.length; i++) {
      if (mine !== saying) return;
      const ch = text[i - 1]!;
      bubbleText.textContent = text.slice(0, i);
      if (!/[\s,。!?…、,.!?「」:()]/.test(ch)) { sfx.babble(ch); ctl.talk(); }
      await wait(/[,。!?…、,.!?]/.test(ch) ? 5 / TYPE_CPS : 1 / TYPE_CPS);
    }
    await wait(LINE_REST);
  };

  /** Puts the controls `build` makes in the reply area and waits for one of them to call `done`. */
  const answer = <T>(build: (done: (value: T) => void) => HTMLElement[]): Promise<T> => new Promise<T>((resolve, reject) => {
    alive();
    let settled = false;
    const done = (value: T) => {
      if (settled) return;
      settled = true;
      sfx.select();
      reply.classList.remove('in');
      resolve(value);
    };
    reply.replaceChildren(...build(done));
    void reply.offsetWidth;
    reply.classList.add('in');
    reply.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    signal.addEventListener('abort', () => { if (!settled) reject(new Closed()); }, { once: true });
  });
  const showWait = (text: string) => { reply.replaceChildren(h('p', 'guide-wait', text)); reply.classList.add('in'); };
  const clearReply = () => { reply.replaceChildren(); reply.classList.remove('in'); };

  const button = (label: string, onClick: () => void, primary = false) => {
    const b = ui.button(label, primary ? { variant: 'primary' } : {});
    b.addEventListener('click', onClick, opts);
    return b;
  };

  const progress = (step: Step) => {
    const n = STEPS.indexOf(step);
    dotEls.forEach((d, i) => { d.classList.toggle('on', i === n); d.classList.toggle('past', i < n); });
  };

  /* ---------- live data ---------- */
  let values: Record<string, unknown> = {};
  const loadValues = async () => {
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      values = d.groups?.find((g) => g.group.id === PET_PAGE)?.values ?? {};
    } catch { values = {}; }
  };
  const panel = <T>(name: string, method: string) =>
    post<T>(`/api/console/providers/${encodeURIComponent(PET_PAGE)}/panels/${name}/${method}`, { args: [] }, opts).catch(() => null);

  /* ---------- the conversation ---------- */
  const conversation = async () => {
    await loadValues();
    if (values[SOUND_KEY] === false) sfx.set(false);
    paint((await panel<{ skin?: unknown }>('pet', 'state'))?.skin ?? null);
    await wait(1.1);

    // 1 hello
    progress('hello');
    await say(S.hello, 'happy');
    await answer<void>((done) => [button(S.helloReply, () => done(), true)]);
    ctl.act('hop');

    // 2 what to call the person
    progress('name');
    await say(S.askName, 'thinking');
    const saved = typeof values[USER_KEY] === 'string' ? values[USER_KEY] as string : '';
    const name = await answer<string>((done) => {
      const form = h('form', 'guide-form');
      const input = ui.input({ placeholder: DEFAULT_USER });
      input.maxLength = 20;
      if (saved && saved !== DEFAULT_USER) input.value = saved;
      const send = ui.button(S.nameSend, { variant: 'primary' });
      send.type = 'submit';
      form.append(input, send);
      form.addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim() || saved || DEFAULT_USER); }, opts);
      return [form];
    });
    if (name !== saved) void setConfig(PET_PAGE, { [USER_KEY]: name }, opts).catch(() => {});
    await say(S.gotName(name), 'love');

    // 3 how lively: each choice plays out on the stage while it is picked
    progress('roam');
    await say(S.askRoam);
    const MOTION: Record<Roam, typeof motion> = { off: 'still', calm: 'walk', free: 'run' };
    let roam: Roam = values[ROAM_KEY] === 'off' || values[ROAM_KEY] === 'free' ? values[ROAM_KEY] as Roam : 'calm';
    roam = await answer<Roam>((done) => {
      const row = h('div', 'guide-choices');
      const choices = (['off', 'calm', 'free'] as Roam[]).map((r) => {
        const b = h('button', 'guide-choice');
        b.type = 'button';
        b.dataset.roam = r;
        b.append(h('span', 'guide-choicelevel', S.roamLevel[r]), h('span', null, S.roam[r]));
        b.addEventListener('click', () => {
          pickRoam(r);
          sfx.tick();
          void say(S.roamSay[r], r === 'off' ? 'neutral' : 'happy').catch(() => {});
        }, opts);
        row.append(b);
        return [r, b] as const;
      });
      const pickRoam = (r: Roam) => {
        roam = r;
        motion = MOTION[r];
        nextMove = 0;
        for (const [id, b] of choices) b.classList.toggle('on', id === r);
      };
      pickRoam(roam);
      return [row, button(S.roamOk, () => done(roam), true)];
    });
    void setConfig(PET_PAGE, { [ROAM_KEY]: roam }, opts).catch(() => {});
    await say(S.roamDone, 'nod');
    motion = 'still';

    // 4 the model key
    progress('key');
    let detail: Detail | null = await readDetail(signal);
    let status: Status | null = await readStatus(signal).catch(() => null);
    const modelName = () => status?.modelConnection?.model ?? '';
    if (keyConnected(status, detail)) {
      await say(S.keyAlready(modelName()), 'happy');
    } else {
      await say(S.askKey, 'thinking');
      for (;;) {
        const key = await answer<string | null>((done) => {
          const form = h('form', 'guide-form');
          const input = ui.input({ placeholder: S.keyPlaceholder });
          input.type = 'password';
          input.autocomplete = 'off';
          input.spellcheck = false;
          input.setAttribute('aria-label', S.keyLabel);
          const send = ui.button(S.connect, { variant: 'primary' });
          send.type = 'submit';
          form.append(input, send);
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = input.value.trim();
            if (!v) { input.placeholder = S.keyEmpty; input.focus(); return; }
            done(v);
          }, opts);
          const links = h('div', 'guide-links');
          const link = h('a', 'guide-link', S.getKey);
          link.href = KEY_URL; link.target = '_blank'; link.rel = 'noopener';
          const later = h('button', 'guide-textbtn', S.keyLater);
          later.type = 'button';
          later.addEventListener('click', () => done(null), opts);
          links.append(link, later);
          return [form, links];
        });
        if (key === null) { await say(S.keySkipped, 'sad'); break; }
        ctl.setThinking(true);
        showWait(S.connecting);
        let result: { ok: boolean; why: string | null };
        try {
          result = await saveKey(key, detail, signal);
        } catch (err) {
          if (signal.aborted) throw new Closed();
          result = { ok: false, why: err instanceof Error ? err.message : String(err) };
        }
        detail = await readDetail(signal);
        status = await readStatus(signal).catch(() => null);
        ctl.setThinking(false);
        clearReply();
        if (result.ok) { await say(S.keyOk(modelName()), 'love'); ctl.act('jump'); break; }
        await say(S.keyFail(result.why ?? '?'), 'sad');
      }
    }

    // 5 how to talk, where the buttons are, where to find Coo later
    progress('talk');
    let voice = await panel<VoiceState>('voice', 'state');
    if (voice?.enabled !== false && voice?.engine === 'funasr' && voice.model && voice.model.phase !== 'ready') {
      await say(S.askModel(Math.round(voice.model.bytes / 1048576)), 'thinking');
      const want = await answer<boolean>((done) => [button(S.download, () => done(true), true), button(S.notNow, () => done(false))]);
      if (!want) await say(S.modelLater);
      else {
        void panel('voice', 'install');
        ctl.setThinking(true);
        for (;;) {
          await wait(.5);
          voice = await panel<VoiceState>('voice', 'state');
          const m = voice?.model;
          if (!m || m.phase === 'ready' || m.phase === 'error' || m.phase === 'absent') break;
          showWait(S.downloading(m.total ? Math.floor(m.done / m.total * 100) : 0));
        }
        ctl.setThinking(false);
        clearReply();
        if (voice?.model?.phase === 'ready') { ctl.act('hop'); await say(S.downloaded, 'love'); }
        else await say(S.downloadFail(voice?.model?.detail ?? '?'), 'sad');
      }
    }
    const talkKey = voice?.input?.hotkeyLabel || S.talkKeyDefault;
    const mode = voice?.input?.effectiveMode ?? 'hold';
    const on = voice?.enabled !== false;
    ctl.setListening(true);
    await say(`${!on ? S.talkOff : mode === 'hold' ? S.talkHold(talkKey) : mode === 'toggle' ? S.talkToggle(talkKey) : S.talkAlways}${S.talkType}`);
    await answer<void>((done) => {
      const out: HTMLElement[] = [];
      if (on && mode !== 'always') out.push(h('kbd', 'guide-keycap', talkKey));
      out.push(button(S.gotIt, () => done(), true));
      return out;
    });
    ctl.setListening(false);
    await say(S.buttons, 'wink');
    await answer<void>((done) => [button(S.ok, () => done(), true)]);

    progress('done');
    await say(MAC ? S.trayMac : S.tray, 'happy');
    const where = await answer<'home' | 'dress'>((done) => [
      button(S.finish, () => done('home'), true),
      button(S.dress, () => done('dress')),
    ]);
    ctl.act('spin');
    await wait(.4);
    close('done');
    o.router.navigate([where]);
  };

  /* ---------- open and close ---------- */
  const remove = () => { cancelAnimationFrame(raf); root.remove(); doc.body.classList.remove('guide-open'); };
  function close(how: 'done' | 'skip'): void {
    if (closed) return;
    closed = true;
    markSeen();
    // fades out on its own; the owner's lifecycle may end right away
    root.classList.add('leaving');
    root.inert = true;
    setTimeout(remove, 180);
    o.onClose(how);
  }
  skip.addEventListener('click', () => close('skip'), opts);
  signal.addEventListener('abort', () => { if (!closed) remove(); }, { once: true });
  window.addEventListener('resize', measure, opts);

  doc.body.classList.add('guide-open');
  doc.body.append(root);
  measure();
  paint(null);
  raf = requestAnimationFrame(frame);
  conversation().catch((err) => { if (!(err instanceof Closed)) console.error('[guide]', err); });
}
