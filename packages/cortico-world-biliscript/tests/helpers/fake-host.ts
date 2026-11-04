/** Fake WorldHost for World tests: records pushed events and reported usage; the rest are no-ops. */
import type { EventEnvelope, LLMUsage, PushOptions, WorldHost } from 'cortico/core/types.ts';

export class FakeHost implements WorldHost {
  events: EventEnvelope[] = [];
  pushOpts: Array<PushOptions | undefined> = [];
  usage: Array<{ usage: LLMUsage; model?: string }> = [];
  pushDeferred(): void {}
  store = {
    get: () => undefined,
    latestCursor: () => 0,
    range: () => [],
    around: () => [],
    grep: () => [],
  } as unknown as WorldHost['store'];
  blob = (): { bytes: Uint8Array; mime: string } | null => null;
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

  async pushEvent(e: Omit<EventEnvelope, 'cursor'>, opts?: PushOptions): Promise<EventEnvelope> {
    const full = { ...e, origin: e.origin ?? 'external', cursor: this.events.length + 1 } as EventEnvelope;
    this.events.push(full);
    this.pushOpts.push(opts);
    return full;
  }
  async drainPendingEvents(): Promise<EventEnvelope[]> {
    return [];
  }
  reportUsage(usage: LLMUsage, opts?: { model?: string }): void {
    this.usage.push({ usage, model: opts?.model });
  }
}
