/**
 * What the bot is doing, for the status bubble above the pet. Core's run phase says when: a model request, a retry
 * and a handoff show thinking, the end of a batch shows nothing. The main session's output stream says what: a tool
 * call's arguments are read while they stream, so a file name can show before the call is written out. Which tools
 * show what is the embedding app's choice (`DescribeTool`); without one, the pet's own tools show nothing and every
 * other tool shows as busy.
 */
import type { RunPhase } from 'cortico/core/types.ts';
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { petText } from './i18n/index.ts';

export interface PetStatus {
  /** Also the icon the bubble shows (`status_<kind>` in web/ui.js). */
  kind: 'think' | 'read' | 'browse' | 'search' | 'write' | 'delete' | 'save' | 'look' | 'click' | 'scroll' | 'type' | 'wait' | 'alarm' | 'work';
  text: string;
  detail?: string;
  count?: number;
  /** Seconds the call lasts, from a DescribeTool; StatusTracker turns it into `endsAt` once the call runs. */
  countdown?: number;
  /** When the running call's countdown ends, in Date.now() milliseconds, the same however late a page connects. */
  endsAt?: number;
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

/** `endsAt`: set from the status's countdown when the call starts running. */
interface Call { name: string; args: string; done: boolean; status: PetStatus | null; endsAt?: number }

export class StatusTracker {
  private readonly calls = new Map<string, Call>();
  private state: RunPhase['state'] = 'idle';
  private round: number | undefined;
  /** The tools running now, as RunPhase `running` names them, and how many times each name started this round. */
  private running: readonly string[] = [];
  private readonly started = new Map<string, number>();
  private current: PetStatus | null = null;

  /** `busy`: what a call without a description shows, in the app language at the time. */
  constructor(private readonly changed: (status: PetStatus | null) => void, private readonly describe?: DescribeTool, private readonly busy: () => string = () => petText().busy) {}

  get status(): PetStatus | null { return this.current; }

  onPhase(phase: RunPhase): void {
    this.state = phase.state;
    switch (phase.state) {
      case 'idle':
        this.calls.clear();
        this.started.clear();
        this.running = [];
        this.round = undefined;
        this.set(null);
        return;
      case 'backoff':
      case 'handoff':
        this.noteRunning(phase.running);
        this.set(THINK);
        return;
      default:
        // a new round's request starts from thinking; the calls of the round before are done with
        if (phase.round !== this.round) { this.round = phase.round; this.calls.clear(); this.started.clear(); }
        this.noteRunning(phase.running);
        this.update();
    }
  }

  /** Counts the starts in `running`: a name listed more times than before started that many more calls. */
  private noteRunning(running: readonly string[]): void {
    for (const name of new Set(running)) {
      const more = running.filter((n) => n === name).length - this.running.filter((n) => n === name).length;
      if (more > 0) this.started.set(name, (this.started.get(name) ?? 0) + more);
    }
    this.running = running;
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

  /**
   * The latest run of calls of one kind: its last wording, its first detail, and how many; and when the countdown of the
   * call in it that runs now ends, the calls of one name running in the order they were written.
   */
  private update(): void {
    const calls = [...this.calls.values()];
    const run: Call[] = [];
    let last: PetStatus | null = null;
    for (let i = calls.length - 1; i >= 0; i--) {
      const s = calls[i].status;
      if (!s) continue;
      if (last && s.kind !== last.kind) break;
      last ??= s;
      run.unshift(calls[i]);
    }
    const lead = run[0]?.status;
    if (!last || !lead) { this.set(calls.at(-1)?.done ? null : THINK); return; }
    const runs = (c: Call) => this.running.includes(c.name) && calls.filter((o) => o.name === c.name).indexOf(c) === (this.started.get(c.name) ?? 0) - 1;
    const counting = run.find((c) => c.status?.countdown !== undefined && runs(c));
    if (counting) counting.endsAt ??= Date.now() + counting.status!.countdown! * 1000;
    const endsAt = counting?.endsAt;
    this.set({ kind: last.kind, text: last.text, ...(lead.detail ? { detail: lead.detail } : {}), ...(endsAt !== undefined ? { endsAt } : {}), ...(run.length > 1 ? { count: run.length } : {}) });
  }

  private set(status: PetStatus | null): void {
    const c = this.current;
    if (c?.kind === status?.kind && c?.text === status?.text && c?.detail === status?.detail && c?.endsAt === status?.endsAt && c?.count === status?.count) return;
    this.current = status;
    this.changed(status);
  }
}
