/**
 * The page's side of a figure pack's body (Coo's too): the pack's code runs inside a sandboxed frame
 * (`/figure-frame`, figure-frame.js) that fills `layer`, laid over the page's stage under its bubbles
 * and buttons. The page drives it once a frame (`tick`), forwards the pointer, asks it to do things,
 * and reads back where it is (`layout`), what happened to it (`onEvent`) and what it wants heard
 * (`onSound`).
 *
 * The pack's code is not trusted, so the page holds the line here:
 * - the body's box is kept inside the stage and to the most the kit itself ever stretches a body
 *   (BOX_MAX), and only its hit circles inside that box take the pointer: a pack cannot spread
 *   its clickable area over the screen and swallow clicks meant for the windows underneath;
 * - a touch (poke, pat, pick-up, throw) counts only right after the page passed it pointer input
 *   (TOUCH_MS), and a crash only after a throw: a pack cannot make up touches that wake the bot;
 * - the bubble's spot and the hover buttons' point stay on the stage.
 *
 * `onError(err)` is called when the pack's code fails after it was ready; before that the returned
 * promise rejects. Either way the frame is gone.
 */
import { language, t } from './i18n.js';

/** A pack that has not drawn its first frame by then is taken as broken: its scripts or textures did not load. */
const READY_MS = 20_000;
/**
 * The longest side of a body's box, in 256-unit squares at the body's scale: the kit squashes a body up to 1.33
 * wide and stretches it to 1.5 tall (squash, drag stretch and breath together), and a box turned any way grows by √2.
 */
const BOX_MAX = 1.5 * Math.SQRT2;
/**
 * How long after the page passed pointer input a body may report a touch. The body answers in the frame after the
 * input, a few tens of milliseconds at the resting frame rate; a second covers a frame held up by a stalled page.
 */
const TOUCH_MS = 1000;
const TOUCHES = new Set(['poke', 'pet', 'grab', 'drop', 'throw', 'crash']);

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));

/** A body's layout report as the page takes it (`size`: the stage, { W, H, S }): numbers where numbers belong, and the limits above. */
export function readLayout(l, size) {
  if (!l || typeof l !== 'object') return null;
  const { W, H, S } = size, side = 256 * S * BOX_MAX;
  const b = l.box ?? {};
  const w = clampTo(num(b.w), 0, side), h = clampTo(num(b.h), 0, side);
  const x0 = clampTo(num(b.x), -w, W), y0 = clampTo(num(b.y), -h, H);
  const box = { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(W, x0 + w) - Math.max(0, x0), h: Math.min(H, y0 + h) - Math.max(0, y0) };
  const pt = (p) => ({ x: clampTo(num(p?.x), 0, W), y: clampTo(num(p?.y), 0, H) });
  return {
    x: clampTo(num(l.x, W / 2), 0, W), facing: l.facing === -1 ? -1 : 1, mode: typeof l.mode === 'string' ? l.mode.slice(0, 32) : 'idle',
    busy: !!l.busy, moving: !!l.moving, pressing: !!l.pressing,
    cursor: l.cursor === 'grab' || l.cursor === 'grabbing' ? l.cursor : '',
    box,
    hit: (Array.isArray(l.hit) ? l.hit : []).map((c) => ({ x: num(c?.x), y: num(c?.y), r: Math.max(0, num(c?.r)) })),
    bubble: pt(l.bubble), side: { ...pt(l.side), reach: clampTo(num(l.side?.reach), 0, side / 2) },
  };
}

/** Whether stage point `p` is on a body with `layout` (readLayout's): in its box and in one of its hit circles. */
export function onBody(layout, p) {
  const b = layout?.box;
  if (!b || p.x < b.x || p.y < b.y || p.x > b.x + b.w || p.y > b.y + b.h) return false;
  return layout.hit.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
}

/**
 * Which touches a body reports are taken: `input(now)` when the page passes it pointer input, `take(kind, now)`
 * for each touch it reports (ms clock).
 */
export function touchGate() {
  let inputAt = -Infinity, thrown = false;
  return {
    input(now) { inputAt = now; },
    take(kind, now) {
      if (!TOUCHES.has(kind)) return false;
      if (kind === 'crash' ? !thrown : now - inputAt > TOUCH_MS) return false;
      thrown = kind === 'throw';
      return true;
    },
  };
}

/**
 * `scheme` as `pack` knows it: one of its presets, else each axis's option in it, the axis's first where it names
 * one the pack does not have (an update of the pack took it away). The pack's own code only ever gets these.
 */
export function knownScheme(pack, scheme) {
  if (pack.presets.some((p) => p.id === scheme)) return scheme;
  const parts = String(scheme ?? '').split('-');
  return pack.axes.map((a, i) => (a.options.some((o) => o.id === parts[i]) ? parts[i] : a.options[0].id)).join('-');
}

/**
 * `pack`: the entry of `/api/figures`; `start`: { x, facing, enter, skin }; `bounds`: { W, H, floorY, S };
 * `theme`: 'dark' | 'light'. Resolves to the body once it is ready.
 */
export function loadBody({ layer, pack, start, theme, bounds, onEvent, onSound, onError }) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.className = 'figure-frame';
    frame.src = '/figure-frame';
    let ready = false, gone = false, seq = 0, size = bounds;
    let layout = null, z = null, words = null;
    const touches = touchGate();
    const waits = new Map();
    const post = (m) => { if (!gone) frame.contentWindow?.postMessage(m, '*'); };
    const timer = setTimeout(() => fail(new Error(t('figure.notReady', { seconds: READY_MS / 1000 }))), READY_MS);

    function close() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      frame.remove();
      for (const done of waits.values()) done();
      waits.clear();
    }
    function fail(err) {
      if (gone) return;
      close();
      if (ready) onError?.(err); else reject(err);
    }

    const body = {
      pack: pack.id,
      get layout() { return layout; },
      get z() { return z; },
      /** The words of the pack's vocabulary its body said it knows, or null when it did not say. */
      get words() { return words; },
      /** Whether stage point `p` is on the body. */
      hit: (p) => onBody(layout, p),
      tick(dt) { if (ready) post({ t: 'tick', dt }); },
      do: (word) => post({ t: 'do', word }),
      walk: (x, run, id) => post({ t: 'walk', x, run, id }),
      stopWalk: (id) => post({ t: 'stop-walk', id }),
      /** `type`: down, move, up, cancel, leave; `p` in stage pixels with `t` (ms). */
      pointer(type, p) { if (type !== 'leave') touches.input(performance.now()); post({ t: 'pointer', type, p }); },
      drop(p) { touches.input(performance.now()); post({ t: 'drop', p }); },
      shift: (dx, dy) => post({ t: 'shift', dx, dy }),
      place: (x, facing) => post({ t: 'place', x, facing }),
      /** The page's states (see the kit's `set`), and `bounds` when the stage changed size. */
      set(state) { if (state.bounds) size = state.bounds; post({ t: 'set', state }); },
      cue: (kind) => post({ t: 'cue', kind }),
      talk: () => post({ t: 'talk' }),
      setScheme(id, o = {}) {
        if (gone) return Promise.resolve();
        const s = ++seq;
        post({ t: 'scheme', id: knownScheme(pack, id), fade: o.fade ?? 0, seq: s });
        return new Promise((done) => waits.set(s, done));
      },
      /** The light halo behind the body (pet-app's backdrop), as a CSS filter on the frame: 0 removes it. */
      setHalo(k) {
        const c = `rgba(184,184,184,${k.toFixed(2)})`;
        frame.style.filter = k ? `drop-shadow(0 0 3px ${c}) drop-shadow(0 0 7px ${c})` : '';
      },
      dispose: close,
    };

    async function onMessage(e) {
      if (e.source !== frame.contentWindow) return;
      const m = e.data || {};
      if (m.t === 'loaded' && !ready) {
        try {
          const model = pack.model ? await (await fetch(new URL(pack.base + pack.model, location.href))).json() : null;
          post({
            t: 'init', entry: new URL(pack.base + pack.entry, location.href).href, export: pack.export,
            base: new URL(pack.base, location.href).href, model, scheme: knownScheme(pack, start.scheme), start: { x: start.x, facing: start.facing, enter: start.enter, skin: start.skin }, theme, bounds: size,
            language: language(),
          });
        } catch (err) { fail(err); }
      } else if (m.t === 'ready' && !ready) {
        ready = true;
        clearTimeout(timer);
        z = typeof m.z === 'string' ? m.z : null;
        // only the manifest's words matter, and the list goes on to the World
        if (Array.isArray(m.words)) words = pack.vocab.map((w) => w.id).filter((id) => m.words.includes(id));
        resolve(body);
      } else if (m.t === 'frame' && ready) {
        layout = readLayout(m.layout, size);
        z = typeof m.z === 'string' ? m.z : null;
        for (const s of Array.isArray(m.sounds) ? m.sounds : []) {
          if (typeof s?.name === 'string') onSound?.(s.name.slice(0, 64), typeof s.kind === 'string' ? s.kind : '', ...(Array.isArray(s.args) ? s.args.filter((a) => typeof a === 'number' || typeof a === 'boolean') : []));
        }
        for (const ev of Array.isArray(m.events) ? m.events : []) {
          if (!ev || typeof ev.kind !== 'string') continue;
          const d = ev.detail && typeof ev.detail === 'object' ? ev.detail : {};
          // a touch only right after real pointer input, a crash only after a throw
          if (ev.kind === 'touch' && !touches.take(d.kind, performance.now())) continue;
          onEvent?.(ev.kind, d);
        }
      } else if (m.t === 'scheme') {
        z = typeof m.z === 'string' ? m.z : null;
        waits.get(m.seq)?.();
        waits.delete(m.seq);
      } else if (m.t === 'error') {
        fail(new Error(m.message));
      }
    }
    addEventListener('message', onMessage);
    layer.appendChild(frame);
  });
}
