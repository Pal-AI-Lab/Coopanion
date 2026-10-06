/**
 * 「对话」: the desktop-pet World's chat panel as a page. The person types and sends images as
 * themselves (`[打字]` events, delivered with `preempt`); the pet's lines show as the bubbles the pet
 * itself draws, its questions can be answered here, and the tool steps between two lines fold into
 * one row. Messages the bot has not taken in yet wait above the composer, where they can be sent at
 * once (`interrupt`) or taken back.
 *
 * Everything shown comes from the World's stream (packages/cortico-world-desktop-pet/src/chat.ts);
 * the phase line is Core's RunPhase as the World passes it on.
 */
import { panelRoute, panelStreamRoute } from '../../../shared/console-protocol.ts';
import type { ConsoleImageAttachment } from '../../../shared/client-panel.ts';
import { pick } from '../../core/language.ts';
import { openStream } from '../../core/stream.ts';
import { browserSocketEnv } from '../../core/websocket.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { requestMode } from '../mode.ts';

const PET_PAGE = 'world:desktop-pet';

interface WireImage { ref: string; mime: string; name?: string }
interface SayBeat { text: string; mood?: Record<string, string> }
type ChatItem =
  | { kind: 'user'; cursor: number; ts: string; via: 'chat' | 'bubble' | 'voice'; text: string; images?: WireImage[]; at?: number }
  | { kind: 'answer'; cursor: number; ts: string; askId: string; index?: number; text?: string; dismissed?: true }
  | { kind: 'touch'; cursor: number; ts: string; text: string }
  | { kind: 'say'; cursor: number; ts: string; beats: SayBeat[] }
  | { kind: 'ask'; cursor: number; ts: string; askId: string; question: string; options: string[]; own: boolean }
  | { kind: 'activity'; cursor: number; ts: string; steps: string[]; ms: number };
type UserItem = Extract<ChatItem, { kind: 'user' }>;
interface RunPhase { state: 'idle' | 'delivering' | 'model' | 'tools' | 'backoff' | 'handoff'; running: readonly string[]; retryAt?: string }

const S = pick({
  zh: {
    nav: '对话',
    title: '对话',
    trace: '运行轨迹',
    traceHint: '高级模式里的完整运行轨迹:上下文、工具调用与原始事件',
    placeholder: (bot: string) => `和 ${bot} 说点什么…`,
    connecting: '正在连接…',
    empty: (bot: string) => `还没有和 ${bot} 说过话。`,
    older: '更早的对话',
    voice: '语音',
    idle: '空闲',
    thinking: (bot: string) => `${bot} 在想…`,
    doing: (what: string) => `正在${what}`,
    retry: (at: string) => `模型没有应答,${at} 重试`,
    handoff: '在整理之前的对话',
    paused: '已暂停 · 消息在继续后送达',
    queued: (bot: string) => `排队中,${bot} 做完这一步就看`,
    queuedPaused: '已暂停,继续后送达',
    sendNow: '立即发送',
    sendNowHint: (bot: string) => `打断 ${bot} 正在做的这一步,马上送达`,
    withdraw: '撤回',
    withdrawHint: '退回输入框',
    discarded: '没送达:排队的消息被清空了',
    imageCount: (n: number) => `[${n} 张图]`,
    ownAnswer: '自己回答…',
    send: '发送',
    computer: '操作电脑',
    steps: (n: number) => `${n} 步`,
    things: (n: number) => `做了 ${n} 件事`,
    seconds: (s: number) => `${s} 秒`,
    imagesUnseen: (bot: string) => `现在的模型看不到图片,${bot} 只会知道你发了几张图。`,
  },
  en: {
    nav: 'Chat',
    title: 'Chat',
    trace: 'Run trace',
    traceHint: 'The full run trace in advanced mode: context, tool calls and raw events',
    placeholder: (bot: string) => `Say something to ${bot}…`,
    connecting: 'Connecting…',
    empty: (bot: string) => `Nothing said to ${bot} yet.`,
    older: 'Earlier',
    voice: 'Voice',
    idle: 'Idle',
    thinking: (bot: string) => `${bot} is thinking…`,
    doing: (what: string) => `Busy: ${what}`,
    retry: (at: string) => `The model did not answer; retrying at ${at}`,
    handoff: 'Tidying up the earlier conversation',
    paused: 'Paused · messages arrive once resumed',
    queued: (bot: string) => `Queued; ${bot} reads it after this step`,
    queuedPaused: 'Paused; delivered once resumed',
    sendNow: 'Send now',
    sendNowHint: (bot: string) => `Stop what ${bot} is doing and deliver it now`,
    withdraw: 'Take back',
    withdrawHint: 'Back into the composer',
    discarded: 'Not delivered: the queue was cleared',
    imageCount: (n: number) => `[${n} image${n === 1 ? '' : 's'}]`,
    ownAnswer: 'Your own answer…',
    send: 'Send',
    computer: 'Using the computer',
    steps: (n: number) => `${n} step${n === 1 ? '' : 's'}`,
    things: (n: number) => `${n} thing${n === 1 ? '' : 's'} done`,
    seconds: (s: number) => `${s} s`,
    imagesUnseen: (bot: string) => `The current model cannot see images; ${bot} only learns how many you sent.`,
  },
});

/** What the person reads for a tool's name. Tools not named here (the Persona's notes and turn control, other Worlds') stay in the run trace. */
const STEP = pick({
  zh: {
    cua_screenshot: '截屏', cua_click: '点击', cua_move: '移动鼠标', cua_drag: '拖动', cua_scroll: '滚动', cua_type: '打字',
    cua_key: '按键', cua_windows: '查看窗口', cua_focus: '切换窗口', cua_wait: '等待',
    pet_walk_to: '走动', pet_act: '做动作', pet_set: '调整自己', pet_quiet: '安静一会儿',
  } as Record<string, string>,
  en: {
    cua_screenshot: 'Screenshot', cua_click: 'Click', cua_move: 'Move the mouse', cua_drag: 'Drag', cua_scroll: 'Scroll', cua_type: 'Type',
    cua_key: 'Press keys', cua_windows: 'List windows', cua_focus: 'Switch window', cua_wait: 'Wait',
    pet_walk_to: 'Walk', pet_act: 'Move about', pet_set: 'Adjust itself', pet_quiet: 'Keep quiet',
  } as Record<string, string>,
});
const stepLabel = (name: string): string => STEP[name] ?? name;
const shownSteps = (steps: readonly string[]): string[] => steps.filter((s) => s in STEP);

/** One folded row's title: a run of computer steps, one step by name, or a count. */
function activityTitle(steps: readonly string[]): string {
  if (steps.every((s) => s.startsWith('cua_'))) return `${S.computer} · ${S.steps(steps.length)}`;
  return steps.length === 1 ? stepLabel(steps[0]) : S.things(steps.length);
}

const LANG = pick({ zh: 'zh', en: 'en' });
/** An expression by its name in the console's language; without one, English shows the word's id and Chinese any name. */
const moodName = (mood: Record<string, string>): string => mood[LANG] ?? (LANG === 'en' ? mood.id : mood.zh) ?? mood.id ?? '';

const AVATAR_URL = '/api/avatar';
const blobUrl = (ref: string): string => `${panelRoute(PET_PAGE, 'chat', 'blob')}?args=${encodeURIComponent(JSON.stringify([ref]))}`;

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root } = ctx;
  const doc = root.ownerDocument;
  const env = browserSocketEnv(window);
  const view = ui.h('div', 'chatview');
  root.append(view);

  let bot = 'Coo';
  let paused = false;
  let phase: RunPhase | null = null;
  let live: { steps: string[]; startedAt: number } | null = null;
  let more = false;
  let before: number | null = null;
  let imagesSeen = true;
  /** Shown items by cursor, in the order the bot met them (`at` for a message that waited, else the cursor). */
  const items = new Map<number, ChatItem>();
  /** The person's messages the bot has not taken in yet. */
  const pending = new Map<number, UserItem>();
  /** Messages that never reached the bot. */
  const discarded = new Set<number>();
  /** What this page sent, by the id it gave, then by cursor: a withdrawn message comes back as typed. */
  const sentById = new Map<number, { text: string; images: readonly ConsoleImageAttachment[] }>();
  const sentByCursor = new Map<number, { text: string; images: readonly ConsoleImageAttachment[] }>();
  let nextSend = 1;

  // ---- layout
  const top = ui.h('div', 'chat-top');
  const title = ui.h('h1', null, S.title);
  const phaseEl = ui.h('span', 'chat-phase');
  const phaseDot = ui.h('span', 'dot');
  const phaseText = ui.h('span');
  phaseEl.append(phaseDot, phaseText);
  const trace = ui.h('button', 'chat-trace', S.trace);
  trace.type = 'button';
  trace.title = S.traceHint;
  trace.addEventListener('click', () => { requestMode('advanced'); ctx.router.navigate(['live']); }, { signal: ctx.signal });
  top.append(title, phaseEl, ui.h('span', 'grow'), trace);

  const scroll = ui.h('div', 'chat-scroll');
  const thread = ui.h('div', 'chat-thread');
  scroll.append(thread);

  const dock = ui.h('div', 'chat-dock');
  const queueBox = ui.h('div', 'chat-queue');
  const composer = ui.promptInput({
    label: S.title,
    placeholder: S.connecting,
    images: { max: 8 },
    onSubmit: (text, images) => {
      const id = nextSend++;
      sentById.set(id, { text, images });
      stream.send(JSON.stringify({ t: 'send', id, text, images: images.map((i) => ({ mime: i.mime, base64: i.base64, name: i.name })) }));
      if (images.length && !imagesSeen) ui.toast(S.imagesUnseen(bot));
      return true;
    },
  });
  dock.append(queueBox, composer.el);
  view.append(top, scroll, dock);

  // ---- phase line
  const syncPhase = (): void => {
    const p = phase;
    let state = 'idle', text = S.idle;
    if (paused) { state = 'paused'; text = S.paused; }
    else if (p?.state === 'model' || p?.state === 'delivering') { state = 'busy'; text = S.thinking(bot); }
    else if (p?.state === 'tools') { const named = shownSteps(p.running); state = 'busy'; text = named.length ? S.doing(stepLabel(named[named.length - 1])) : S.thinking(bot); }
    else if (p?.state === 'backoff') { state = 'warn'; text = S.retry(p.retryAt ? new Date(p.retryAt).toLocaleTimeString() : '…'); }
    else if (p?.state === 'handoff') { state = 'busy'; text = S.handoff; }
    phaseEl.dataset.state = state;
    phaseText.textContent = text;
  };

  // ---- rendering
  const avatar = (): HTMLElement => {
    const a = ui.h('span', 'chat-avatar');
    const img = doc.createElement('img');
    img.src = AVATAR_URL;
    img.alt = '';
    a.append(img);
    return a;
  };

  const nearBottom = (): boolean => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  const toBottom = (): void => { scroll.scrollTop = scroll.scrollHeight; };

  /** A question can still be answered here while it is the bot's last line and nobody answered it. */
  const openAsk = (): string | null => {
    const list = [...items.values()];
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.kind === 'say') return null;
      if (it.kind === 'ask') return list.some((x) => x.kind === 'answer' && x.askId === it.askId) ? null : it.askId;
    }
    return null;
  };

  const userNode = (it: UserItem): HTMLElement => {
    const el = ui.h('div', 'msg-user');
    for (const img of it.images ?? []) {
      const pic = doc.createElement('img');
      pic.className = 'chat-thumb';
      pic.src = blobUrl(img.ref);
      pic.alt = img.name ?? '';
      el.append(pic);
    }
    if (it.text) el.append(ui.h('div', 'bubble', it.text));
    if (it.via === 'voice') el.append(ui.h('span', 'via', S.voice));
    if (discarded.has(it.cursor)) el.append(ui.h('span', 'via bad', S.discarded));
    return el;
  };

  const askNode = (it: Extract<ChatItem, { kind: 'ask' }>, open: boolean): HTMLElement => {
    const box = ui.h('div', 'pet-bubble ask');
    box.append(ui.h('p', 'b-text', it.question));
    const answer = [...items.values()].find((x): x is Extract<ChatItem, { kind: 'answer' }> => x.kind === 'answer' && x.askId === it.askId);
    if (answer) box.classList.add('answered');
    const opts = ui.h('div', 'b-opts');
    it.options.forEach((label, i) => {
      const b = ui.h('button', 'b-opt');
      b.type = 'button';
      b.append(ui.h('kbd', null, String(i + 1)), ui.h('span', null, label));
      if (answer) b.classList.add(answer.index === i ? 'chosen' : 'dim');
      b.disabled = !open;
      b.addEventListener('click', () => stream.send(JSON.stringify({ t: 'answer', askId: it.askId, index: i })), { signal: ctx.signal });
      opts.append(b);
    });
    if (it.own || answer?.text) {
      const form = ui.h('form', 'b-own');
      const input = doc.createElement('input');
      input.type = 'text';
      input.maxLength = 500;
      input.placeholder = S.ownAnswer;
      if (answer?.text) { input.value = answer.text; form.classList.add('chosen'); }
      else if (answer) form.classList.add('dim');
      input.disabled = !open;
      const submit = ui.h('button', null, S.send);
      submit.type = 'submit';
      submit.disabled = !open;
      form.append(input, submit);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (v) stream.send(JSON.stringify({ t: 'answer', askId: it.askId, text: v }));
      }, { signal: ctx.signal });
      opts.append(form);
    }
    box.append(opts);
    return box;
  };

  const activityNode = (steps: readonly string[], meta: string, running: boolean): HTMLElement => {
    const d = doc.createElement('details');
    d.className = running ? 'chat-activity live' : 'chat-activity';
    const sum = doc.createElement('summary');
    sum.append(running ? ui.h('span', 'spinner') : ui.h('span', 'chev'), ui.h('span', null, activityTitle(steps)), ui.h('span', 'meta', meta));
    const ol = doc.createElement('ol');
    for (const s of steps) ol.append(ui.h('li', null, stepLabel(s)));
    d.append(sum, ol);
    return d;
  };

  /** Rebuilds the thread: the bot's consecutive lines and steps share one avatar. */
  const render = (): void => {
    const stick = nearBottom();
    thread.replaceChildren();
    if (more) {
      const b = ui.button(S.older, { size: 'sm', onClick: () => { if (before !== null) stream.send(JSON.stringify({ t: 'more', before })); } });
      b.classList.add('chat-older');
      thread.append(b);
    }
    const shown = [...items.values()].filter((it) => !(it.kind === 'user' && pending.has(it.cursor)) && it.kind !== 'answer');
    if (shown.length === 0 && !live && !busy()) thread.append(ui.h('div', 'chat-empty', S.empty(bot)));
    const ask = openAsk();
    let group: HTMLElement | null = null;
    const cooBody = (): HTMLElement => {
      if (group) return group;
      const row = ui.h('div', 'msg-coo');
      group = ui.h('div', 'coo-body');
      row.append(avatar(), group);
      thread.append(row);
      return group;
    };
    for (const it of shown) {
      if (it.kind === 'user') { group = null; thread.append(userNode(it)); continue; }
      if (it.kind === 'touch') { group = null; thread.append(ui.h('div', 'chat-note', it.text)); continue; }
      const body = cooBody();
      if (it.kind === 'say') {
        for (const beat of it.beats) {
          const row = ui.h('div', 'sayrow');
          row.append(ui.h('div', 'pet-bubble say', beat.text));
          if (beat.mood) row.append(ui.h('span', 'mood', moodName(beat.mood)));
          body.append(row);
        }
      } else if (it.kind === 'ask') body.append(askNode(it, it.askId === ask));
      else if (it.kind === 'activity' && shownSteps(it.steps).length) body.append(activityNode(shownSteps(it.steps), S.seconds(Math.max(1, Math.round(it.ms / 1000))), false));
    }
    const liveSteps = live ? shownSteps(live.steps) : [];
    // more than one step: the title counts them, the meta names the one running now
    const current = phase?.state === 'tools' ? shownSteps(phase.running).at(-1) : undefined;
    if (!paused && liveSteps.length) cooBody().append(activityNode(liveSteps, liveSteps.length > 1 && current ? stepLabel(current) : '', true));
    else if (!paused && busy()) {
      const dots = ui.h('div', 'pet-bubble say thinking');
      dots.append(ui.h('i'), ui.h('i'), ui.h('i'));
      dots.setAttribute('aria-label', S.thinking(bot));
      cooBody().append(dots);
    }
    if (stick) toBottom();
  };
  const busy = (): boolean => phase?.state === 'model' || phase?.state === 'delivering';

  const renderQueue = (): void => {
    queueBox.replaceChildren();
    if (pending.size === 0) return;
    const head = ui.h('div', 'qhead');
    head.append(ui.h('span', 'spinner'), ui.h('span', null, paused ? S.queuedPaused : S.queued(bot)));
    queueBox.append(head);
    for (const it of pending.values()) {
      const row = ui.h('div', 'qitem');
      const n = it.images?.length ?? 0;
      row.append(ui.h('span', 'qtext', [it.text, n ? S.imageCount(n) : ''].filter(Boolean).join(' ')));
      if (it.via !== 'voice') {
        const now = ui.h('button', 'pill primary', S.sendNow);
        now.type = 'button';
        now.title = S.sendNowHint(bot);
        now.disabled = paused;
        now.addEventListener('click', () => { now.disabled = true; stream.send(JSON.stringify({ t: 'now', cursor: it.cursor })); }, { signal: ctx.signal });
        const back = ui.h('button', 'pill', S.withdraw);
        back.type = 'button';
        back.title = S.withdrawHint;
        back.addEventListener('click', () => { back.disabled = true; stream.send(JSON.stringify({ t: 'withdraw', cursor: it.cursor })); }, { signal: ctx.signal });
        row.append(now, back);
      }
      queueBox.append(row);
    }
  };

  const refresh = (): void => { syncPhase(); render(); renderQueue(); };

  const addItem = (it: ChatItem, isPending = false): void => {
    items.set(it.cursor, it);
    if (isPending && it.kind === 'user') pending.set(it.cursor, it);
  };
  const sortItems = (): void => {
    const key = (it: ChatItem): number => (it.kind === 'user' && it.at !== undefined ? it.at : it.cursor);
    const sorted = [...items.entries()].sort((a, b) => key(a[1]) - key(b[1]) || a[0] - b[0]);
    items.clear();
    for (const [k, v] of sorted) items.set(k, v);
  };

  // ---- stream
  const stream = ctx.lifecycle.own(openStream({
    url: env.wsUrl(panelStreamRoute(PET_PAGE, 'chat')),
    signal: ctx.signal,
    createSocket: env.createSocket,
    setTimer: env.setTimer,
    clearTimer: env.clearTimer,
    onError: (err) => ctx.onError(err),
    handlers: {
      open: () => stream.send(JSON.stringify({ t: 'hello' })),
      message: (raw) => {
        let f: Record<string, unknown>;
        try { f = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
        switch (f.t) {
          case 'init': {
            items.clear(); pending.clear();
            bot = typeof f.bot === 'string' && f.bot ? f.bot : bot;
            paused = f.paused === true;
            phase = (f.phase as RunPhase | null) ?? null;
            live = (f.activity as typeof live) ?? null;
            more = f.more === true;
            before = typeof f.before === 'number' ? f.before : null;
            imagesSeen = f.imagesSeen !== false;
            const waiting = new Set(Array.isArray(f.pending) ? f.pending as number[] : []);
            for (const it of (f.items as ChatItem[]) ?? []) addItem(it, waiting.has(it.cursor));
            composer.setPlaceholder(S.placeholder(bot));
            refresh();
            toBottom();
            return;
          }
          case 'older': {
            const height = scroll.scrollHeight;
            for (const it of (f.items as ChatItem[]) ?? []) addItem(it);
            sortItems();
            more = f.more === true;
            before = typeof f.before === 'number' ? f.before : null;
            render();
            scroll.scrollTop = scroll.scrollHeight - height;
            return;
          }
          case 'item': addItem(f.item as ChatItem, f.pending === true); sortItems(); refresh(); return;
          case 'sent': {
            const mine = sentById.get(f.id as number);
            sentById.delete(f.id as number);
            if (mine && typeof f.cursor === 'number') sentByCursor.set(f.cursor, mine);
            return;
          }
          case 'rejected': {
            const mine = sentById.get(f.id as number);
            sentById.delete(f.id as number);
            if (mine) composer.restore(mine.text, mine.images);
            ui.toast(String(f.reason ?? ''), 'bad');
            return;
          }
          case 'settled': {
            for (const c of (f.cursors as number[]) ?? []) {
              const it = items.get(c);
              if (it?.kind === 'user' && typeof f.at === 'number') it.at = f.at;
              pending.delete(c);
              sentByCursor.delete(c);
              if (f.outcome === 'discarded') discarded.add(c);
            }
            sortItems();
            refresh();
            return;
          }
          case 'withdrawn': {
            const c = f.cursor as number;
            const it = pending.get(c);
            pending.delete(c);
            items.delete(c);
            const mine = sentByCursor.get(c);
            sentByCursor.delete(c);
            if (mine) composer.restore(mine.text, mine.images);
            else if (it?.text) composer.restore(it.text);
            refresh();
            return;
          }
          case 'notice': ui.toast(String(f.text ?? '')); renderQueue(); return;
          case 'phase': phase = f.phase as RunPhase; refresh(); return;
          case 'activity': live = Array.isArray(f.steps) ? { steps: f.steps as string[], startedAt: f.startedAt as number } : null; render(); return;
          case 'paused': paused = f.paused === true; refresh(); return;
          case 'draft': if (typeof f.text === 'string' && f.text) composer.restore(f.text); composer.focus(); return;
        }
      },
    },
  }));

  syncPhase();
  thread.append(ui.h('div', 'chat-empty', S.connecting));
}

export const chatFeature: FrameworkFeature = {
  route: 'chat',
  label: S.nav,
  icon: 'message',
  navMode: 'primary',
  mount,
};
