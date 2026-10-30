/** Input activity from unsigned 32-bit millisecond ticks and sampled native cursor positions. */
interface Point { x: number; y: number }

export interface InputSample {
  now: number;
  lastInputTick: number;
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
    const afterOwn = this.ownTick === null || (since(last, this.ownTick) > 40 && since(last, this.ownTick) < 0x80000000);
    const pointerMoved = this.cursor !== null && (Math.abs(cursor.x - this.cursor.x) > 2 || Math.abs(cursor.y - this.cursor.y) > 2);
    if (pointerMoved) {
      // Movement observed between samples needs an input record at least as recent as the earlier sample.
      const recorded = afterOwn && (this.sampledTick === null || since(last, this.sampledTick) < 0x80000000);
      this.movedTick = recorded ? last : now;
      this.cursor = cursor;
    }
    this.cursor ??= cursor;
    this.sampledTick = now;
    return {
      now, lastInputTick: last, cursor, ownInputTick: this.ownTick,
      systemInputTick: afterOwn ? last : null, pointerTick: this.movedTick, pointerMoved,
      idleMs: Math.min(afterOwn ? since(now, last) : Infinity, this.movedTick === null ? Infinity : since(now, this.movedTick)),
    };
  }
}
