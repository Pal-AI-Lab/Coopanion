/**
 * World 测试共用的 fake host:记录推送的事件与唤醒口径。`deliver: false` 的事件只落库,记在 stored,
 * 不进 events;store.range 按落库顺序读两者。其余宿主接口都是空实现。
 */
import type { EventEnvelope, EventRangeQuery, WorldHost, PushOptions } from 'cortico/core/types.ts';

export class FakeHost implements WorldHost {
  /** 投递给 bot 的事件。 */
  events: EventEnvelope[] = [];
  /** 只落库、不投递的事件。 */
  stored: EventEnvelope[] = [];
  private all: EventEnvelope[] = [];
  pushDeferred(): void {}
  store = {
    get: (cursor: number) => this.all.find((e) => e.cursor === cursor),
    latestCursor: () => this.all.length,
    range: (q: EventRangeQuery) => {
      const hit = this.all.filter((e) => (!q.source || e.source === q.source) && (q.toCursor === undefined || e.cursor <= q.toCursor));
      return q.limit === undefined ? hit : hit.slice(-q.limit);
    },
    around: () => [],
    grep: () => [],
  } as unknown as WorldHost['store'];
  blob = (_handle: string): { bytes: Uint8Array; mime: string } | null => null;
  modelFacts = { model: () => 'test', accepts: () => false, contextWindow: () => 128000 };
  log = {
    child() {
      return this;
    },
    info() {},
    warn() {},
    error() {},
    debug() {},
    trace() {},
    emit() {},
  } as unknown as WorldHost['log'];

  /** 与 events 逐条对齐:唤醒/攒批的口径也要能断言 */
  pushOpts: Array<PushOptions | undefined> = [];
  /** 与 events 逐条对齐:事件开头的本地时间前缀;events 里的 text 去掉了它,断言只看正文 */
  stamps: string[] = [];

  async pushEvent(e: Omit<EventEnvelope, 'cursor' | 'contextDelivery'>, opts?: PushOptions): Promise<EventEnvelope> {
    const deliver = opts?.deliver !== false;
    const stamp = /^\[[^\]]*\d\d:\d\d\] /.exec(e.text)?.[0] ?? '';
    const full = { ...e, text: e.text.slice(stamp.length), cursor: this.all.length + 1, contextDelivery: deliver ? 'deliver' : 'archive-only' } as EventEnvelope;
    this.all.push(full);
    if (!deliver) {
      this.stored.push(full);
      return full;
    }
    this.stamps.push(stamp);
    this.events.push(full);
    this.pushOpts.push(opts);
    return full;
  }
  async drainPendingEvents(): Promise<EventEnvelope[]> {
    return [];
  }
  /** 撤回过的游标;撤回成功与否由 withdrawable 决定。 */
  withdrawn: number[] = [];
  withdrawable = true;
  async withdrawPending(cursor: number): Promise<boolean> {
    if (!this.withdrawable) return false;
    this.withdrawn.push(cursor);
    return true;
  }
  promoted: Array<[number, string]> = [];
  async promotePending(cursor: number, trigger: 'flush' | 'preempt' | 'interrupt'): Promise<boolean> {
    this.promoted.push([cursor, trigger]);
    return true;
  }
  notes: string[] = [];
  reportUsage(): void {}
}
