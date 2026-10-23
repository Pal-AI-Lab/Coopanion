import { describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Telemetry } from '../core/telemetry.ts';

describe('telemetry shutdown', () => {
  it.each(['new', 'in-flight'] as const)('aborts a stalled %s request at the shutdown deadline and preserves its events', async (mode) => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-telemetry-shutdown-'));
    const server = createServer((req) => { req.resume(); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const stats = new Telemetry({ dir, version: 'test', enabled: () => true,
        snapshot: () => ({}), extensions: () => [], url: `http://127.0.0.1:${port}/report` });
      const received = once(server, 'request');
      let earlier: Promise<void> | undefined;
      if (mode === 'in-flight') {
        earlier = stats.send();
        await received;
      }
      const stopped = stats.stop();
      const [, response] = await received;
      const disconnected = once(response, 'close');
      await vi.runOnlyPendingTimersAsync();
      await stopped;
      await earlier;
      await disconnected;
      const saved = JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8'));
      expect(saved.queue.map((event: { type: string }) => event.type)).toContain('first_launch');
    } finally {
      vi.useRealTimers();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 5000);
});
