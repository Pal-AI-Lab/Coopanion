/**
 * The chat page's side of the pet: what the person said (typed in the bubble or the page, spoken,
 * answered, touches) and what the pet said (`pet_say` beats, `pet_ask` questions) and did (tool
 * steps), rebuilt from this World's own events.
 *
 * The person's input is the events delivered to the bot. The pet's side is recorded as
 * `desktop-pet.self` events that are stored and never delivered: `say`, `ask`, `activity` (the tool
 * steps between two lines), `delivered` (where messages that waited reached the bot) and `withdrawn`
 * (a message taken back before delivery, left out of the history). A touch is stored as its kind and
 * counts, a figure the person switched to (`desktop-pet.figure`) as the change and the figure's names;
 * the page tells both in its own language.
 */
import type { EventEnvelope, RunPhase, WorldStreamSocket } from 'cortico/core/types.ts';

export const SELF_TYPE = 'desktop-pet.self';

/** Event types the chat shows. */
const CHAT_TYPES = new Set(['desktop-pet.message', 'desktop-pet.speech', 'desktop-pet.answer', 'desktop-pet.touch', 'desktop-pet.figure', SELF_TYPE]);

/** Tools whose work shows as the pet's own lines, not as steps. */
export const SPOKEN_TOOLS = new Set(['pet_say', 'pet_ask']);

/** One image of a message: `ref` is the attachment handle the page fetches through the `blob` method. */
export interface WireImage { ref: string; mime: string; name?: string }

/** A touch as the chat page tells it: `poke`, `pet`, `throw`, `drop` or `crash`, how many times, and whether it woke the pet or the pet crashed. */
export interface ChatTouch { kind: string; count: number; woke: boolean; crashed: boolean }

/** A figure switch: to another figure, to another dress of the same one, or a figure that did not load (Coo shows instead); `name` by language, with its `id`. */
export interface ChatFigure { change: 'figure' | 'dress' | 'failed'; name: Record<string, string> }

/** One beat of a `pet_say`: its text and the first expression played in it, by its id and its name in each language. */
export interface SayBeat { text: string; mood?: Record<string, string> }

export type ChatItem =
  | { kind: 'user'; cursor: number; ts: string; via: 'chat' | 'bubble' | 'voice'; text: string; images?: WireImage[]; at?: number }
  | { kind: 'answer'; cursor: number; ts: string; askId: string; index?: number; text?: string; dismissed?: true }
  /** `text` for touches stored before they were stored as `touch`. */
  | { kind: 'touch'; cursor: number; ts: string; touch?: ChatTouch; text?: string }
  | { kind: 'figure'; cursor: number; ts: string; figure: ChatFigure }
  | { kind: 'say'; cursor: number; ts: string; beats: SayBeat[] }
  | { kind: 'ask'; cursor: number; ts: string; askId: string; question: string; options: string[]; own: boolean }
  | { kind: 'activity'; cursor: number; ts: string; steps: string[]; ms: number };

type Meta = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

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
      const images = (e.blobs ?? []).filter((b) => b.mime.startsWith('image/'))
        .map((b) => ({ ref: b.handle, mime: b.mime, ...(b.name ? { name: b.name } : {}) }));
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
      if (!f || !['figure', 'dress', 'failed'].includes(f.change as string) || !f.name || typeof f.name !== 'object') return null;
      return { kind: 'figure', ...base, figure: { change: f.change as ChatFigure['change'], name: f.name as Record<string, string> } };
    }
    default: {
      if (m.kind === 'say' && Array.isArray(m.beats)) {
        const beats = (m.beats as Meta[]).flatMap((b) => (typeof b.text === 'string' && b.text ? [{ text: b.text, ...(b.mood && typeof b.mood === 'object' ? { mood: b.mood as Record<string, string> } : {}) }] : []));
        return beats.length ? { kind: 'say', ...base, beats } : null;
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
 * withdrawn are left out.
 */
export function chatHistory(events: readonly EventEnvelope[]): ChatItem[] {
  const refs = chatRefs(events);
  const withdrawn = new Set(refs.withdrawn);
  const deliveredAt = new Map(refs.delivered);
  const waiting = new Map<number, ChatItem[]>();
  const out: ChatItem[] = [];
  for (const e of events) {
    out.push(...waiting.get(e.cursor) ?? []);
    if (withdrawn.has(e.cursor)) continue;
    const item = chatItem(e);
    if (!item) continue;
    const at = deliveredAt.get(e.cursor);
    if (at === undefined || item.kind !== 'user') { out.push(item); continue; }
    waiting.set(at, [...waiting.get(at) ?? [], { ...item, at }]);
  }
  return out;
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
