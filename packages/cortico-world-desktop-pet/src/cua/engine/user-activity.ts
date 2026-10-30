/** Input activity from unsigned 32-bit millisecond ticks and sampled native cursor positions. */
interface Point { x: number; y: number }

export interface InputSample {
  now: number;
  /** null when the system cannot report the last input. */
  lastInputTick: number | null;
  cursor: Point;
}

export interface InputActivity extends InputSample {
  ownInputTick: number | null;
  systemInputTick: number | null;
  pointerTick: number | null;
  pointerMoved: boolean;
  idleMs: number;
}

const since = (now: number, then: number) => (now - then) >>> 0;

export class UserActivity {
  private ownTick: number | null = null;
  private cursor: Point | null = null;
  private sampledTick: number | null = null;
  private movedTick: number | null = null;

  markOwn(now: number, cursor: Point): void {
    this.ownTick = now;
    this.cursor = cursor;
    this.sampledTick = now;
    this.movedTick = null;
  }

  /** Each signal's tick and their combined idle time; Infinity when neither records input. */
  sample({ now, lastInputTick: last, cursor }: InputSample): InputActivity {
    // Compare ages within the current tick cycle; pairwise ordering is ambiguous after half a cycle.
    const inputAge = last === null ? Infinity : since(now, last);
    const afterOwn = last !== null && (this.ownTick === null || since(now, this.ownTick) > inputAge + 40);
    const pointerMoved = this.cursor !== null && (Math.abs(cursor.x - this.cursor.x) > 2 || Math.abs(cursor.y - this.cursor.y) > 2);
    if (pointerMoved) {
      // Movement observed between samples needs an input record at least as recent as the earlier sample.
      const recorded = afterOwn && (this.sampledTick === null || inputAge <= since(now, this.sampledTick));
      this.movedTick = recorded ? last : now;
      this.cursor = cursor;
    }
    this.cursor ??= cursor;
    this.sampledTick = now;
    return {
      now, lastInputTick: last, cursor, ownInputTick: this.ownTick,
      systemInputTick: afterOwn ? last : null, pointerTick: this.movedTick, pointerMoved,
      idleMs: Math.min(afterOwn ? inputAge : Infinity, this.movedTick === null ? Infinity : since(now, this.movedTick)),
    };
  }
}
