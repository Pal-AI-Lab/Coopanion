/**
 * What the bot is doing, for the status bubble above the pet. Core's run phase says when: a model request, a retry
 * and a handoff show thinking, the end of a batch shows nothing. The main session's output stream says what: a tool
 * call's arguments are read while they stream, so a file name can show before the call is written out. Which tools
 * show what is the embedding app's choice (`DescribeTool`); without one, the pet's own tools show nothing and every
 * other tool shows as busy.
 */
import type { RunPhase } from 'cortico/core/types.ts';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { cutChars, petText } from './i18n/index.ts';

/** The kinds the bubble has an icon for (`status_<kind>` in web/ui.js); a posted one outside this list is refused. */
export const PET_STATUS_KINDS = ['think', 'read', 'browse', 'search', 'write', 'delete', 'save', 'look', 'click', 'scroll', 'type', 'wait', 'alarm', 'work'] as const;

export type PetStatusKind = (typeof PET_STATUS_KINDS)[number];

export interface PetStatus {
  /** Also the icon the bubble shows (`status_<kind>` in web/ui.js). */
  kind: PetStatusKind;
  text: string;
  detail?: string;
  count?: number;
}

/** A call's arguments: the parsed object, or the JSON text streamed so far. */
export type ToolArgs = Record<string, unknown> | string;

/**
 * The status a tool call shows, from its name and its arguments so far; `done` once the arguments are complete.
 * null shows nothing for it, undefined leaves it to the default (busy, or nothing for the pet's own tools).
 */
export type DescribeTool = (name: string, args: ToolArgs, done: boolean) => PetStatus | null | undefined;

const THINK: PetStatus = { kind: 'think', text: '' };

/** A string argument once its value is closed, even while the rest of the arguments (often a file's body) still streams. */
export function stringArg(args: ToolArgs, key: string): string | undefined {
  if (typeof args !== 'string') return typeof args[key] === 'string' ? args[key] : undefined;
  const match = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(args);
  if (!match) return undefined;
  try { return JSON.parse(match[1]) as string; } catch { return undefined; }
}

/** A number argument once a delimiter follows it. */
export function numberArg(args: ToolArgs, key: string): number | undefined {
  const value = typeof args === 'string'
    ? new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\s*[,}]`).exec(args)?.[1]
    : args[key];
  return value !== undefined && Number.isFinite(Number(value)) && (typeof value === 'number' || typeof value === 'string') ? Number(value) : undefined;
}

const defaultStatus = (name: string, busy: string): PetStatus | null => (name.startsWith('pet_') ? null : { kind: 'work', text: busy });

interface Call { name: string; args: string; done: boolean; status: PetStatus | null }

export class StatusTracker {
  private readonly calls = new Map<string, Call>();
  private state: RunPhase['state'] = 'idle';
  private round: number | undefined;
  private current: PetStatus | null = null;

  /** `busy`: what a call without a description shows, in the app language at the time. */
  constructor(private readonly changed: (status: PetStatus | null) => void, private readonly describe?: DescribeTool, private readonly busy: () => string = () => petText().busy) {}

  get status(): PetStatus | null { return this.current; }

  onPhase(phase: RunPhase): void {
    this.state = phase.state;
    switch (phase.state) {
      case 'idle':
        this.calls.clear();
        this.round = undefined;
        this.set(null);
        return;
      case 'backoff':
      case 'handoff':
        this.set(THINK);
        return;
      default:
        // a new round's request starts from thinking; the calls of the round before are done with
        if (phase.round !== this.round) { this.round = phase.round; this.calls.clear(); }
        this.update();
    }
  }

  /** Tool calls and their arguments as the model writes them; item ids keep calls apart where output_index repeats. */
  onEvent(event: StreamEvent): void {
    if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
      const item = event.item;
      if (item?.type !== 'function_call') return;
      const call = this.calls.get(item.id) ?? { name: item.name, args: '', done: false, status: null };
      call.name = item.name;
      call.args = item.arguments;
      call.done = event.type === 'response.output_item.done';
      call.status = this.describeCall(call);
      this.calls.set(item.id, call);
    } else if (event.type === 'response.function_call_arguments.delta') {
      const call = this.calls.get(event.item_id);
      if (!call) return;
      call.args += event.delta;
      call.status = this.describeCall(call);
    } else return;
    if (this.state === 'model' || this.state === 'tools') this.update();
  }

  /** Shows nothing until the next phase. */
  clear(): void {
    this.calls.clear();
    this.round = undefined;
    this.set(null);
  }

  private describeCall(call: Call): PetStatus | null {
    const described = this.describe?.(call.name, call.args, call.done);
    return described === undefined ? defaultStatus(call.name, this.busy()) : described;
  }

  /** The latest run of calls of one kind: its last wording, its first detail and how many. */
  private update(): void {
    const calls = [...this.calls.values()];
    let last: PetStatus | null = null, first: PetStatus | null = null, count = 0;
    for (let i = calls.length - 1; i >= 0; i--) {
      const s = calls[i].status;
      if (!s) continue;
      if (last && s.kind !== last.kind) break;
      last ??= s;
      first = s;
      count++;
    }
    if (last && first) this.set({ kind: last.kind, text: last.text, ...(first.detail ? { detail: first.detail } : {}), ...(count > 1 ? { count } : {}) });
    else this.set(calls.at(-1)?.done ? null : THINK);
  }

  private set(status: PetStatus | null): void {
    const c = this.current;
    if (c?.kind === status?.kind && c?.text === status?.text && c?.detail === status?.detail && c?.count === status?.count) return;
    this.current = status;
    this.changed(status);
  }
}

/** Longest `text` and `detail` a posted status may show, in code points; the bubble shows one line. */
const POSTED_TEXT_MAX = 40;
const POSTED_DETAIL_MAX = 80;
/** How long a posted status stays without a refresh, and the longest a caller may ask for. */
export const POSTED_STATUS_SECONDS = 20;
const POSTED_SECONDS_MAX = 3600;

export interface PostedStatus {
  status: PetStatus | null;
  ttlSeconds: number;
}

/** Reads and checks a `POST /api/status` body. The message goes back to the caller that posted it, never to the person. */
export function postedStatusOf(body: Record<string, unknown>): PostedStatus | { error: string } {
  const raw = body.status;
  if (raw === null) return { status: null, ttlSeconds: POSTED_STATUS_SECONDS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'status must be an object or null' };
  const s = raw as Record<string, unknown>;
  if (typeof s.kind !== 'string' || !(PET_STATUS_KINDS as readonly string[]).includes(s.kind)) return { error: `unknown kind: ${String(s.kind)}` };
  if (typeof s.text !== 'string') return { error: 'text must be a string' };
  if (s.detail !== undefined && typeof s.detail !== 'string') return { error: 'detail must be a string' };
  if (s.count !== undefined && (!Number.isInteger(s.count) || (s.count as number) < 1)) return { error: 'count must be a positive integer' };
  let ttlSeconds = POSTED_STATUS_SECONDS;
  if (body.ttlSeconds !== undefined) {
    if (typeof body.ttlSeconds !== 'number' || !Number.isFinite(body.ttlSeconds) || body.ttlSeconds <= 0) return { error: 'ttlSeconds must be a positive number' };
    ttlSeconds = Math.min(body.ttlSeconds, POSTED_SECONDS_MAX);
  }
  return {
    status: {
      kind: s.kind as PetStatusKind,
      text: cutChars(s.text, POSTED_TEXT_MAX),
      ...(s.detail === undefined ? {} : { detail: cutChars(s.detail, POSTED_DETAIL_MAX) }),
      ...(s.count === undefined ? {} : { count: s.count as number }),
    },
    ttlSeconds,
  };
}

/**
 * A status another process on this machine posted, which wins over the tracker's while it is fresh:
 * an agent working here shows the person what it is doing, in the pet's own bubble. Every post
 * restarts the lifetime, so a caller that stops or dies leaves the bubble to the tracker.
 */
export class PostedStatusSource {
  private status: PetStatus | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly changed: () => void) {}

  get current(): PetStatus | null {
    return this.status;
  }

  /** Sets it, or clears it with `null`. */
  set(status: PetStatus | null, ttlSeconds: number): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.status = status;
    if (status) this.timer = setTimeout(() => { this.timer = null; this.status = null; this.changed(); }, ttlSeconds * 1000);
    this.changed();
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.status = null;
  }
}
