// What the figure frame (web/figure-frame.js) writes into its document as the pet page drives Coo's pack: a tick with
// `draw` false (the pet window hidden) moves the body on and writes nothing.
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const COO = new URL('web/coo/', PKG);
/** The resting frame rate of the pet page (web/pet-app.js), in seconds a frame. */
const DT = 1 / 30;

/** A fresh frame with Coo in it, standing at x 200 with roaming off; `tick` returns the frame's report and what it wrote. */
async function cooFrame() {
  vi.resetModules();
  const frame = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://127.0.0.1/figure-frame' }).window;
  const page = new JSDOM('<!doctype html>', { url: 'http://127.0.0.1/pet' }).window;
  const out = [];
  page.postMessage = (m) => out.push(m);
  Object.assign(globalThis, { document: frame.document, parent: page, addEventListener: frame.addEventListener.bind(frame) });
  await import(new URL('web/figure-frame.js', PKG).href);
  const send = (data) => frame.dispatchEvent(new frame.MessageEvent('message', { data, source: page }));
  send({
    t: 'init', entry: new URL('figure.js', COO).href, export: 'createCooBody', base: COO.href, scheme: '',
    start: { x: 200, facing: 1, skin: null }, theme: 'light', bounds: { W: 800, H: 400, floorY: 380, S: .42 },
  });
  await expect.poll(() => out.find((m) => m.t === 'ready' || m.t === 'error')?.t).toBe('ready');
  send({ t: 'set', state: { roam: 'off' } });
  const root = frame.document.getElementById('root');
  const watch = new frame.MutationObserver(() => {});
  watch.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const tick = (draw = true) => {
    out.length = 0;
    send({ t: 'tick', dt: DT, draw });
    const err = out.find((m) => m.t === 'error');
    if (err) throw new Error(err.message);
    return { report: out.find((m) => m.t === 'frame'), writes: watch.takeRecords() };
  };
  const [shadow, petG, fxG] = root.querySelector('svg.kit').children;
  return { send, tick, shadow, petG, fxG };
}

describe('figure frame drawing', () => {
  it('moves a hidden body on without writing to its document, and draws it again once shown', async () => {
    const coo = await cooFrame();
    const from = coo.tick().report.layout;
    coo.send({ t: 'walk', x: 500, run: false, id: 'w1' });
    const events = [], writes = [];
    let layout = from;
    for (let i = 0; i < 15 / DT && !events.some((e) => e.kind === 'arrived'); i++) {
      const { report, writes: w } = coo.tick(false);
      events.push(...report.events);
      writes.push(...w);
      layout = report.layout;
    }
    expect(events).toContainEqual({ kind: 'arrived', detail: expect.objectContaining({ walkId: 'w1', x: 500 }) });
    expect(writes).toEqual([]);
    // the page reads where the body is from its layout, hidden or not
    expect(layout.box.x - from.box.x).toBeCloseTo(300, 0);
    expect(coo.tick().writes.length).toBeGreaterThan(0);
  });

});
