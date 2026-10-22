import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type RequestListener, type Server } from 'node:http';
import { ClaudeProvider } from '../src/anthropic/client.ts';
import { MODEL_PAGES_MAX, listGeminiModels } from '../src/gemini/client.ts';

const servers: Server[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.close(); });

/** A local service on a free port; resolves to its origin. */
function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
}

describe('model lists', () => {
  it('Gemini stops at a page token it has seen, and after the page limit when every token is new', async () => {
    let repeats = 0;
    const repeating = await serve((_req, res) => { repeats++; res.end(JSON.stringify({ models: [{ name: 'models/a' }], nextPageToken: 'same' })); });
    expect(await listGeminiModels(repeating, 'key')).toHaveLength(2);
    expect(repeats).toBe(2);
    let pages = 0;
    const endless = await serve((_req, res) => { pages++; res.end(JSON.stringify({ models: [{ name: `models/m${pages}` }], nextPageToken: `t${pages}` })); });
    expect(await listGeminiModels(endless, 'key')).toHaveLength(MODEL_PAGES_MAX);
    expect(pages).toBe(MODEL_PAGES_MAX);
  });

  it('a redirect fails the listing, and the address it points to is never asked with the key', async () => {
    const asked: string[] = [];
    const target = await serve((req, res) => { asked.push(String(req.headers['x-goog-api-key'] ?? req.headers['x-api-key'])); res.end('{"models":[],"data":[]}'); });
    const moved = await serve((req, res) => { res.writeHead(307, { location: `${target}${req.url}` }).end(); });
    await expect(listGeminiModels(moved, 'key')).rejects.toThrow();
    const claude = new ClaudeProvider({ baseUrl: moved, apiKey: 'key' });
    await expect((async () => { for await (const _ of claude.client().models.list()) break; })()).rejects.toThrow();
    expect(asked).toEqual([]);
  });
});
