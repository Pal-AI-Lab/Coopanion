/**
 * The chat page's side of the pet: what the person said (typed in the bubble or the page, spoken,
 * answered, touches) and what the pet said (`pet_say` beats, `pet_ask` questions) and did (tool
 * steps), rebuilt from this World's own events.
 *
 * The person's input is the events delivered to the bot. The pet's side is recorded as
 * `desktop-pet.self` events that are stored and never delivered: `say`, `ask`, `activity` (the tool
 * steps between two lines), `delivered` (where messages that waited reached the bot) and `withdrawn`
 * (a message taken back before delivery, left out of the history). A touch is stored as its kind and
 * counts, a figure the person switched to (`desktop-pet.figure`) as the kind of switch and the figure's names;
 * the page tells both in its own language.
 */
import type { EventEnvelope, RunPhase, WorldStreamSocket } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { CHAT_EXPORT } from './chat-strings.ts';

export const SELF_TYPE = 'desktop-pet.self';

/** Event types the chat shows. */
const CHAT_TYPES = new Set(['desktop-pet.message', 'desktop-pet.speech', 'desktop-pet.answer', 'desktop-pet.touch', 'desktop-pet.figure', SELF_TYPE]);

/** Tools whose work shows as the pet's own lines, not as steps. */
const SPOKEN_TOOLS = new Set(['pet_say', 'pet_ask']);

/** One image of a message: `ref` is the attachment handle; the page fetches its bytes from the console's `/api/blob`. */
export interface WireImage { ref: string; mime: string; name?: string }

/** A touch as the chat page tells it: `poke`, `pet`, `throw`, `drop` or `crash`, how many times, and whether it woke the pet or the pet crashed. */
export interface ChatTouch { kind: string; count: number; woke: boolean; crashed: boolean }

/** A figure switch: to another figure, to another dress of the same one, or a figure that did not load (Coo shows instead); `name` by language, with its `id`. */
export interface ChatFigure { kind: 'figure' | 'dress' | 'failed'; name: Record<string, string> }

/** One beat of a `pet_say`: its text and the first expression played in it, by its id and its name in each language. */
export interface SayBeat { text: string; mood?: Record<string, string> }

export type ChatItem =
  | { kind: 'user'; cursor: number; ts: string; via: 'chat' | 'bubble' | 'voice'; text: string; images?: WireImage[]; at?: number }
  | { kind: 'answer'; cursor: number; ts: string; askId: string; index?: number; text?: string; choice?: string; dismissed?: true }
  /** `text` for touches stored before they were stored as `touch`. */
  | { kind: 'touch'; cursor: number; ts: string; touch?: ChatTouch; text?: string }
  | { kind: 'figure'; cursor: number; ts: string; figure: ChatFigure }
  | { kind: 'say'; cursor: number; ts: string; beats: SayBeat[]; images?: WireImage[] }
  | { kind: 'ask'; cursor: number; ts: string; askId: string; question: string; options: string[]; own: boolean }
  | { kind: 'activity'; cursor: number; ts: string; steps: string[]; ms: number };

type Meta = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const wireImages = (e: EventEnvelope): WireImage[] => (e.blobs ?? []).filter((b) => b.mime.startsWith('image/'))
  .map((b) => ({ ref: b.handle, mime: b.mime, ...(b.name ? { name: b.name } : {}) }));

/** A stored event as the chat shows it; null for events the chat leaves out. */
export function chatItem(e: EventEnvelope): ChatItem | null {
  if (!CHAT_TYPES.has(e.type)) return null;
  const m = (e.meta ?? {}) as Meta;
  const base = { cursor: e.cursor, ts: e.ts };
  switch (e.type) {
    case 'desktop-pet.message':
    case 'desktop-pet.speech': {
      const text = str(m.text);
      if (text === undefined) return null;
      const images = wireImages(e);
      const via = e.type === 'desktop-pet.speech' ? 'voice' : m.via === 'chat' ? 'chat' : 'bubble';
      return { kind: 'user', ...base, via, text, ...(images.length ? { images } : {}) };
    }
    case 'desktop-pet.answer': {
      const askId = str(m.askId);
      if (!askId) return null;
      return {
        kind: 'answer', ...base, askId,
        ...(typeof m.index === 'number' ? { index: m.index } : {}),
        ...(str(m.text) !== undefined ? { text: str(m.text) } : {}),
        ...(m.dismissed === true ? { dismissed: true as const } : {}),
      };
    }
    case 'desktop-pet.touch': {
      const t = (m.touch ?? null) as Meta | null;
      if (t && typeof t.kind === 'string') {
        return { kind: 'touch', ...base, touch: { kind: t.kind, count: typeof t.count === 'number' ? t.count : 1, woke: t.woke === true, crashed: t.crashed === true } };
      }
      const text = str(m.chat);
      return text ? { kind: 'touch', ...base, text } : null;
    }
    case 'desktop-pet.figure': {
      const f = (m.figure ?? null) as Meta | null;
      if (!f || !['figure', 'dress', 'failed'].includes(f.kind as string) || !f.name || typeof f.name !== 'object') return null;
      return { kind: 'figure', ...base, figure: { kind: f.kind as ChatFigure['kind'], name: f.name as Record<string, string> } };
    }
    default: {
      if (m.kind === 'say' && Array.isArray(m.beats)) {
        const beats = (m.beats as Meta[]).flatMap((b) => (typeof b.text === 'string' && b.text ? [{ text: b.text, ...(b.mood && typeof b.mood === 'object' ? { mood: b.mood as Record<string, string> } : {}) }] : []));
        const images = wireImages(e);
        return beats.length || images.length ? { kind: 'say', ...base, beats, ...(images.length ? { images } : {}) } : null;
      }
      if (m.kind === 'ask' && str(m.askId) && str(m.question)) {
        const options = Array.isArray(m.options) ? m.options.filter((o): o is string => typeof o === 'string') : [];
        return { kind: 'ask', ...base, askId: str(m.askId)!, question: str(m.question)!, options, own: m.own !== false };
      }
      if (m.kind === 'activity' && Array.isArray(m.steps)) {
        const steps = m.steps.filter((s): s is string => typeof s === 'string');
        return steps.length ? { kind: 'activity', ...base, steps, ms: typeof m.ms === 'number' ? m.ms : 0 } : null;
      }
      return null;
    }
  }
}

/** Messages recorded as withdrawn, and where messages that waited were delivered (message cursor → record cursor). */
export interface ChatRefs { withdrawn: number[]; delivered: Array<[number, number]> }

/** The `withdrawn` and `delivered` records among `events`. */
export function chatRefs(events: readonly EventEnvelope[]): ChatRefs {
  const refs: ChatRefs = { withdrawn: [], delivered: [] };
  for (const e of events) {
    const m = (e.meta ?? {}) as Meta;
    if (e.type !== SELF_TYPE) continue;
    if (m.kind === 'withdrawn' && typeof m.cursor === 'number') refs.withdrawn.push(m.cursor);
    if (m.kind === 'delivered' && Array.isArray(m.cursors)) for (const c of m.cursors) if (typeof c === 'number') refs.delivered.push([c, e.cursor]);
  }
  return refs;
}

/**
 * The chat items among `events`, in the order the bot met them: a message that waited stands where
 * its `delivered` record is, with `at` set to that record's cursor. Messages later recorded as
 * withdrawn are left out unless retained as pagination anchors.
 */
export function chatHistory(events: readonly EventEnvelope[], includeWithdrawn = false): ChatItem[] {
  const refs = chatRefs(events);
  const withdrawn = new Set(refs.withdrawn);
  const deliveredAt = new Map(refs.delivered);
  const waiting = new Map<number, ChatItem[]>();
  const out: ChatItem[] = [];
  for (const e of events) {
    out.push(...waiting.get(e.cursor) ?? []);
    if (!includeWithdrawn && withdrawn.has(e.cursor)) continue;
    const item = chatItem(e);
    if (!item) continue;
    const at = deliveredAt.get(e.cursor);
    if (at === undefined || item.kind !== 'user') { out.push(item); continue; }
    waiting.set(at, [...waiting.get(at) ?? [], { ...item, at }]);
  }
  return out;
}

/** Item kinds that carry the person's or the pet's own words; the history search and the export show only these. */
const CONVERSATION = new Set<ChatItem['kind']>(['user', 'say', 'ask', 'answer']);

/** The human text of a conversation item, one entry per visible line; empty for the other kinds. */
export function chatTexts(item: ChatItem): string[] {
  switch (item.kind) {
    case 'user': return [item.text];
    case 'say': return item.beats.map((b) => b.text);
    case 'ask': return [item.question, ...item.options];
    case 'answer': return item.text !== undefined ? [item.text] : item.choice !== undefined ? [item.choice] : [];
    default: return [];
  }
}

/** A history request: the text to look for, the time window in ms, the cursor to page before, and the page size. */
export interface ChatMatchQuery {
  query?: string;
  /** Inclusive lower bound of the event's instant. */
  fromMs?: number;
  /** Exclusive upper bound of the event's instant. */
  toMs?: number;
  /** The cursor of the oldest item of a page already shown; that item and everything after it are left out. */
  before?: number;
  /** Event watermark from the first page; freezes delivery order across pages. */
  snapshot?: number;
  limit: number;
}

export interface ChatMatch {
  /** The newest `limit` matches, in display order. */
  matches: ChatItem[];
  /** Older matches remain beyond this page. */
  more: boolean;
  /** The oldest cursor of this page, to pass back as `before`; null when `more` is false. */
  before: number | null;
  snapshot: number;
}

/**
 * The conversation items of the whole `events` stream that match `q`, newest last. `before` is
 * the cursor of the oldest item of the page already shown: that item and the ones displayed after
 * it are left out, so the returned `before` walks back a page at a time.
 */
export function chatMatches(events: readonly EventEnvelope[], q: ChatMatchQuery): ChatMatch {
  const snapshot = q.snapshot ?? events.at(-1)?.cursor ?? 0;
  let items = chatHistory(events.filter((e) => e.cursor <= snapshot), true);
  const questions = new Map(items.filter((i) => i.kind === 'ask').map((i) => [i.askId, i]));
  if (q.before !== undefined) {
    const at = items.findIndex((i) => i.cursor === q.before);
    items = at >= 0 ? items.slice(0, at) : [];
  }
  const withdrawn = new Set(chatRefs(events).withdrawn);
  items = items.filter((i) => CONVERSATION.has(i.kind) && !withdrawn.has(i.cursor)).map((item) => {
    if (item.kind !== 'answer' || item.index === undefined) return item;
    const choice = questions.get(item.askId)?.options[item.index];
    return choice === undefined ? item : { ...item, choice };
  });
  const needle = (q.query ?? '').toLowerCase();
  const inWindow = items.filter((i) => {
    const ms = Date.parse(i.ts);
    if (q.fromMs !== undefined && !(ms >= q.fromMs)) return false;
    if (q.toMs !== undefined && !(ms < q.toMs)) return false;
    return needle === '' || chatTexts(i).some((t) => t.toLowerCase().includes(needle));
  });
  const more = inWindow.length > q.limit;
  const matches = more ? inWindow.slice(inWindow.length - q.limit) : inWindow;
  return { matches, more, before: more && matches.length ? matches[0]!.cursor : null, snapshot };
}

/**
 * The items around `cursor` in the whole history: `radius` before and after it, the item itself
 * included, together with paired questions and answers. A `delivered` record's cursor also finds the message it settles through its `at`.
 * Null when no item carries that cursor.
 */
export function chatLocate(events: readonly EventEnvelope[], cursor: number, radius = 20): ChatItem[] | null {
  const items = chatHistory(events);
  let at = items.findIndex((i) => i.cursor === cursor);
  if (at < 0) at = items.findIndex((i) => i.kind === 'user' && i.at === cursor);
  if (at < 0) return null;
  const found = new Set(items.slice(Math.max(0, at - radius), at + radius + 1));
  const paired = new Set([...found].flatMap((i) => i.kind === 'ask' || i.kind === 'answer' ? [i.askId] : []));
  return items.filter((i) => found.has(i) || ((i.kind === 'ask' || i.kind === 'answer') && paired.has(i.askId)));
}

export interface ChatExportOptions {
  /** Inclusive lower bound of the event's instant. */
  fromMs?: number;
  /** Exclusive upper bound of the event's instant. */
  toMs?: number;
  /** The person's name for a `user` or `answer` line. */
  user: string;
  /** The bot's name for a `say` or `ask` line. */
  bot: string;
  language?: Language;
}

/** The lines one conversation item contributes to the export; null when the kind is not exported. */
function chatExportLines(item: ChatItem, t: typeof CHAT_EXPORT.zh): string[] | null {
  const images = (list: WireImage[] | undefined) => (list ?? []).map((im) => `![${t.image}](${im.ref})`);
  switch (item.kind) {
    case 'user': return [item.text, ...images(item.images)];
    case 'say': return [...item.beats.map((b) => b.text), ...images(item.images)];
    case 'ask': return [`> ${t.question}: ${item.question}`, ...item.options.map((o) => `> - ${o}`)];
    case 'answer': {
      if (item.text !== undefined) return [`> ${t.answer}: ${item.text}`];
      if (item.index !== undefined) return [`> ${t.answer}: ${t.option} ${item.index + 1}`];
      return item.dismissed ? [`> ${t.answer}: (${t.skipped})`] : null;
    }
    default: return null;
  }
}

/**
 * The whole visible conversation as Markdown, grouped by day, with the instant, the person or the
 * bot, the text, questions and answers, and image references. Internal records (tool steps,
 * touches, figure switches) are left out.
 */
export function chatExport(events: readonly EventEnvelope[], opts: ChatExportOptions): string {
  const t = CHAT_EXPORT[opts.language ?? 'zh'];
  const out: string[] = [`# ${t.title}`];
  let day = '';
  for (const item of chatHistory(events)) {
    if (!CONVERSATION.has(item.kind)) continue;
    const ms = Date.parse(item.ts);
    if (opts.fromMs !== undefined && !(ms >= opts.fromMs)) continue;
    if (opts.toMs !== undefined && !(ms < opts.toMs)) continue;
    const lines = chatExportLines(item, t);
    if (!lines || lines.every((l) => l.trim() === '')) continue;
    const date = item.ts.slice(0, 10);
    if (date !== day) { out.push(`\n## ${date}`); day = date; }
    const who = item.kind === 'user' || item.kind === 'answer' ? opts.user : opts.bot;
    out.push(`\n### ${item.ts} · ${who}\n\n${lines.join('\n\n')}`);
  }
  return out.join('\n') + '\n';
}

/** The tool steps between two of the pet's lines: names in start order, from the first start. */
export class ActivityGroup {
  steps: string[] = [];
  startedAt = 0;
  private running: string[] = [];

  /** Takes a new phase; returns true when a step was added. */
  observe(phase: RunPhase, now: number): boolean {
    const before = [...this.running];
    this.running = [...phase.running];
    let added = false;
    for (const name of phase.running) {
      const i = before.indexOf(name);
      if (i >= 0) { before.splice(i, 1); continue; }
      if (SPOKEN_TOOLS.has(name)) continue;
      if (this.steps.length === 0) this.startedAt = now;
      this.steps.push(name);
      added = true;
    }
    return added;
  }

  /** The steps so far, and empties the group. */
  take(now: number): { steps: string[]; ms: number } | null {
    if (this.steps.length === 0) return null;
    const out = { steps: this.steps, ms: Math.max(0, now - this.startedAt) };
    this.steps = [];
    return out;
  }
}

/** Open chat pages: frames go to every one. */
export class ChatSockets {
  private readonly sockets = new Set<WorldStreamSocket>();

  get size(): number {
    return [...this.sockets].filter((s) => s.open).length;
  }

  add(socket: WorldStreamSocket, onMessage: (msg: Meta, socket: WorldStreamSocket) => void): void {
    this.sockets.add(socket);
    socket.onClose(() => this.sockets.delete(socket));
    socket.onMessage((raw) => {
      let msg: unknown;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg && typeof msg === 'object') onMessage(msg as Meta, socket);
    });
  }

  send(socket: WorldStreamSocket, frame: Meta): void {
    socket.send(JSON.stringify(frame));
  }

  broadcast(frame: Meta): void {
    const text = JSON.stringify(frame);
    for (const s of this.sockets) if (s.open) s.send(text);
  }

  closeAll(reason: string): void {
    for (const s of this.sockets) s.close(reason);
    this.sockets.clear();
  }
}
