/** Activity inferred from the main session's output stream, kept through the tools after each round. */
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts';

export interface Activity {
  kind: 'think' | 'read' | 'browse' | 'search' | 'write' | 'delete' | 'save' | 'look' | 'click' | 'type' | 'wait' | 'alarm' | 'work';
  text: string;
  detail?: string;
  count?: number;
}

type Args = Record<string, unknown> | string;
const THINK: Activity = { kind: 'think', text: '' };
const STALE_MS = 120_000;

/** Read only closed values, even while the rest of the arguments (often a file's body) is still streaming. */
function stringArg(args: Args, key: string): string | undefined {
  if (typeof args !== 'string') return typeof args[key] === 'string' ? args[key] : undefined;
  const match = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(args);
  if (!match) return undefined;
  try { return JSON.parse(match[1]) as string; } catch { return undefined; }
}
function numberArg(args: Args, key: string): number | undefined {
  const value = typeof args === 'string'
    ? new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\s*[,}]`).exec(args)?.[1]
    : args[key];
  return value !== undefined && Number.isFinite(Number(value)) && (typeof value === 'number' || typeof value === 'string') ? Number(value) : undefined;
}
const leaf = (path: string | undefined) => path?.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const shorten = (text: string) => { const chars = [...text]; return chars.length > 20 ? chars.slice(0, 20).join('') + '…' : text; };

/** Only the fields named here may reach the page; typed text, notes, window titles and coordinates never do. */
export function activityOf(name: string, args: Args = {}): Activity | null {
  const show = (kind: Activity['kind'], text: string, detail?: string): Activity => ({ kind, text, ...(detail ? { detail: shorten(detail) } : {}) });
  switch (name) {
    case 'read_file': return show('read', '在看', leaf(stringArg(args, 'path')));
    case 'list_files': {
      const dir = leaf(stringArg(args, 'dir'));
      return show('browse', '在翻', dir ? `${dir}/` : '记忆');
    }
    case 'glob_files': return show('browse', '在找', stringArg(args, 'glob_pattern'));
    case 'grep_files': {
      const pattern = stringArg(args, 'pattern');
      return show('search', '在搜', pattern ? `「${pattern}」` : undefined);
    }
    case 'write_file': return show('write', '在写', leaf(stringArg(args, 'path')));
    case 'edit_file': return show('write', '在改', leaf(stringArg(args, 'path')));
    case 'append_file': return show('write', '在补记', leaf(stringArg(args, 'path')));
    case 'delete_file': return show('delete', '在删', leaf(stringArg(args, 'path')));
    case 'save_blob': return show('save', '在存', leaf(stringArg(args, 'path')));
    case 'cua_screenshot': return show('look', '在看屏幕');
    case 'cua_windows': return show('look', '在看开着的窗口');
    case 'cua_click': return show('click', stringArg(args, 'button') === 'right' ? '在右键' : numberArg(args, 'clicks') === 2 ? '在双击' : '在点');
    case 'cua_move': return show('click', '在挪鼠标');
    case 'cua_drag': return show('click', '在拖');
    case 'cua_scroll': return show('click', '在滚动');
    case 'cua_focus': return show('click', '在切窗口');
    case 'cua_type': return show('type', '在打字');
    case 'cua_key': return show('type', '在按', stringArg(args, 'keys'));
    case 'cua_wait': {
      const seconds = numberArg(args, 'seconds');
      return show('wait', '等', seconds === undefined ? undefined : `${seconds} 秒`);
    }
    case 'alarm_set': {
      const minutes = numberArg(args, 'in_minutes');
      return show('alarm', '在定闹钟', stringArg(args, 'at') || (minutes === undefined ? undefined : `${minutes} 分钟后`));
    }
    case 'alarm_list': return show('alarm', '在看闹钟');
    case 'alarm_cancel': return show('alarm', '在取消闹钟');
    case 'terminal_send': case 'end_turn': return null;
    default: return name.startsWith('pet_') ? null : show('work', '在忙');
  }
}

interface Call { name: string; args: string; done: boolean; activity: Activity | null }

export class ActivityTracker {
  private readonly calls = new Map<string, Call>();
  private nextRound = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: Activity | null = null;

  constructor(private readonly changed: (status: Activity | null) => void) {}

  get status(): Activity | null { return this.current; }

  onEvent(event: StreamEvent): void {
    if (this.nextRound || event.type === 'response.created') {
      this.nextRound = false;
      this.calls.clear();
      this.set(THINK);
    }
    if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
      const item = event.item;
      if (item?.type === 'function_call') {
        const done = event.type === 'response.output_item.done';
        const call = this.calls.get(item.id) ?? { name: item.name, args: '', done: false, activity: null };
        call.name = item.name;
        call.args = item.arguments;
        call.done = done;
        call.activity = activityOf(call.name, call.args);
        // Map insertion order survives delayed done events and colliding output_index values.
        this.calls.set(item.id, call);
        this.update();
      }
    } else if (event.type === 'response.function_call_arguments.delta') {
      const call = this.calls.get(event.item_id);
      if (call) {
        call.args += event.delta;
        call.activity = activityOf(call.name, call.args);
        this.update();
      }
    }
    if (this.current) {
      if (this.timer) this.timer.refresh();
      else this.timer = setTimeout(() => this.set(null), STALE_MS);
    }
  }

  onRoundEnd(): void { this.nextRound = true; }
  onAbort(): void { this.onTurnEnded(); }
  onTurnEnded(): void {
    this.nextRound = true;
    this.calls.clear();
    this.set(null);
  }

  private update(): void {
    const calls = [...this.calls.values()];
    let last: Activity | null = null, first: Activity | null = null, count = 0;
    for (let i = calls.length - 1; i >= 0; i--) {
      const a = calls[i].activity;
      if (!a) continue;
      if (last && a.kind !== last.kind) break;
      last ??= a;
      first = a;
      count++;
    }
    if (last && first) {
      this.set({ kind: last.kind, text: last.text, ...(first.detail ? { detail: first.detail } : {}), ...(count > 1 ? { count } : {}) });
    } else this.set(calls.at(-1)?.done ? null : THINK);
  }

  private set(status: Activity | null): void {
    if (!status && this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.current?.kind === status?.kind && this.current?.text === status?.text && this.current?.detail === status?.detail && this.current?.count === status?.count) return;
    this.current = status;
    this.changed(status);
  }
}
