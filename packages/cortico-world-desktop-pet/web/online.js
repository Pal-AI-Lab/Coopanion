/**
 * Remote pets in the local pet stage. The World sends each peer's normalized x/y at 20 Hz, changes
 * to their skin, and each visual state or action once; this layer interpolates x and y between
 * samples and renders each peer with the local figure scale. A peer whose figure pack is not
 * installed falls back to Coo.
 */
import { loadBody } from './body-host.js';
import { normalizeSkin } from './coo/coo.js';

const INTERPOLATION_MS = 50;
const INTRO_STAGGER_MS = 350;
const INTRO_MAX_MS = 2400;
const ROAM_OFF = 1_000_000_000;
const queueMax = 12;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));
const skinKey = (skin) => JSON.stringify(skin);
const point = (player) => ({ x: clamp(player?.x ?? .5), y: clamp(player?.y ?? 0, -2, 2), dragging: player?.dragging === true });

/** One interpolated x/y sample; exported for the 20 Hz movement contract test. */
export function interpolatedPoint(from, to, progress) {
  const k = clamp(progress);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

/** A peer's normalized x/y on this client's current stage. */
export function stagePoint(position, bounds) {
  return {
    x: clamp(position?.x ?? .5) * bounds.W,
    y: bounds.floorY + clamp(position?.y ?? 0, -2, 2) * bounds.H,
  };
}

/** The bottom edge of a body's box: the point that stays on the same ground across player scales. */
export function boxBottomY(box) {
  return box.y + box.h;
}

/** Delay before each existing player drops in when someone joins a room. */
export function introDelayFor(index) {
  return Math.max(0, index) * INTRO_STAGGER_MS;
}

export function createOnlinePeers({ layer, bounds, theme, onError }) {
  const peers = new Map();
  let packsPromise = null;
  let disposed = false;
  let active = false;

  const packs = () => {
    packsPromise ??= fetch('/api/figures').then((res) => {
      if (!res.ok) throw new Error(`figures: HTTP ${res.status}`);
      return res.json();
    }).catch((err) => {
      packsPromise = null;
      throw err;
    });
    return packsPromise;
  };

  const remove = (id) => {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    if (peer.introTimer) clearTimeout(peer.introTimer);
    if (peer.introEndTimer) clearTimeout(peer.introEndTimer);
    if (peer.retryTimer) clearTimeout(peer.retryTimer);
    peer.body?.dispose();
    peer.body = null;
    peer.el?.remove();
  };

  const retry = (peer) => {
    if (disposed || !peers.has(peer.id) || peer.loading || peer.retryTimer) return;
    const delay = peer.retryDelay;
    peer.retryDelay = Math.min(5000, peer.retryDelay * 2);
    peer.retryTimer = setTimeout(() => {
      peer.retryTimer = null;
      if (!peer.body) void load(peer);
    }, delay);
  };

  const failed = (peer, err) => {
    if (peer.introEndTimer) clearTimeout(peer.introEndTimer);
    peer.introEndTimer = null;
    onError?.(err);
    peer.body?.dispose();
    peer.body = null;
    peer.el?.remove();
    peer.el = null;
    peer.nameEl = null;
    retry(peer);
  };

  const clear = () => {
    for (const id of [...peers.keys()]) remove(id);
  };

  const applySkin = async (peer) => {
    if (!peer.body) return;
    const skin = normalizeSkin({ ...peer.player.skin, figure: peer.packId });
    peer.body.set({ skin });
    if (peer.packId !== 'coo') await peer.body.setScheme(skin.scheme, { fade: .2 });
  };

  const applyBehavior = (peer, behavior) => {
    if (!behavior || typeof behavior !== 'object') return;
    if (behavior.kind === 'state' && typeof behavior.action === 'string') {
      peer.player = { ...peer.player, action: behavior.action };
    } else if (behavior.kind === 'interrupt') {
      peer.player = { ...peer.player, action: 'idle' };
    }
    if (!peer.body || peer.intro) {
      if (behavior.kind === 'state' || behavior.kind === 'action') {
        peer.queued = peer.queued.filter((item) => item.kind !== 'state' && item.kind !== 'action');
      }
      peer.queued.push(behavior);
      if (peer.queued.length > queueMax) peer.queued.shift();
      return;
    }
    if ((behavior.kind === 'state' || behavior.kind === 'action') && typeof behavior.action === 'string') {
      peer.body.visual?.({ action: behavior.action });
    } else if (behavior.kind === 'cue' && typeof behavior.cue === 'string') {
      peer.body.cue?.(behavior.cue);
    } else if (behavior.kind === 'interrupt') {
      peer.body.interrupt?.();
    }
  };

  const applyPlayerState = (peer) => {
    const action = typeof peer.player.action === 'string' ? peer.player.action : '';
    if (action) peer.body?.visual?.({ action });
    else if (peer.player.dragging) peer.body?.visual?.({ action: 'drag' });
  };

  const finishIntro = (peer) => {
    if (!peer.intro) return;
    peer.intro = false;
    if (peer.introEndTimer) clearTimeout(peer.introEndTimer);
    peer.introEndTimer = null;
    setTarget(peer, peer.player);
    applyPlayerState(peer);
    for (const behavior of peer.queued) applyBehavior(peer, behavior);
    peer.queued.length = 0;
  };

  const load = async (peer) => {
    if (peer.loading || disposed || !peers.has(peer.id)) return;
    peer.loading = true;
    let failedLoad = false;
    try {
      const all = await packs();
      if (disposed || !peers.has(peer.id)) return;
      const wanted = peer.player.skin?.figure;
      const pack = all.find((p) => p.id === wanted) ?? all.find((p) => p.id === 'coo');
      if (!pack) throw new Error('no figure pack');
      const skin = normalizeSkin({ ...peer.player.skin, ...(pack.id === wanted ? {} : { figure: pack.id }) });
      const at = point(peer.player);
      const stage = stagePoint(at, bounds());
      const el = document.createElement('div');
      el.className = 'online-figure';
      const name = document.createElement('span');
      name.className = 'online-name';
      name.textContent = peer.player.name;
      peer.el = el;
      peer.nameEl = name;
      peer.packId = pack.id;
      peer.requestedFigure = wanted;
      peer.skin = skin;
      peer.renderX = stage.x;
      peer.renderY = stage.y;
      peer.targetX = peer.renderX;
      peer.targetY = peer.renderY;
      layer.append(el);
      const body = await loadBody({
        layer: el,
        pack,
        theme: theme(),
        bounds: bounds(),
        start: { x: peer.renderX, facing: peer.player.facing === -1 ? -1 : 1, ...(peer.intro ? { enter: 'drop' } : {}), skin, scheme: skin.scheme },
        onEvent: (kind, detail) => {
          if (peer.intro && kind === 'mode' && ['idle', 'sit', 'sleep', 'look'].includes(detail.mode)) finishIntro(peer);
        },
        onError: (err) => failed(peer, err),
      });
      if (disposed || !peers.has(peer.id)) { body.dispose(); return; }
      body.set({ roam: 'off', hold: ROAM_OFF, bounds: bounds(), theme: theme() });
      peer.body = body;
      peer.retryDelay = 1000;
      el.append(name);
      if (peer.intro) {
        if (peer.introEndTimer) clearTimeout(peer.introEndTimer);
        peer.introEndTimer = setTimeout(() => finishIntro(peer), INTRO_MAX_MS);
      } else {
        applyPlayerState(peer);
        for (const behavior of peer.queued) applyBehavior(peer, behavior);
        peer.queued.length = 0;
      }
      await applySkin(peer);
    } catch (err) {
      failedLoad = true;
      peer.el?.remove();
      peer.el = null;
      peer.nameEl = null;
      onError?.(err);
    } finally {
      peer.loading = false;
      if (failedLoad) retry(peer);
    }
  };

  const setTarget = (peer, player, immediate = false) => {
    const at = point(player);
    const stage = stagePoint(at, bounds());
    peer.targetX = stage.x;
    peer.targetY = peer.intro && peer.renderY !== null ? peer.renderY : stage.y;
    if (immediate || peer.renderX === null) {
      peer.renderX = peer.targetX;
      peer.renderY = peer.targetY;
      peer.interp = 1;
    } else {
      peer.fromX = peer.renderX;
      peer.fromY = peer.renderY;
      peer.interp = 0;
    }
  };

  const upsert = (player, opts = {}) => {
    if (!player || typeof player.id !== 'string' || disposed) return;
    let peer = peers.get(player.id);
    if (!peer) {
      peer = {
        id: player.id,
        player,
        el: null,
        nameEl: null,
        body: null,
        packId: null,
        requestedFigure: null,
        skin: null,
        loading: false,
        queued: [],
        renderX: null,
        renderY: null,
        fromX: null,
        fromY: null,
        targetX: null,
        targetY: null,
        interp: 1,
        intro: opts.intro !== false,
        introTimer: null,
        introEndTimer: null,
        dragging: player.dragging === true,
        retryTimer: null,
        retryDelay: 1000,
        lostFrames: 0,
      };
      peers.set(player.id, peer);
      setTarget(peer, player, true);
      const delay = opts.introDelay ?? 0;
      if (delay > 0) peer.introTimer = setTimeout(() => { peer.introTimer = null; void load(peer); }, delay);
      else void load(peer);
      return;
    }
    const previousSkin = skinKey(peer.player.skin);
    const previousFigure = peer.requestedFigure;
    const previousName = peer.player.name;
    const previousAction = peer.player.action;
    peer.player = player;
    peer.dragging = player.dragging === true;
    peer.requestedFigure = player.skin?.figure ?? null;
    setTarget(peer, player);
    if (peer.nameEl && previousName !== player.name) peer.nameEl.textContent = player.name;
    if (peer.body && !peer.intro && previousAction !== player.action) applyPlayerState(peer);
    const nextSkin = skinKey(player.skin);
    if (previousSkin !== nextSkin || (previousFigure !== peer.requestedFigure && peer.body)) {
      if (previousFigure === peer.requestedFigure) void applySkin(peer);
      else {
        peer.body?.dispose();
        peer.body = null;
        peer.el?.remove();
        peer.el = null;
        peer.nameEl = null;
        void load(peer);
      }
    }
  };

  const setState = (state) => {
    if (!state?.active) { active = false; clear(); return; }
    const entering = !active;
    active = true;
    const keep = new Set();
    const players = Array.isArray(state.players) ? state.players : [];
    for (const [index, player] of players.entries()) {
      if (!player || typeof player.id !== 'string') continue;
      keep.add(player.id);
      upsert(player, entering ? { introDelay: introDelayFor(index) } : {});
    }
    for (const id of [...peers.keys()]) if (!keep.has(id)) remove(id);
  };

  const tick = (dt) => {
    if (disposed) return;
    const { W } = bounds();
    const step = dt * 1000 / INTERPOLATION_MS;
    for (const peer of peers.values()) {
      if (peer.body && !peer.body.alive) {
        peer.body = null;
        peer.el?.remove();
        peer.el = null;
        peer.nameEl = null;
        retry(peer);
        continue;
      }
      if (peer.interp < 1) {
        peer.interp = Math.min(1, peer.interp + step);
        const next = interpolatedPoint({ x: peer.fromX, y: peer.fromY }, { x: peer.targetX, y: peer.targetY }, peer.interp);
        peer.renderX = next.x;
        peer.renderY = next.y;
      }
      if (!peer.body) continue;
      peer.body.tick(dt);
      peer.body.place(peer.renderX, peer.player.facing === -1 ? -1 : 1);
      const box = peer.body.layout?.box;
      if (!peer.intro && (!box || box.w <= 0 || box.h <= 0)) peer.lostFrames++;
      else peer.lostFrames = 0;
      if (peer.lostFrames >= 4) {
        peer.body.interrupt?.();
        peer.body.visual?.({ action: 'idle' });
        peer.body.place(peer.renderX, peer.player.facing === -1 ? -1 : 1);
        peer.lostFrames = 0;
      }
      if (box && peer.el) {
        const layer = peer.body.layout;
        const offsetX = layer ? peer.renderX - layer.x : 0;
        const bottom = boxBottomY(box);
        const offsetY = peer.intro ? 0 : peer.renderY - bottom;
        peer.el.style.transform = `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px)`;
      }
      if (box && peer.nameEl) {
        const offsetX = peer.body.layout ? peer.renderX - peer.body.layout.x : 0;
        peer.nameEl.style.left = `${Math.max(8, Math.min(W - 8, peer.renderX - offsetX)).toFixed(1)}px`;
        peer.nameEl.style.top = `${Math.max(2, box.y - 22).toFixed(1)}px`;
      }
    }
  };

  const resize = () => {
    const size = bounds();
    for (const peer of peers.values()) {
      peer.body?.set({ bounds: size });
      setTarget(peer, peer.player);
    }
  };

  const setTheme = () => {
    for (const peer of peers.values()) peer.body?.set({ theme: theme() });
  };

  return {
    setState,
    upsert,
    remove,
    behavior(id, behavior) {
      const peer = peers.get(id);
      if (peer) applyBehavior(peer, behavior);
    },
    tick,
    resize,
    setTheme,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
