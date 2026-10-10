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
import { baseLanguage } from '../../../../core/language.ts';
import { LANGUAGE } from '../../core/language.ts';
import { openStream } from '../../core/stream.ts';
import { browserSocketEnv } from '../../core/websocket.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { intro } from '../intro.ts';
import { requestMode } from '../mode.ts';
import { S, STEP } from './strings.ts';

const PET_PAGE = 'world:desktop-pet';

interface WireImage { ref: string; mime: string; name?: string }
interface SayBeat { text: string; mood?: Record<string, string> }
export interface Touch { kind: string; count: number; woke: boolean; crashed: boolean }
interface Refs { withdrawn?: number[]; delivered?: Array<[number, number]> }
type ChatItem =
  | { kind: 'user'; cursor: number; ts: string; via: 'chat' | 'bubble' | 'voice'; text: string; images?: WireImage[]; at?: number }
  | { kind: 'answer'; cursor: number; ts: string; askId: string; index?: number; text?: string; dismissed?: true }
  | { kind: 'touch'; cursor: number; ts: string; touch?: Touch; text?: string }
  | { kind: 'say'; cursor: number; ts: string; beats: SayBeat[] }
  | { kind: 'ask'; cursor: number; ts: string; askId: string; question: string; options: string[]; own: boolean }
  | { kind: 'activity'; cursor: number; ts: string; steps: string[]; ms: number };
type UserItem = Extract<ChatItem, { kind: 'user' }>;
interface RunPhase { state: 'idle' | 'delivering' | 'model' | 'tools' | 'backoff' | 'handoff'; running: readonly string[]; retryAt?: string }

const stepLabel = (name: string): string => STEP[name] ?? name;
const shownSteps = (steps: readonly string[]): string[] => steps.filter((s) => s in STEP);

/** One folded row's title: a run of computer steps, one step by name, or a count. */
function activityTitle(steps: readonly string[]): string {
  if (steps.every((s) => s.startsWith('cua_'))) return `${S.computer} · ${S.steps(steps.length)}`;
  return steps.length === 1 ? stepLabel(steps[0]) : S.things(steps.length);
}

/** An expression by its name in the console's language, else its base language's (zh for zh-Hant, en for the rest), else the word's id. */
const moodName = (mood: Record<string, string>): string => mood[LANGUAGE] ?? mood[baseLanguage(LANGUAGE)] ?? mood.id ?? '';

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
  /** The question the pet still waits on an answer to, as the World says; null when none. */
  let openAsk: string | null = null;
  /** Shown items by cursor, in the order the bot met them (`at` for a message that waited, else the cursor). */
  const items = new Map<number, ChatItem>();
  /** The person's messages the bot has not taken in yet. */
  const pending = new Map<number, UserItem>();
  /** Messages that never reached the bot. */
  const discarded = new Set<number>();
  /** Withdrawn messages and where waiting messages were delivered, from the history loaded so far; applied to earlier pages. */
  const withdrawnRefs = new Set<number>();
  const deliveredRefs = new Map<number, number>();
  const takeRefs = (refs: Refs | undefined): void => {
    for (const c of refs?.withdrawn ?? []) withdrawnRefs.add(c);
    for (const [c, at] of refs?.delivered ?? []) deliveredRefs.set(c, at);
  };
  /** What this page sent, by the id it gave, then by cursor: a withdrawn message comes back as typed. */
  const sentById = new Map<number, { text: string; images: readonly ConsoleImageAttachment[] }>();
  const sentByCursor = new Map<number, { text: string; images: readonly ConsoleImageAttachment[] }>();
  let nextSend = 1;
  /** Kept across re-renders: what is typed into an open question's own-answer box, and which step lists are expanded. */
  const ownDrafts = new Map<string, string>();
  const expanded = new Set<string>();

  // ---- layout
  // the page's heading as on every page; the run phase and the way to the run trace take the note's line
  const phaseEl = ui.h('span', 'chat-phase');
  const phaseDot = ui.h('span', 'dot');
  const phaseText = ui.h('span');
  phaseEl.append(phaseDot, phaseText);
  const trace = ui.h('button', 'chat-trace', S.trace);
  trace.type = 'button';
  trace.title = S.traceHint;
  trace.addEventListener('click', () => { requestMode('advanced'); ctx.router.navigate(['live']); }, { signal: ctx.signal });
  const note = ui.h('div', 'chat-note-line');
  note.append(phaseEl, trace);
  const top = intro(ui, S.title, { desc: note });

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
      else if (open) {
        input.dataset.ask = it.askId;
        input.value = ownDrafts.get(it.askId) ?? '';
        input.addEventListener('input', () => ownDrafts.set(it.askId, input.value), { signal: ctx.signal });
      }
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

  const activityNode = (key: string, steps: readonly string[], meta: string, running: boolean): HTMLElement => {
    const d = doc.createElement('details');
    d.className = running ? 'chat-activity live' : 'chat-activity';
    d.open = expanded.has(key);
    d.addEventListener('toggle', () => { if (d.open) expanded.add(key); else expanded.delete(key); }, { signal: ctx.signal });
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
    const focused = doc.activeElement instanceof HTMLInputElement && thread.contains(doc.activeElement) ? doc.activeElement : null;
    const caret = focused?.dataset.ask ? { askId: focused.dataset.ask, start: focused.selectionStart, end: focused.selectionEnd } : null;
    thread.replaceChildren();
    if (more) {
      const b = ui.button(S.older, { size: 'sm', onClick: () => { if (before !== null) stream.send(JSON.stringify({ t: 'more', before })); } });
      b.classList.add('chat-older');
      thread.append(b);
    }
    const shown = [...items.values()].filter((it) => !(it.kind === 'user' && pending.has(it.cursor)) && it.kind !== 'answer');
    if (shown.length === 0 && !live && !busy()) thread.append(ui.h('div', 'chat-empty', S.empty(bot)));
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
      if (it.kind === 'touch') { group = null; thread.append(ui.h('div', 'chat-note', it.touch ? S.touch(it.touch, bot) : it.text ?? '')); continue; }
      const body = cooBody();
      if (it.kind === 'say') {
        for (const beat of it.beats) {
          const row = ui.h('div', 'sayrow');
          row.append(ui.h('div', 'pet-bubble say', beat.text));
          if (beat.mood) row.append(ui.h('span', 'mood', moodName(beat.mood)));
          body.append(row);
        }
      } else if (it.kind === 'ask') body.append(askNode(it, it.askId === openAsk));
      else if (it.kind === 'activity' && shownSteps(it.steps).length) body.append(activityNode(String(it.cursor), shownSteps(it.steps), S.seconds(Math.max(1, Math.round(it.ms / 1000))), false));
    }
    const liveSteps = live ? shownSteps(live.steps) : [];
    // more than one step: the title counts them, the meta names the one running now
    const current = phase?.state === 'tools' ? shownSteps(phase.running).at(-1) : undefined;
    if (!paused && liveSteps.length) cooBody().append(activityNode('live', liveSteps, liveSteps.length > 1 && current ? stepLabel(current) : '', true));
    else if (!paused && busy()) {
      const dots = ui.h('div', 'pet-bubble say thinking');
      dots.append(ui.h('i'), ui.h('i'), ui.h('i'));
      dots.setAttribute('aria-label', S.thinking(bot));
      cooBody().append(dots);
    }
    if (caret) {
      const input = [...thread.querySelectorAll<HTMLInputElement>('input[data-ask]')].find((x) => x.dataset.ask === caret.askId);
      if (input && !input.disabled) { input.focus(); input.setSelectionRange(caret.start, caret.end); }
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
            openAsk = typeof f.askId === 'string' ? f.askId : null;
            takeRefs(f.refs as Refs | undefined);
            const waiting = new Set(Array.isArray(f.pending) ? f.pending as number[] : []);
            for (const it of (f.items as ChatItem[]) ?? []) addItem(it, waiting.has(it.cursor));
            composer.setPlaceholder(S.placeholder(bot));
            refresh();
            toBottom();
            return;
          }
          case 'older': {
            const height = scroll.scrollHeight;
            for (const it of (f.items as ChatItem[]) ?? []) {
              if (withdrawnRefs.has(it.cursor)) continue;
              const at = deliveredRefs.get(it.cursor);
              addItem(it.kind === 'user' && at !== undefined ? { ...it, at } : it);
            }
            takeRefs(f.refs as Refs | undefined);
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
              if (typeof f.at === 'number') { deliveredRefs.set(c, f.at); if (it?.kind === 'user') it.at = f.at; }
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
            withdrawnRefs.add(c);
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
          case 'ask': openAsk = typeof f.askId === 'string' ? f.askId : null; render(); return;
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
