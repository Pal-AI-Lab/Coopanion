import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { FigurePack } from '../src/packs.ts';
import { PetServer, type PageMessage, type PetServerOptions } from '../src/server.ts';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const servers: PetServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.stop())); });

async function serve(overlay: { on: boolean } = { on: false }, opts: Partial<PetServerOptions> = {}) {
  const server = new PetServer({
    port: () => 0, webDir: WEB_DIR, snapshot: () => ({}),
    onPetMessage: () => {}, onAudio: () => {}, onPetConnect: () => {}, onPetDisconnect: () => {}, onSkin: () => {}, onPrefs: () => {},
    overlay: () => overlay.on,
    ...opts,
  });
  servers.push(server);
  await server.start();
  return server;
}

/** A socket to `role`, with the text messages and binary frames it got, and its close code. */
const windowKey = (server: PetServer) => new URLSearchParams(new URL(server.windowUrl).hash.slice(1)).get('key')!;

async function socket(server: PetServer, role: string, params: Record<string, string> = {}, origin?: string) {
  const query = new URLSearchParams({ role, ...(role === 'overlay-source' ? { key: windowKey(server) } : {}), ...params });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/socket?${query}`, { origin });
  const texts: Array<Record<string, unknown>> = [];
  const frames: Buffer[] = [];
  let closed: number | null = null;
  ws.on('message', (data, isBinary) => { if (isBinary) frames.push(data as Buffer); else texts.push(JSON.parse(String(data))); });
  ws.on('close', (code) => { closed = code; });
  await new Promise((done, fail) => { ws.once('open', done); ws.once('error', fail); });
  return { ws, texts, frames, closed: () => closed };
}

function refused(server: PetServer, params: Record<string, string>, origin?: string): Promise<number> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/socket?${new URLSearchParams(params)}`, { origin });
    ws.once('open', () => { ws.close(); fail(new Error('socket accepted')); });
    ws.once('error', fail);
    ws.once('unexpected-response', (_req, res) => { res.resume(); done(res.statusCode!); ws.terminate(); });
  });
}

describe('local access', () => {
  it('refuses browser writes and sockets from other ports, schemes, opaque and malformed origins', async () => {
    const server = await serve();
    const other = await serve();
    const origins = [other.origin, `http://localhost:${other.port}`, 'http://127.0.0.1', 'http://localhost',
      `https://127.0.0.1:${server.port}`, `ws://127.0.0.1:${server.port}`, `${server.origin}/path`,
      'http://example.test', 'null', 'invalid'];
    for (const origin of origins) {
      for (const path of ['/api/prefs', '/api/skin', '/api/speech', '/api/figures/import', '/api/figures/import/install', '/api/figures/import/cancel', '/api/figures/remove']) {
        expect((await fetch(`${server.origin}${path}`, { method: 'POST', headers: { origin }, body: '{}' })).status, `${origin} ${path}`).toBe(421);
      }
      expect(await refused(server, { role: 'pet' }, origin), origin).toBe(421);
    }
  });

  it('accepts its HTTP origins and native clients without Origin, and keeps loopback reads for embedded pages', async () => {
    const changes: Record<string, unknown>[] = [];
    const server = await serve(undefined, { onPrefs: (prefs) => changes.push(prefs) });
    const other = await serve();
    for (const origin of [server.origin, `http://localhost:${server.port}`, undefined]) {
      const prefs = { theme: 'dark' };
      const res = await fetch(`${server.origin}/api/prefs`, { method: 'POST', headers: origin ? { origin } : {}, body: JSON.stringify(prefs) });
      expect(res.status).toBe(200);
      expect(changes.at(-1)).toEqual(prefs);
      const page = await socket(server, 'pet', {}, origin);
      await expect.poll(() => page.texts).toContainEqual({ t: 'init' });
    }
    for (const origin of [other.origin, 'null']) {
      expect((await fetch(`${server.origin}/pet`, { headers: { origin } })).status).toBe(200);
      expect((await fetch(`${server.origin}/figure-frame`, { headers: { origin } })).status).toBe(200);
    }
    const asset = await fetch(`${server.origin}/web/figure-frame.js`, { headers: { origin: 'null' } });
    expect(asset.headers.get('access-control-allow-origin')).toBe('null');
  });

  it('requires the window key before sending a snapshot or replacing a pet window', async () => {
    const messages: PageMessage[] = [];
    const server = await serve(undefined, { onPetMessage: (msg) => messages.push(msg) });
    expect(await refused(server, { role: 'pet', host: 'window' }, server.origin)).toBe(403);
    expect(server.petConnected).toBe(false);
    const win = await socket(server, 'pet', { host: 'window', key: windowKey(server) }, server.origin);
    expect(server.petInWindow).toBe(true);
    for (const key of ['', 'wrong']) {
      expect(await refused(server, { role: 'pet', host: 'window', key }, server.origin)).toBe(403);
      expect(await refused(server, { role: 'overlay-source', key })).toBe(403);
    }
    const tab = await socket(server, 'pet', { host: 'tab' }, server.origin);
    await expect.poll(() => tab.texts).toContainEqual({ t: 'watching' });
    server.sendPet({ t: 'confirm', id: 'permission', options: ['yes', 'no'] });
    await expect.poll(() => win.texts.some((m) => m.t === 'confirm')).toBe(true);
    expect(tab.texts.some((m) => m.t === 'confirm')).toBe(false);
    tab.ws.send(JSON.stringify({ t: 'confirmed', id: 'permission', index: 0 }));
    tab.ws.send(JSON.stringify({ t: 'text', text: 'hello' }));
    await expect.poll(() => messages).toEqual([{ t: 'text', text: 'hello' }]);
    win.ws.send(JSON.stringify({ t: 'confirmed', id: 'permission', index: 1 }));
    await expect.poll(() => messages.at(-1)).toEqual({ t: 'confirmed', id: 'permission', index: 1 });
    expect(win.closed()).toBeNull();
    for (const path of ['/api/state', '/pet', '/dress']) {
      expect(await (await fetch(`${server.origin}${path}`)).text()).not.toContain(windowKey(server));
    }
    expect(JSON.stringify(win.texts)).not.toContain(windowKey(server));
  });

  it('lets an authenticated window reconnect and replace its previous connection', async () => {
    const server = await serve();
    const params = { host: 'window', key: windowKey(server) };
    const first = await socket(server, 'pet', params, server.origin);
    const next = await socket(server, 'pet', params, server.origin);
    await expect.poll(first.closed).toBe(4000);
    expect(server.petInWindow).toBe(true);
    server.sendPet({ t: 'act', actions: ['nod'] });
    await expect.poll(() => next.texts).toContainEqual({ t: 'act', actions: ['nod'] });
    const other = await serve();
    expect(windowKey(other)).not.toBe(windowKey(server));
    expect(await refused(other, { role: 'pet', ...params }, other.origin)).toBe(403);
  });
});

describe('OBS overlay', () => {
  it('is not served while off', async () => {
    const server = await serve({ on: false });
    expect((await fetch(`${server.origin}/overlay`)).status).toBe(404);
    const viewer = await socket(server, 'overlay');
    await expect.poll(viewer.closed).toBe(4003);
  });

  it('streams while a page watches: the window process is told, and its frames reach the page as sent', async () => {
    const state = { on: true };
    const server = await serve(state);
    const page = await fetch(`${server.origin}/overlay`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('/web/overlay.js');

    const source = await socket(server, 'overlay-source');
    await expect.poll(() => source.texts.at(-1)).toEqual({ t: 'overlay', on: false });
    const viewer = await socket(server, 'overlay');
    await expect.poll(() => source.texts.at(-1)).toEqual({ t: 'overlay', on: true });

    const frame = Buffer.from([1, 2, 3, 4, 5]);
    source.ws.send(frame);
    await expect.poll(() => viewer.frames.length).toBe(1);
    expect(viewer.frames[0]).toEqual(frame);

    viewer.ws.close();
    await expect.poll(() => source.texts.at(-1)).toEqual({ t: 'overlay', on: false });
  });

  it('the pages are sent a clearing frame when the window process goes', async () => {
    const server = await serve({ on: true });
    const source = await socket(server, 'overlay-source');
    const viewer = await socket(server, 'overlay');
    await expect.poll(() => source.texts.at(-1)).toEqual({ t: 'overlay', on: true });
    source.ws.close();
    await expect.poll(() => viewer.frames.length).toBe(1);
    // a header of zeros: no display size and an empty part
    expect([...new Uint32Array(new Uint8Array(viewer.frames[0]!).buffer)]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('turning it off closes the pages watching and stops the stream', async () => {
    const state = { on: true };
    const server = await serve(state);
    const source = await socket(server, 'overlay-source');
    const viewer = await socket(server, 'overlay');
    await expect.poll(() => source.texts.at(-1)).toEqual({ t: 'overlay', on: true });
    state.on = false;
    server.syncOverlay();
    await expect.poll(viewer.closed).toBe(4003);
    await expect.poll(() => source.texts.at(-1)).toEqual({ t: 'overlay', on: false });
  });
});

describe('installed pack files', () => {
  it('a pack page opened on its own is sandboxed, and its script is still served as a script', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pet-pack-'));
    writeFileSync(join(dir, 'page.html'), '<script>fetch("/api/state")</script>');
    writeFileSync(join(dir, 'figure.js'), 'export const figure = {};');
    const server = await serve({ on: false }, { packs: () => [{ id: 'p', dir, builtin: false } as FigurePack] });
    const page = await fetch(`${server.origin}/packs/p/page.html`);
    expect(page.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts;/);
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    const script = await fetch(`${server.origin}/packs/p/figure.js`, { headers: { origin: 'null' } });
    expect(script.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(script.headers.get('access-control-allow-origin')).toBe('null');
  });

  it('the figure frame may connect only to the folder of the installed pack it names', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pet-pack-'));
    const server = await serve({ on: false }, { packs: () => [{ id: 'p', dir, builtin: false }, { id: 'coo', dir, builtin: true }] as FigurePack[] });
    const connect = async (query: string) => (await fetch(`${server.origin}/figure-frame${query}`)).headers.get('content-security-policy')!.match(/connect-src ([^;]*)/)![1];
    expect(await connect('?pack=p')).toBe(`${server.origin}/packs/p/`);
    for (const query of ['?pack=other', '?pack=coo', '']) expect(await connect(query)).toBe("'none'");
  });
});
