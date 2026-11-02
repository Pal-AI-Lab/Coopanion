/**
 * A local stand-in for OpenRouter's decisions endpoint: records each request with its Authorization header and
 * answers with what `answer` picks. `delayMs` holds an answer and `status` fails it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockRequest { auth: string | undefined; body: { model: string; state: string; questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }> } }

export class DeciderMock {
  readonly requests: MockRequest[] = [];
  delayMs = 0;
  status = 200;
  failMessage = 'mock failure';
  /** Per question, the option keys and their probabilities; a question left out answers its keep option (the first). */
  answer: (req: MockRequest) => Record<string, Array<[string, number]>> = () => ({});
  private server: Server | null = null;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const r: MockRequest = { auth: req.headers.authorization, body: JSON.parse(raw) };
        this.requests.push(r);
        const send = () => {
          if (res.destroyed) return;
          if (this.status !== 200) {
            res.writeHead(this.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: this.failMessage, code: this.status } }));
            return;
          }
          const picked = this.answer(r);
          const answers = Object.fromEntries(Object.entries(r.body.questions).map(([q, def]) => {
            const list = picked[q] ?? [[Object.keys(def.criteria)[0]!, .9]];
            for (const [k] of list) if (!(k in def.criteria)) throw new Error(`mock: ${q} has no option ${k}`);
            return [q, { type: 'choice', choice: list[0]![0], probabilities: Object.fromEntries(list) }];
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answers }));
        };
        if (this.delayMs) setTimeout(send, this.delayMs); else send();
      });
    });
    await new Promise<void>((done) => this.server!.listen(0, '127.0.0.1', () => done()));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/alpha/decisions`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((done) => (this.server ? this.server.close(() => done()) : done()));
  }
}
