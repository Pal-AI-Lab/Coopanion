// The figure frame (web/figure-frame.js) running the frozen api 2 pack (tests/fixtures/api2-pack in the
// desktop-pet package) the way the pet page drives it: a change to the frame or the kit that breaks this
// breaks the packs people have published (the package README, 形象包兼容承诺).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const PACK = new URL('tests/fixtures/api2-pack/', PKG);

describe('figure frame, api 2', () => {
  it('runs a pack made for it: ready with its words, frames, its own gesture, a scheme, a walk', async () => {
    const frame = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://127.0.0.1/figure-frame' }).window;
    const page = new JSDOM('<!doctype html>', { url: 'http://127.0.0.1/pet' }).window;
    const out = [];
    page.postMessage = (m) => out.push(m);
    Object.assign(globalThis, { document: frame.document, parent: page, addEventListener: frame.addEventListener.bind(frame) });
    await import(new URL('web/figure-frame.js', PKG).href);
    const send = (data) => frame.dispatchEvent(new frame.MessageEvent('message', { data, source: page }));
    const next = async (t) => { await expect.poll(() => out.some((m) => m.t === t || m.t === 'error')).toBe(true); return out.find((m) => m.t === t) ?? out.find((m) => m.t === 'error'); };
    const ticks = (n) => { const got = []; for (let i = 0; i < n; i++) { out.length = 0; send({ t: 'tick', dt: 1 / 60 }); const err = out.find((m) => m.t === 'error'); if (err) throw new Error(err.message); got.push(...out.filter((m) => m.t === 'frame')); } return got; };
    const circle = () => frame.document.querySelector('#root circle');

    expect(out[0]).toEqual({ t: 'loaded' });
    send({
      t: 'init', entry: new URL('figure.js', PACK).href, export: 'createFixtureBody', base: PACK.href,
      model: JSON.parse(readFileSync(new URL('model.json', PACK), 'utf8')), scheme: 'day',
      start: { x: 200, facing: 1, skin: null }, theme: 'dark', bounds: { W: 800, H: 400, floorY: 380, S: .42 },
    });
    const ready = await next('ready');
    expect(ready).toMatchObject({ t: 'ready', z: '#336699' });
    expect(ready.words).toEqual(expect.arrayContaining(['happy', 'sit', 'salute']));

    const [first] = ticks(1);
    expect(first.layout).toMatchObject({ facing: 1, box: { w: expect.any(Number), h: expect.any(Number) } });
    expect(first.layout.box.w).toBeGreaterThan(0);
    expect(circle().getAttribute('data-tone')).toBe('day');
    expect(circle().getAttribute('data-base')).toBe(PACK.href);
    expect(circle().getAttribute('data-asset')).toBe(new URL('thumb.png', PACK).href);
    expect(circle().getAttribute('data-loader')).toBe('function');

    send({ t: 'do', word: 'salute' });
    ticks(10);
    expect(circle().getAttribute('data-gesture')).toBe('salute');

    out.length = 0;
    send({ t: 'scheme', id: 'night', fade: 0, seq: 1 });
    expect(await next('scheme')).toMatchObject({ seq: 1 });
    ticks(1);
    expect(circle().getAttribute('data-tone')).toBe('night');

    send({ t: 'walk', x: 500, run: false, id: 'w1' });
    const events = ticks(60 * 15).flatMap((f) => f.events);
    expect(events).toContainEqual({ kind: 'arrived', detail: expect.objectContaining({ walkId: 'w1' }) });
  });
});
