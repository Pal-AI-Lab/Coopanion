/** Input activity from unsigned 32-bit millisecond ticks and sampled native cursor positions. */
interface Point { x: number; y: number }

export interface InputSample {
  now: number;
  lastInputTick: number;
  cursor: Point;
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

  /** Milliseconds since the user's last input; Infinity when none is on record. */
  idleMs({ now, lastInputTick: last, cursor }: InputSample): number {
    const afterOwn = this.ownTick === null || (since(last, this.ownTick) > 40 && since(last, this.ownTick) < 0x80000000);
    if (this.cursor && (Math.abs(cursor.x - this.cursor.x) > 2 || Math.abs(cursor.y - this.cursor.y) > 2)) {
      // Movement observed between samples needs an input record at least as recent as the earlier sample.
      const recorded = afterOwn && (this.sampledTick === null || since(last, this.sampledTick) < 0x80000000);
      this.movedTick = recorded ? last : now;
      this.cursor = cursor;
    }
    this.cursor ??= cursor;
    this.sampledTick = now;
    return Math.min(afterOwn ? since(now, last) : Infinity, this.movedTick === null ? Infinity : since(now, this.movedTick));
  }
}
