/** A stand-in for the pet page: connects over the real socket, records orders, sends reports. */
import WebSocket from 'ws';

export class FakePage {
  readonly messages: Array<Record<string, unknown>> = [];
  private waiters: Array<{ match: (m: Record<string, unknown>) => boolean; done: (m: Record<string, unknown>) => void }> = [];
  closeCode: number | null = null;
  /** The `init` message the World sent on connect. */
  init: Record<string, unknown> = {};

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const m = JSON.parse(data.toString()) as Record<string, unknown>;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.match(m)) return true;
        w.done(m);
        return false;
      });
    });
    ws.on('close', (code) => { this.closeCode = code; });
  }

  static async open(origin: string, query = 'role=pet&host=window'): Promise<FakePage> {
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/socket?${query}`);
    const page = new FakePage(ws);
    await new Promise<void>((done, fail) => { ws.once('open', () => done()); ws.once('error', fail); });
    page.init = await page.next((m) => m.t === 'init');
    return page;
  }

  next(match: (m: Record<string, unknown>) => boolean, timeoutMs = 5000): Promise<Record<string, unknown>> {
    const seen = this.messages.find(match);
    if (seen) {
      this.messages.splice(this.messages.indexOf(seen), 1);
      return Promise.resolve(seen);
    }
    return new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('page: no matching message')), timeoutMs);
      this.waiters.push({ match, done: (m) => { clearTimeout(timer); this.messages.splice(this.messages.indexOf(m), 1); done(m); } });
    });
  }

  send(msg: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  audio(frame: Int16Array): void {
    this.ws.send(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
  }

  close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((done) => { this.ws.once('close', () => done()); this.ws.close(); });
  }
}
