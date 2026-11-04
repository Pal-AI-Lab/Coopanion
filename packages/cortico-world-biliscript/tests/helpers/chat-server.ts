/** A local HTTP server that answers like a model service; each test scripts the replies. */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Received {
  path: string;
  headers: IncomingMessage['headers'];
  body: any;
}

export async function startChatServer(
  reply: (req: Received) => { status?: number; json: unknown },
): Promise<{ baseUrl: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const r: Received = { path: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : null };
      received.push(r);
      const out = reply(r);
      res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
