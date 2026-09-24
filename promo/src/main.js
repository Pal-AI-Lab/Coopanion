/**
 * CortiCompanion promo, 1920×1080, cut to the soundtrack's bar grid (155 BPM). Sections of the
 * track, in bars: intro 1–17, break 17–25, build-up 25–33, drop 33–49, breakdown 49–65. The
 * decorative features take the intro and the break, setup takes the build-up, the interactive
 * features land on the drop, and extensions and the end card take the breakdown.
 *
 * Everything on screen is a function of the timeline position `t`. The hero pet is the real pet
 * from pet-core, stepped at a fixed 1/120 s with a seeded Math.random and a virtual
 * performance.now. Timed orders and position triggers drive it, and the intro's follow camera
 * is stepped with it; seeking backwards replays from zero. `window.promo.renderAt(t)` is what the
 * recorder calls frame by frame.
 */
import { createPet, figure, FACES, STAND, heartD, skinCss, skinVars, normalizeSkin, wear } from '../../packages/cortico-world-desktop-pet/web/pet-core.js';
import { AUDIO_START, BEAT, bar, beat, bump, clamp01, ease, h, lerp, rng, seg, svgEl, f1 } from './util.js';
import { createArcs } from './arcs.js';
import { Bubble, Caption, Chip, Cursor } from './widgets.js';
import { Wordmark } from './wordmark.js';
import { busInto, createVoices, renderTrack } from './sfx.js';

export const SOUNDTRACK = { file: 'assets/bgm.mp3', title: '花卷Jwyan - 可爱鲈鱼' };
/** Balance of the music and the sound effects, for the live preview and the recording alike: the main hits (90th
 * percentile of 50 ms loudness, about -20 dBFS) sit some 4 dB under the music (about -16 dBFS), babble and keys lower. */
const MIX = { music: .7, sfx: 2 };
/** The promo ends at 1:32, a few seconds into the end card, fading out over END_FADE seconds (picture to black, music to silence). */
const W = 1920, H = 1080, DURATION = 92, END_FADE = 1.5, STEP = 1 / 120;
const params = new URLSearchParams(location.search);
const RECORD = params.has('record');

/* ---------- timeline (bars of the soundtrack) ---------- */
const T = {
  intro: [0, bar(5)],
  title: [bar(5), bar(7)],
  faces: [bar(7), bar(11)],
  dress: [bar(11), bar(17)],
  stroll: [bar(17), bar(25)],
  steps: [bar(25), bar(33)],
  say: [bar(33), bar(36)],
  voice: [bar(36), bar(40)],
  ask: [bar(40), bar(43)],
  cua: [bar(43), bar(49)],
  ext: [bar(49), bar(55)],
  outro: [bar(55), DURATION + 1],
};
const CUTS = [T.faces, T.dress, T.stroll, T.steps, T.say, T.voice, T.ask, T.cua, T.ext, T.outro].map((r) => r[0]);
const surgeAt = (t) => Math.max(0, ...CUTS.map((c) => bump(t, c, .8))) * .8;
// rotation clock for the background arcs: speed rises with the surge and is integrated, so the arcs never jump
const TRAVEL = (() => {
  const dt = 1 / 60, n = Math.ceil((DURATION + 2) / dt), a = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) a[i] = a[i - 1] + dt * (1 + 1.2 * surgeAt((i - .5) * dt));
  return (t) => { const x = Math.max(0, t) / dt, i = Math.min(n - 1, Math.floor(x)); return lerp(a[i], a[i + 1], x - i); };
})();

/* ---------- stage: background and world under one camera, overlays above both ---------- */
const stage = document.getElementById('stage');
// the pet's skin stylesheet has dark-mode rules; the promo is always light
stage.dataset.theme = 'light';
const skinStyle = h('style');
document.head.appendChild(skinStyle);
const layer = (parent, cls = '') => { const d = h('div', `layer fill ${cls}`); parent.appendChild(d); return d; };
const bg = layer(stage);
layer(bg).id = 'dots';
const bgSvg = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
layer(bg).appendChild(bgSvg);
const arcs = createArcs(bgSvg);
const world = layer(stage);
const scenes = layer(world);
const petSvg = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
const petWrap = layer(world); petWrap.appendChild(petSvg);
const shadowEl = svgEl('ellipse', { class: 'shadow' }); petSvg.appendChild(shadowEl);
const petG = svgEl('g'); petSvg.appendChild(petG);
const fxG = svgEl('g'); petSvg.appendChild(fxG);
const heartG = svgEl('g'); petSvg.appendChild(heartG);
const bonkG = svgEl('g'); petSvg.appendChild(bonkG);
const bubbleLayer = layer(world);
const trail = h('div', 'trail', '<i></i><i></i><i></i>'); trail.hidden = true; bubbleLayer.appendChild(trail);
const bubble = new Bubble(bubbleLayer, trail);
const bubble2 = new Bubble(bubbleLayer, null);
const top = layer(world);
const signature = h('div', 'signature', 'by @Pal AI Lab 0 0)');
stage.appendChild(signature);
const endFade = h('div', 'layer fill endfade');
stage.appendChild(endFade);
const NOTE = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M9 17.5V5l11-2v12.5" fill="none" stroke="#00A870" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="3" fill="#00A870"/><circle cx="17.5" cy="15.5" r="3" fill="#00A870"/></svg>';
const nowPlaying = h('div', 'now-playing', `${NOTE}<span>${SOUNDTRACK.title}</span>`);
stage.appendChild(nowPlaying);

function sceneLayer(range) {
  const el = h('div', 'scene');
  scenes.appendChild(el);
  return { el, range };
}
/** Scene fade/slide; returns its visibility (0 when hidden). */
function showScene(s, t, slide = 70) {
  const [a, b] = s.range;
  const k = seg(t, a - .12, a + .35), o = seg(t, b - .28, b + .06);
  const on = k > 0 && o < 1;
  s.el.style.display = on ? '' : 'none';
  if (!on) return 0;
  const v = Math.min(k, 1 - o);
  s.el.style.opacity = String(f1(v * 100) / 100);
  s.el.style.transform = `translateX(${f1((1 - ease.outCubic(k)) * slide - ease.inCubic(o) * slide)}px)`;
  return v;
}
const TASKBAR = '<span class="app on"></span><span class="app cal"></span><span class="app"></span><span class="app"></span><span class="grow"></span><span>中</span><span class="clk">20:26</span>';

/* ---------- hero pet: floors, size, jumps ---------- */
const GRAVITY = 2300, CROUCH = .16; // pet-core's air physics and crouch before takeoff
const INTRO = { S: .85, ground: 880, box: { l: 560, r: 760, top: 810 }, wall: { l: 1060, w: 110, top: 470 } };
const DESK = 1008, CARD_TOP = 400;
// where the cursor sets the pet down under the title: on the taskbar
const PLACE = { x: 960, floor: DESK, S: 1.1 };
const PLACE_Y = PLACE.floor - 220 * PLACE.S - 25; // the scruff, with the feet a little above the floor
const STROLL = { x: 360, to: 620, S: .8 };

/** Takeoff velocity and flight time from (x0, y0) to (x1, y1), apex `h` above the higher end; vx decays at 0.4/s in the air. */
function flight(x0, y0, x1, y1, h) {
  const apex = Math.min(y0, y1) - h;
  const vy = Math.sqrt(2 * GRAVITY * (y0 - apex));
  const tf = vy / GRAVITY + Math.sqrt(2 * (y1 - apex) / GRAVITY);
  return { vy, vx: (x1 - x0) * .4 / (1 - Math.exp(-.4 * tf)), tf };
}

/** Standing jumps between scenes: takeoff order at `at`, size eases from S[0] to S[1] over the flight. */
const LEAPS = [
  { at: bar(7), x0: 960, y0: PLACE.floor, x1: 960, y1: 860, h: 50, S: [PLACE.S, 1.35] },
  { at: bar(11), x0: 960, y0: 860, x1: 960, y1: 860, h: 60, S: [1.35, 1.3] },
  { at: bar(25), x0: STROLL.to, y0: DESK, x1: 400, y1: CARD_TOP, h: 90, S: [STROLL.S, .7] },
  { at: bar(27.5) - .3, x0: 400, y0: CARD_TOP, x1: 960, y1: CARD_TOP, h: 60, S: [.7, .7] },
  { at: bar(29.5) - .3, x0: 960, y0: CARD_TOP, x1: 1520, y1: CARD_TOP, h: 60, S: [.7, .7] },
  { at: bar(33), x0: 1520, y0: CARD_TOP, x1: 560, y1: 860, h: 60, S: [.7, 1.1] },
  { at: bar(36), x0: 560, y0: 860, x1: 1360, y1: 860, h: 110, S: [1.1, 1.1] },
  { at: bar(40), x0: 1360, y0: 860, x1: 560, y1: 860, h: 110, S: [1.1, 1.1] },
  { at: bar(43), x0: 560, y0: 860, x1: 560, y1: DESK, h: 40, S: [1.1, .62] },
  { at: bar(49), x0: 560, y0: DESK, x1: 960, y1: 640, h: 90, S: [.62, .95] },
  { at: bar(55), x0: 960, y0: 640, x1: 960, y1: 480, h: 70, S: [.95, 1.15] },
];
LEAPS.forEach((l) => { l.lands = l.at + CROUCH + flight(l.x0, l.y0, l.x1, l.y1, l.h).tf; });
const [, , TO_CARD1, TO_CARD2, TO_CARD3] = LEAPS;

/** The cursor that picks the dizzy pet up at the end of the intro and sets it down under the title. */
const GRAB = { in: 4.0, grab: bar(4), lift: bar(4) + .2, place: 6.05, release: 6.2 };
/** The cursor that pokes the dozing pet awake in the stroll scene. */
// about half a bar after it lies down, so the Mac morning after the poke gets time on screen
const POKE_BAR = bar(22.25);
const POKE = { in: POKE_BAR - .1, down: POKE_BAR + .9, up: POKE_BAR + 1.03, out: POKE_BAR + 1.6 };
/** The stroll scene's evening: dark from `dusk` to `dark` after the walk, the pet dozes off in it, the poke brings the light back. */
const NIGHT = { dusk: bar(20) + .3, dark: bar(21) + .1, dawn: POKE.down, day: POKE.down + .35 };

const S_KEYS = [
  [0, INTRO.S], [GRAB.lift, INTRO.S], [GRAB.place, PLACE.S],
  [bar(17) - .12, 1.3], [bar(17) - .08, STROLL.S],
  ...LEAPS.flatMap((l) => [[l.at, l.S[0]], [l.lands, l.S[1]]]),
].sort((a, b) => a[0] - b[0]);
function heroS(t) {
  if (t <= S_KEYS[0][0]) return S_KEYS[0][1];
  for (let i = 1; i < S_KEYS.length; i++) {
    const [t1, s1] = S_KEYS[i];
    if (t <= t1) { const [t0, s0] = S_KEYS[i - 1]; return lerp(s0, s1, ease.inOutCubic(seg(t, t0, t1))); }
  }
  return S_KEYS[S_KEYS.length - 1][1];
}

// the pet's sound calls go into petCues while the cue list is collected (see collectCues), and nowhere otherwise
let petCues = null;
const petSfx = new Proxy({}, { get: (_, k) => (k === 'isOn' ? () => false : (...a) => { petCues?.push([simT, k, ...a]); }) });
const hero = { floor: INTRO.ground, S: INTRO.S, obstacles: true, pendingFloor: null };
let ctl = null, simT = 0, rand = rng(7), nextEvent = 0, skin = normalizeSkin(null), D = null, optKeys = null;
Math.random = () => rand();
performance.now = () => simT * 1000;

function floorAt(x) {
  const b = INTRO.box;
  return hero.obstacles && x > b.l - 6 && x < b.r + 6 ? b.top : hero.floor;
}
/** Standing jump to land at (x1, y1); the new floor takes effect once airborne. */
function leap(c, x1, y1, hgt) {
  const f = flight(c.pet.x, c.pet.fy, x1, y1, hgt);
  if (!c.act('jump')) return;
  c.pet.jumpV = f.vy; c.pet.jumpVx = f.vx;
  if (Math.abs(x1 - c.pet.x) > 2) c.pet.facing = Math.sign(x1 - c.pet.x);
  hero.pendingFloor = y1;
}
/** Running jump: takes off at once, keeping the stride. */
function spring(c, x1, y1, hgt) {
  const p = c.pet, f = flight(p.x, p.fy, x1, y1, hgt);
  Object.assign(p, { mode: 'air', modeT: 0, vy: -f.vy, vx: f.vx, airKind: 'jump' });
  p.sqv -= 2.2;
  hero.pendingFloor = y1;
}
/** Puts the pet in the air above x, falling onto `floor`. */
function dropIn(c, x, floor) {
  Object.assign(c.pet, { x, fy: -80, vx: 0, vy: 0, mode: 'air', modeT: 0, airKind: 'jump', facing: 1 });
  hero.floor = floor;
}
function applySkin(s) { skin = s; ctl?.setSkin(s); skinStyle.textContent = skinCss(s, '#stage'); }

/* intro: run in, a running jump onto the box, a second one at the wall, bump, sit dizzy, get picked up */
function directIntro(c) {
  const p = c.pet, note = (what) => D.trace.push([Math.round(simT * 1000) / 1000, what, Math.round(p.x), Math.round(p.fy)]);
  switch (D.stage) {
    case 0: if (simT >= .28) { c.walkTo(1700, true); D.stage = 1; note('run'); } break;
    case 1: if (p.mode === 'run' && p.x >= 470) { spring(c, 650, INTRO.box.top, 50); D.stage = 2; note('jump onto box'); } break;
    case 2: if (p.mode === 'land') { c.walkTo(1700, true); p.modeT = .35; D.stage = 3; note('run on box'); } break;
    case 3: if (p.mode === 'run' && p.x >= 715) { spring(c, 1200, INTRO.ground, 120); D.stage = 4; note('jump at wall'); } break;
    case 4: {
      const front = INTRO.wall.l - 84 * hero.S;
      if (D.bonkAt == null && p.mode === 'air' && p.x > front && p.fy > INTRO.wall.top) {
        p.x = front; p.vx = -220; p.vy = Math.max(p.vy, -40); p.sqv += 2.8;
        p.expr = 'surprised'; p.exprUntil = simT + .6;
        D.bonkAt = simT; D.bonkY = p.fy - 150 * hero.S; note('bump');
        petCues?.push([simT, 'thud']);
      }
      if (D.bonkAt != null && p.mode !== 'air') { c.act('dizzy'); D.stage = 5; note('dizzy'); }
      break;
    }
    case 5: if (simT >= GRAB.in - .02) {
      const head = c.toStage(128, 64);
      D.grabKeys = [[GRAB.in, head.x + 420, head.y - 330], [GRAB.grab - .14, head.x, head.y], [GRAB.grab, head.x, head.y], [GRAB.lift + .15, head.x + 10, head.y - 110],
        [GRAB.place, PLACE.x, PLACE_Y], [GRAB.release, PLACE.x, PLACE_Y], [GRAB.release + .6, 1160, 500]];
      D.stage = 6; note('cursor');
    } break;
  }
  if (D.grabKeys && simT >= GRAB.in - .1 && simT < GRAB.release + .7) {
    const pt = Cursor.pos(D.grabKeys, simT);
    if (simT >= GRAB.grab && !D.down && simT < GRAB.release) {
      c.pointerDown(pt); D.down = true;
      hero.obstacles = false; note('grab');
    }
    // the floor under the title takes over once the pet hangs clear of the old one
    if (simT >= GRAB.lift + .3) hero.floor = PLACE.floor;
    c.pointerMove(pt);
    if (simT >= GRAB.release && D.down) { c.pointerUp(); D.down = false; note('release'); }
  }
  if (D.grabKeys && simT >= GRAB.release + .7 && !D.left) { c.pointerLeave(); D.left = true; }
}
/* stroll: a click on the dozing pet */
function directPoke(c) {
  if (!D.pokeKeys && simT >= POKE.in - .02) {
    const head = c.toStage(128, 110);
    D.pokeKeys = [[POKE.in, head.x + 480, head.y - 260], [POKE.down - .1, head.x, head.y], [POKE.out, head.x + 60, head.y - 40]];
  }
  if (!D.pokeKeys || simT > POKE.out) return;
  const pt = Cursor.pos(D.pokeKeys, simT);
  c.pointerMove(pt);
  if (simT >= POKE.down && !D.poked) { c.pointerDown(pt); D.poked = 1; }
  if (simT >= POKE.up && D.poked === 1) { c.pointerUp(); D.poked = 2; }
  if (simT >= POKE.out - .02 && D.poked === 2) { c.pointerLeave(); D.poked = 3; }
}

/* ---------- intro camera: zoomed in, still until the pet runs in, then following it; opens to the full stage for the title ---------- */
const CAM_Z = 1.75, CAM_W = 6, CAM_X0 = 820, LOOK = 330;
const camZ = (t) => lerp(CAM_Z, 1, ease.inOutCubic(seg(t, GRAB.lift, GRAB.place + .15)));
function camStep(c, dt) {
  const p = c.pet, drag = p.mode === 'drag';
  const moving = p.mode === 'run' || p.mode === 'air' || p.mode === 'land';
  const tx = drag ? p.dx : Math.max(CAM_X0, p.x + (moving ? p.facing * LOOK : 0));
  const ty = drag ? p.dy + 110 * hero.S : Math.min(p.fy, INTRO.ground) - 190 * hero.S;
  const k = CAM_W * CAM_W * dt, d = 2 * CAM_W * dt;
  D.cam.vx += (tx - D.cam.x) * k - D.cam.vx * d; D.cam.x += D.cam.vx * dt;
  D.cam.vy += (ty - D.cam.y) * k - D.cam.vy * d; D.cam.y += D.cam.vy * dt;
}
/** View centre and zoom at t: the followed point blended to the stage centre as the zoom opens, kept inside the stage. */
function camera(t) {
  const z = camZ(t);
  if (z <= 1.0001) return { x: W / 2, y: H / 2, z: 1 };
  const open = (CAM_Z - z) / (CAM_Z - 1);
  const hw = W / 2 / z, hh = H / 2 / z;
  const x = Math.min(W - hw, Math.max(hw, lerp(D.cam.x, W / 2, open)));
  const y = Math.min(H - hh, Math.max(hh, lerp(D.cam.y, H / 2, open)));
  return { x, y, z };
}
function applyCamera(t) {
  const { x, y, z } = camera(t);
  world.style.transform = z === 1 ? '' : `translate(${f1(W / 2 - x * z)}px, ${f1(H / 2 - y * z)}px) scale(${z.toFixed(4)})`;
  // the background moves at a third of the camera
  const zb = 1 + (z - 1) * .35, xb = W / 2 + (x - W / 2) * .35, yb = H / 2 + (y - H / 2) * .35;
  bg.style.transform = z === 1 ? '' : `translate(${f1(W / 2 - xb * zb)}px, ${f1(H / 2 - yb * zb)}px) scale(${zb.toFixed(4)})`;
}

/* ---------- orders for the hero ---------- */
const FACE_SEQ = ['happy', 'wink', 'love', 'shy', 'surprised', 'angry', 'sad', 'sleepy'];
// kaomoji with the face's outline on the right, as in the signature
const KAO = { happy: '^ ^)', wink: '^ 0)', love: '♡ ♡)', shy: '* o o)', surprised: 'O O)', angry: 'ò ó)', sad: 'ó ò)', sleepy: '- -)', thinking: '· ·)' };
// faces and outfits both change every beat and a half
const EVERY = 1.5 * BEAT;
const FACE_AT = (i) => beat(30) + i * EVERY;
const OUTFIT_AT = beat(46);
const SAY = [['你已经坐了一个小时啦。', bar(33) + 1.15, bar(34) + 1.3], ['要不要站起来伸个懒腰?', bar(34) + 1.45, bar(36) - .15]];
const HEARD = { text: '帮我记一下,周五下午三点项目评审', start: bar(36) + 1.0, final: bar(37) + 1.35, end: bar(37) + 1.8 };
const REPLY = ['好,记到日程里。', HEARD.end + .1, bar(40) - .15];
const ASK = { q: '周末想做点什么?', options: ['去公园散步', '在家看部电影', '一起打游戏'], start: bar(40) + .8, cursorIn: bar(41) + .3, choose: bar(42) + .1, chosen: 2, end: bar(43) - .2 };
const C0 = bar(43);
const CUA = {
  win: C0 + .75,
  // the pet's own cursor rests on the time field while the user moves, then goes to Save
  keys: [[C0 + .85, 640, 860], [C0 + 1.55, 1000, 468], [C0 + 2.8, 1000, 468], [C0 + 2.95, 1000, 612], [C0 + 7.0, 1000, 612], [C0 + 7.45, 1520, 724], [T.cua[1], 1520, 724]],
  clicks: [C0 + 1.65, C0 + 2.95, C0 + 7.55],
  f1: [['项目评审', C0 + 1.75, C0 + 2.55]],
  f2: [['周五', C0 + 3.05, C0 + 3.35], [' 15:00', C0 + 6.35, C0 + 6.95]],
  userKeys: [[C0 + 3.45, 1900, 1050], [C0 + 4.1, 1500, 900], [C0 + 4.6, 1560, 860], [C0 + 5.1, 1470, 880], [C0 + 5.5, 1530, 840], [C0 + 6.1, 1900, 1070]],
  stop: [C0 + 3.75, C0 + 6.2],
  done: C0 + 7.85,
};
const EVENTS = [
  [GRAB.release + .6, (c) => { c.pet.facing = 1; c.setExpr('happy', 2.2); }],
  ...LEAPS.map((l) => [l.at, (c) => leap(c, l.x1, l.y1, l.h)]),
  ...FACE_SEQ.map((n, i) => [FACE_AT(i) + .02, (c) => c.setExpr(n, EVERY * .95)]),
  [bar(17) - .08, (c) => dropIn(c, STROLL.x, DESK)],
  [bar(17) + 1.2, (c) => c.walkTo(STROLL.to, false)],
  [bar(20) + .3, (c) => c.act('look')],
  [NIGHT.dark, (c) => c.setExpr('sleepy', 1.6)],
  [bar(21) + 1.3, (c) => c.act('sit')],
  [bar(22) + .1, (c) => c.act('sleep')],
  [bar(24) + .9, (c) => c.act('hop')],
  [TO_CARD3.lands + .3, (c) => c.setExpr('happy')],
  [SAY[0][1] + .1, (c) => c.setExpr('happy')],
  [SAY[1][1] + .4, (c) => c.act('nod')],
  [SAY[1][2] - .5, (c) => c.setExpr('wink')],
  [bar(36) + .8, (c) => { c.pet.facing = -1; c.setListening(true); }],
  [HEARD.final + .05, (c) => { c.setListening(false); c.act('hop'); }],
  [HEARD.final + .6, (c) => c.setExpr('happy')],
  [bar(40) + .75, (c) => { c.pet.facing = 1; }],
  [ASK.choose + .1, (c) => c.setExpr('love')],
  [bar(43) + .7, (c) => { c.pet.facing = 1; c.setThinking(true); }],
  [CUA.stop[0], (c) => { c.setThinking(false); c.setExpr('surprised', .8); }],
  [CUA.stop[0] + .9, (c) => c.setThinking(true)],
  [CUA.done, (c) => { c.setThinking(false); c.setExpr('happy'); }],
  [bar(49) + 1.1, (c) => c.setExpr('happy')],
  [bar(53), (c) => c.act('spin')],
  [bar(57), (c) => c.act('hop')],
  [bar(59), (c) => c.act('jump')],
  [bar(59) + .95, (c) => c.setExpr('love')],
  [bar(61), (c) => c.act('spin')],
  [bar(63), (c) => c.act('hop')],
  [bar(64), (c) => c.setExpr('happy', 6)],
].sort((a, b) => a[0] - b[0]);

const PAL_NAMES = { mint: '薄荷绿', mono: '单色', navigator: '领航员', claude: '克劳德', fox: '红狐狸', purple: '虚式茈', lemon: '柠檬黄' };
/** Outfits for the dressing montage, one every EVERY; the palette grid then brings back the default look. */
const OUTFITS = (() => {
  const seq = [
    { head: 'cat' },
    { head: 'bunny', palette: 'claude' },
    { head: 'sailor', palette: 'navigator' },
    { head: 'none', side: 'headphones', palette: 'fox' },
    { head: 'tophat', side: 'none', glasses: 'monocle', palette: 'purple' },
    { head: 'none', glasses: 'round', neck: 'scarf', palette: 'lemon' },
    { glasses: 'none', side: 'bow', neck: 'bell', palette: 'mono' },
    { head: 'halo', side: 'none', neck: 'bowtie', palette: 'navigator' },
  ];
  let cur = normalizeSkin(null);
  const NAMES = { cat: '猫耳', bear: '熊耳', bunny: '兔耳', sailor: '水手帽', feather: '耳羽', headphones: '耳机', party: '派对帽', tophat: '礼帽', monocle: '单片镜', round: '圆框眼镜', square: '方框眼镜', scarf: '围巾', bow: '蝴蝶结', bell: '铃铛', halo: '光环', bowtie: '领结', antenna: '天线', earring: '耳环', clip: '发夹' };
  return seq.map((step) => {
    for (const [slot, id] of Object.entries(step)) cur = slot === 'palette' ? { ...cur, palette: id } : wear(cur, slot, id);
    const label = Object.entries(step).map(([slot, id]) => (slot === 'palette' ? PAL_NAMES[id] : NAMES[id])).filter(Boolean).join(' · ');
    return { skin: cur, label };
  });
})();
const PLAIN_SKIN = normalizeSkin(null);
const GRID_AT = OUTFIT_AT + OUTFITS.length * EVERY;

function reset() {
  rand = rng(7);
  simT = 0;
  nextEvent = 0;
  Object.assign(hero, { floor: INTRO.ground, S: INTRO.S, obstacles: true, pendingFloor: null });
  D = { stage: 0, bonkAt: null, bonkY: 0, grabKeys: null, down: false, left: false, pokeKeys: null, poked: 0, hearts: [], nextHeart: 0, trace: [], cam: { x: CAM_X0, y: INTRO.ground - 190 * INTRO.S, vx: 0, vy: 0 } };
  optKeys = null;
  petG.innerHTML = ''; fxG.innerHTML = '';
  applySkin(PLAIN_SKIN);
  ctl = null;
  ctl = createPet({ petG, shadowEl, fxG }, {
    sfx: petSfx, roam: 'off', startX: 100,
    bounds: () => ({ W, H, floorY: floorAt(ctl ? ctl.pet.x : 100), S: hero.S }),
  });
  ctl.pet.facing = 1;
  ctl.setSkin(skin);
}

/** Advances the simulation to `t`, running timed orders, the cursor triggers and the camera on the way. */
function advance(t) {
  if (t < simT - 1e-6) reset();
  while (simT < t - 1e-9) {
    const dt = Math.min(STEP, t - simT);
    const next = simT + dt;
    while (nextEvent < EVENTS.length && EVENTS[nextEvent][0] <= next) {
      simT = Math.max(simT, EVENTS[nextEvent][0]);
      hero.S = heroS(simT); ctl.resize();
      EVENTS[nextEvent][1](ctl);
      nextEvent++;
    }
    simT = next;
    if (hero.pendingFloor != null && ctl.pet.mode === 'air') { hero.floor = hero.pendingFloor; hero.pendingFloor = null; }
    hero.S = heroS(simT);
    ctl.resize();
    // pet-core maps logo points to the stage through the transform of its last render; the cursors need it current
    const grabbing = simT >= GRAB.in - .2 && simT <= GRAB.release + .8, poking = simT >= POKE.in - .2 && simT <= POKE.out + .1;
    if (grabbing || poking) ctl.render();
    if (simT < T.title[0] + 1) directIntro(ctl);
    if (poking) directPoke(ctl);
    if (simT >= OUTFIT_AT && simT < GRID_AT) {
      const i = Math.min(OUTFITS.length - 1, Math.floor((simT - OUTFIT_AT) / EVERY));
      if (OUTFITS[i].skin !== skin) { applySkin(OUTFITS[i].skin); ctl.pet.sqv += 1.6; }
    }
    if (simT >= GRID_AT && skin !== PLAIN_SKIN) applySkin(PLAIN_SKIN);
    ctl.step(dt);
    heartStep(ctl);
    if (simT < GRAB.place + 1) camStep(ctl, dt);
  }
}

/* ---------- scenes ---------- */
/* intro: one floor line that rises over a low box and a tall wall, with rounded tops and filleted feet */
const intro = sceneLayer([T.intro[0], GRAB.place]);
const blocks = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
{
  const G = INTRO.ground, R = 18, F = 14;
  const rise = (l, r, top) => `H${l - F}Q${l} ${G} ${l} ${G - F}V${top + R}Q${l} ${top} ${l + R} ${top}H${r - R}Q${r} ${top} ${r} ${top + R}V${G - F}Q${r} ${G} ${r + F} ${G}`;
  const bumps = [[INTRO.box.l, INTRO.box.r, INTRO.box.top], [INTRO.wall.l, INTRO.wall.l + INTRO.wall.w, INTRO.wall.top]];
  const fills = bumps.map(([l, r, top]) => `<path d="M${l - F} ${G}${rise(l, r, top)}Z" fill="var(--sheet)"/>`).join('');
  blocks.innerHTML = `${fills}<path d="M-100 ${G}${bumps.map((b) => rise(...b)).join('')}H${W + 100}" fill="none" stroke="var(--line-2)" stroke-width="3" stroke-linejoin="round"/>`;
}
intro.el.appendChild(blocks);
const grabCursor = new Cursor(top);
function renderIntro(t) {
  const on = showScene(intro, t, 0);
  grabCursor.render(t, D.grabKeys ? GRAB.in : 1, D.grabKeys ? GRAB.release + .6 : 0, D.grabKeys ?? [[0, 0, 0]], []);
  if (!on) return;
  // the blocks sink away once the pet is lifted
  const o = ease.inCubic(seg(t, GRAB.lift, GRAB.lift + .7));
  blocks.style.transform = `translateY(${f1(o * 90)}px)`;
  blocks.style.opacity = String(f1((1 - o) * 100) / 100);
}
/* hearts while the pet looks in love: drawn here instead of pet-core's particles, one at a time from spread-out spots above the head */
const HEART = heartD(0, 0, 1), HEART_EVERY = .38, HEART_LIFE = 1.4;
const HEART_DX = [-46, 42, -10, 56, -32, 22]; // logo units from the head's centre line
function heartStep(c) {
  if (c.pet._fname !== 'love') { D.nextHeart = 0; return; }
  if (simT < D.nextHeart) return;
  c.render(); // toStage reads the transform of the last render
  const n = D.hearts.length, p = c.toStage(128 + HEART_DX[n % HEART_DX.length], 26);
  D.hearts.push({ t: simT, x: p.x, y: p.y, s: hero.S });
  D.nextHeart = simT + HEART_EVERY;
}
function renderHearts(t) {
  let s = '';
  D.hearts.forEach((hh, i) => {
    const age = t - hh.t;
    if (age < 0 || age > HEART_LIFE) return;
    const pop = ease.outBack(clamp01(age / .25), 2.2), fade = 1 - clamp01((age - .45) / (HEART_LIFE - .45));
    const x = hh.x + Math.sin(age * 3 + i * 1.7) * 10 * hh.s, y = hh.y - 95 * hh.s * age;
    s += `<path class="heart" opacity="${f1(fade * 100) / 100}" transform="translate(${f1(x)} ${f1(y)}) scale(${f1(.95 * hh.s * pop * 100) / 100})" d="${HEART}"/>`;
  });
  heartG.innerHTML = s;
}
function renderBonk(t) {
  if (D.bonkAt == null || t < D.bonkAt || t > D.bonkAt + .45) { bonkG.innerHTML = ''; return; }
  const k = seg(t, D.bonkAt, D.bonkAt + .45), x = INTRO.wall.l - 4, y = D.bonkY;
  let s = '';
  for (const a of [-50, -10, 30]) {
    const r = a * Math.PI / 180, r0 = 26 + 40 * k, r1 = r0 + 34 * (1 - k);
    s += `<path class="ink" fill="none" stroke-width="7" stroke-linecap="round" opacity="${f1((1 - k) * 100) / 100}" d="M${f1(x - Math.cos(r) * r0)} ${f1(y + Math.sin(r) * r0)}L${f1(x - Math.cos(r) * r1)} ${f1(y + Math.sin(r) * r1)}"/>`;
  }
  bonkG.innerHTML = s;
}
/* the track's name in the top-left corner while the intro plays */
function renderNowPlaying(t) {
  const k = seg(t, .3, .9), o = seg(t, 4.2, 4.9);
  nowPlaying.style.opacity = String(f1(Math.min(k, 1 - o) * 100) / 100);
  nowPlaying.style.transform = `translateY(${f1((1 - ease.outCubic(k)) * -16 - o * 10)}px)`;
}

/* title card */
const titleScene = sceneLayer(T.title);
const title = new Wordmark(titleScene.el, 'Coopanion', { x: 960, y: 262, scale: 1.5 });
const tagline = new Caption(titleScene.el, { x: 960, y: 372, size: 50, weight: 400, align: 'center', width: 1300, stagger: .025, color: 'var(--ink-soft)' });
tagline.set('你的小小万能桌面伴侣');
// the taskbar rises in as the intro's blocks sink, so the cursor sets the pet down on it; it sinks as the pet jumps off
const titleDesk = sceneLayer([GRAB.lift + .2, T.title[1]]);
const titleBar = h('div', 'taskbar', TASKBAR);
titleDesk.el.appendChild(titleBar);
function renderTitle(t) {
  const [a, b] = titleDesk.range;
  const desk = showScene(titleDesk, t, 0);
  titleBar.style.transform = `translateY(${f1((1 - ease.outCubic(seg(t, a, a + .5))) * 80 + ease.inCubic(seg(t, b - .28, b + .06)) * 80)}px)`;
  taskbarShown = Math.max(taskbarShown, desk);
  if (!showScene(titleScene, t, 0)) return;
  title.render(t, T.title[0] - .15, T.title[1] - .3);
  tagline.render(t, T.title[0] + .45, T.title[1] - .3);
}

/* faces */
const faces = sceneLayer(T.faces);
const facesCap = new Caption(faces.el, { x: 960, y: 90, size: 88, align: 'center', width: 1600 });
facesCap.set('动态小表情');
const faceChips = [new Chip(faces.el, 'chip label'), new Chip(faces.el, 'chip label')];
const FACE_LABELS = FACE_SEQ.map((n) => `${FACES[n].label}<em>${KAO[n]}</em>`);
function renderFaces(t) {
  if (!showScene(faces, t, 0)) return;
  facesCap.render(t, T.faces[0] + .1, T.faces[1] - .3);
  spitLabels(faceChips, t, FACE_AT(0), FACE_LABELS, T.faces[1] - .3);
}

/** Labels pushed out from under the pet's feet one per EVERY from `from`, on two chips taking turns so the previous one can drop away while the next comes out; the last leaves at `lastLeave`. */
function spitLabels(chips, t, from, labels, lastLeave) {
  const i = Math.max(0, Math.min(labels.length - 1, Math.floor((t - from) / EVERY)));
  for (const n of [i - 1, i]) {
    if (n < 0) continue;
    const at = from + n * EVERY;
    spitLabel(chips[n % 2], t, at, n === labels.length - 1 ? lastLeave : at + EVERY, labels[n]);
  }
  if (i < 1) chips[1].el.style.display = 'none';
}

/* dress */
const dress = sceneLayer(T.dress);
const dressCap = new Caption(dress.el, { x: 960, y: 90, size: 88, align: 'center', width: 1600 });
dressCap.set('换装扮');
const dressSub = new Caption(dress.el, { x: 960, y: 200, size: 40, weight: 400, align: 'center', width: 1600, color: 'var(--ink-soft)', stagger: .02 });
dressSub.set('7 种配色 · 19 件配饰');
const outfitChips = [new Chip(dress.el, 'chip label'), new Chip(dress.el, 'chip label')];
/** A label pushed out from under the pet's feet at `at`, settling at y = 960; it drops on and fades at `leave`. */
function spitLabel(chip, t, at, leave, html) {
  const k = seg(t, at, at + .3), o = seg(t, leave, leave + .18);
  chip.el.style.display = t < at || o >= 1 ? 'none' : '';
  if (chip.el.style.display) return;
  if (chip.html !== html) { chip.el.innerHTML = html; chip.html = html; }
  const y = lerp(880, 960, ease.outBack(k, 1.8)) + o * 50;
  const s = lerp(.45, 1, ease.outBack(k, 2.2));
  chip.el.style.transform = `translate(960px, ${f1(y)}px) translate(-50%, -50%) scale(${f1(s * 100) / 100})`;
  chip.el.style.opacity = String(f1(Math.min(clamp01(k * 3), (1 - o) ** 2) * 100) / 100);
  // the outgoing label passes under the incoming one
  chip.el.style.zIndex = o > 0 ? '1' : '2';
}
const grid = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
dress.el.appendChild(grid);
// one figure per palette
const GRID = [
  ['mint', { head: 'cat' }, 'happy'], ['mono', { head: 'bear' }, 'wink'], ['navigator', { head: 'sailor', side: 'feather' }, 'love'],
  ['claude', { side: 'headphones' }, 'happy'], ['fox', { head: 'party' }, 'neutral'], ['purple', { head: 'tophat', glasses: 'monocle' }, 'shy'],
  ['lemon', { glasses: 'round', neck: 'scarf' }, 'happy'],
].map(([palette, items, face], j) => {
  let s = { ...normalizeSkin(null), palette };
  for (const [slot, id] of Object.entries(items)) s = wear(s, slot, id);
  return { skin: s, face, x: 960 + (j - 3) * 240 };
});
const gridLabels = GRID.map(() => new Chip(dress.el, 'chip'));
/** Inline custom properties for a statically drawn figure with its own skin. */
function cssVars(s) {
  const css = skinCss(s, 'X');
  return css.slice(css.indexOf('{') + 1, css.indexOf('}'));
}
function renderDress(t) {
  if (!showScene(dress, t, 0)) { grid.innerHTML = ''; return; }
  dressCap.render(t, T.dress[0] + .1, T.dress[1] - .3);
  dressSub.render(t, T.dress[0] + .5, T.dress[1] - .3);
  spitLabels(outfitChips, t, OUTFIT_AT, OUTFITS.map((o) => o.label), GRID_AT - .2);
  if (t < GRID_AT) {
    grid.innerHTML = '';
    gridLabels.forEach((c) => c.render(t, 1, 0, '', 0, 0));
    return;
  }
  let s = '';
  GRID.forEach((g, j) => {
    const k = ease.outBack(seg(t, GRID_AT + j * .07, GRID_AT + j * .07 + .4), 2);
    // each mini hops on the beat; its shadow shrinks while it is up
    const ph = ((t - GRID_AT) / BEAT + j * .25) % 1;
    const hop = Math.max(0, Math.sin(Math.PI * ph * 2)) * 10;
    const sc = .72 * k, fc = FACES[g.face].f(t + j);
    s += `<ellipse class="shadow" cx="${g.x}" cy="698" rx="${f1(72 * sc * (1 - hop / 40))}" ry="${f1(10 * sc + 1)}"/>`;
    s += `<g style="${cssVars(g.skin)}" transform="translate(${g.x} ${f1(700 - hop)}) scale(${f1(sc * 100) / 100}) translate(-128 -256)">${figure(fc, { look: [0, 0], legs: STAND, low: 0, t: t + j, blink: 0, acc: g.skin })}</g>`;
  });
  grid.innerHTML = s;
  GRID.forEach((g, j) => gridLabels[j].render(t, GRID_AT + .2 + j * .07, T.dress[1] - .3, PAL_NAMES[g.skin.palette], g.x, 790));
}

/* stroll: the pet on the taskbar by itself; a click wakes it, and the morning is on a Mac */
const stroll = sceneLayer(T.stroll);
const strollTaskbar = h('div', 'taskbar', TASKBAR);
stroll.el.appendChild(strollTaskbar);
// the Mac desktop the light comes back on: a Dock under the pet, and the menu bar with the app's icon in it
const COO_ICON = '<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M347 182A118 118 0 1 0 347 318" fill="none" stroke="currentColor" stroke-width="62" stroke-linecap="round"/><rect x="196" y="352" width="42" height="80" rx="21" fill="currentColor"/><rect x="270" y="352" width="42" height="80" rx="21" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="30"><circle cx="236" cy="220" r="19"/><circle cx="304" cy="220" r="19"/></g></svg>';
const dock = h('div', 'dock', `${'<span class="app"></span>'.repeat(4)}<span class="app on"></span>${'<span class="app"></span>'.repeat(6)}<span class="sep"></span><span class="app"></span>`);
const menubar = h('div', 'menubar', `<b>Coopanion</b><span>文件</span><span>编辑</span><span>窗口</span><span class="grow"></span><span class="coo">${COO_ICON}</span><span>中</span><span class="clk">周三 07:30</span>`);
stroll.el.append(dock, menubar);
/** The Windows taskbar gives way to the Mac's Dock and menu bar as the light returns. */
const MAC_AT = [NIGHT.dawn, NIGHT.day + .35];
const strollCap = new Caption(stroll.el, { x: 120, y: 110, size: 88 });
strollCap.set('自己溜达');
const pokeCursor = new Cursor(top);
let taskbarShown = 0;
// night: a dark sheet over the background, and the page and pet colors mixed toward the pet page's dark theme
const nightEl = h('div', 'night');
stage.insertBefore(nightEl, world);
const skinVar = (dark, name) => new RegExp(`${name}:([^;]+)`).exec(skinVars(PLAIN_SKIN, dark))[1];
const NIGHT_VARS = {
  '--ink': ['#1B1A1E', '#E9EDF2'], '--ink-soft': ['#5C5C60', '#8C95A3'], '--line': ['#E3E4E3', '#252C37'],
  '--skin-ink': [skinVar(false, '--skin-ink'), skinVar(true, '--skin-ink')], '--skin-eye': [skinVar(false, '--skin-eye'), skinVar(true, '--skin-eye')],
  '--shadow': ['rgba(27,22,38,.14)', 'rgba(0,0,0,.5)'], '--dust': ['#A39DB0', '#5B6472'], '--bar': ['rgba(251,251,251,.92)', 'rgba(21,26,34,.92)'],
};
let nightShown = 0;
function setNight(k) {
  if (k === nightShown) return;
  nightShown = k;
  nightEl.style.opacity = String(k);
  // the ink flips around the middle of the dimming, so text and pet never fade into the grey in between
  const ink = ease.inOutCubic(seg(k, .45, .55));
  for (const [name, [a, b]] of Object.entries(NIGHT_VARS)) stage.style.setProperty(name, k ? `color-mix(in srgb, ${a}, ${b} ${f1(ink * 100)}%)` : '');
}
function renderStroll(t) {
  setNight(t > T.stroll[0] && t < T.stroll[1] ? f1(ease.inOutCubic(seg(t, NIGHT.dusk, NIGHT.dark)) * (1 - ease.outCubic(seg(t, NIGHT.dawn, NIGHT.day))) * 100) / 100 : 0);
  const on = showScene(stroll, t, 0);
  taskbarShown = Math.max(taskbarShown, on);
  pokeCursor.render(t, on && D.pokeKeys ? POKE.in : 1, on && D.pokeKeys ? POKE.out + .3 : 0, D.pokeKeys ?? [[0, 0, 0]], [POKE.down]);
  if (!on) return;
  strollCap.render(t, T.stroll[0] + .3, T.stroll[1] - .3);
  const m = ease.inOutCubic(seg(t, MAC_AT[0], MAC_AT[1]));
  strollTaskbar.style.opacity = String(f1((1 - m) * 100) / 100);
  strollTaskbar.style.transform = `translateY(${f1(m * 40)}px)`;
  dock.style.opacity = String(f1(m * 100) / 100);
  dock.style.transform = `translateX(-50%) translateY(${f1((1 - ease.outBack(m, 1.6)) * 60)}px)`;
  menubar.style.opacity = String(f1(m * 100) / 100);
  menubar.style.transform = `translateY(${f1(-(1 - ease.outCubic(m)) * 50)}px)`;
}

/* steps: the pet hops from card to card */
const steps = sceneLayer(T.steps);
const stepsCap = new Caption(steps.el, { x: 960, y: 80, size: 88, align: 'center', width: 1600 });
stepsCap.set('三步开始');
const CARDS = [
  ['下载安装', 'Windows 安装包 / Mac dmg,<br>双击就能用'],
  ['填入 API KEY(BYOK)', '支持 OpenAI, DeepSeek,<br>等多种上游！'],
  ['开始聊天', '打字、说话,<br>或者拎起它'],
];
const CARD_AT = [bar(25) + .05, bar(27), bar(29)];
// a card lights up while the pet stands on it
const CARD_ON = [[TO_CARD1.lands, TO_CARD2.at], [TO_CARD2.lands, TO_CARD3.at], [TO_CARD3.lands, T.steps[1]]];
const cardEls = CARDS.map(([t1, p], i) => {
  const c = h('div', 'card', `<div class="num">${i + 1}</div><h3>${t1}</h3><p>${p}</p>`);
  c.style.left = `${[160, 720, 1280][i]}px`;
  c.style.top = `${CARD_TOP}px`;
  steps.el.appendChild(c);
  return c;
});
const freeChip = new Chip(steps.el, 'chip on');
function renderSteps(t) {
  if (!showScene(steps, t, 0)) return;
  stepsCap.render(t, T.steps[0] + .1, T.steps[1] - .3);
  cardEls.forEach((c, i) => {
    const at = CARD_AT[i];
    const k = ease.outBack(seg(t, at, at + .4), 2);
    c.style.opacity = String(f1(clamp01(seg(t, at, at + .18)) * 100) / 100);
    c.style.transform = `translateY(${f1((1 - k) * 80)}px) scale(${f1((.9 + .1 * k) * 100) / 100})`;
    c.classList.toggle('on', t >= CARD_ON[i][0] && t < CARD_ON[i][1]);
  });
  freeChip.render(t, bar(30.5), T.steps[1] - .3, 'MIT 开源 · Windows 10 / 11 · macOS', 960, 860);
}

/* say */
const sayScene = sceneLayer(T.say);
const sayCap = new Caption(sayScene.el, { x: 1060, y: 360, size: 88 });
sayCap.set('气泡对话');
function renderSay(t) {
  if (!showScene(sayScene, t)) return;
  sayCap.render(t, T.say[0] + .2, T.say[1] - .3);
}

/* voice */
const voiceScene = sceneLayer(T.voice);
const voiceCap = new Caption(voiceScene.el, { x: 140, y: 300, size: 88 });
voiceCap.set('语音输入');
const voiceSub = new Caption(voiceScene.el, { x: 140, y: 430, size: 40, weight: 400, color: 'var(--ink-soft)', stagger: .02 });
voiceSub.set('FunASR 在本机识别');
const waves = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
voiceScene.el.appendChild(waves);
const LISTEN = [bar(36) + .8, HEARD.final];
const mic = new Chip(voiceScene.el, 'chip on');
function renderVoice(t) {
  if (!showScene(voiceScene, t, -70)) return;
  voiceCap.render(t, T.voice[0] + .2, T.voice[1] - .3);
  voiceSub.render(t, T.voice[0] + .6, T.voice[1] - .3);
  mic.render(t, LISTEN[0], HEARD.end, '麦克风已开', 560, 700);
  let s = '';
  if (t > LISTEN[0] && t < LISTEN[1]) {
    for (let i = 0; i < 4; i++) {
      const k = ((t - LISTEN[0]) * 1.1 + i / 4) % 1;
      const x = lerp(720, 1180, k), r = 60 - 30 * k;
      s += `<path d="M${f1(x)} ${f1(700 - r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x)} ${f1(700 + r)}" fill="none" stroke="#00A870" stroke-width="10" stroke-linecap="round" opacity="${f1(Math.sin(Math.PI * k) * 100) / 100}"/>`;
    }
  }
  waves.innerHTML = s;
}

/* ask */
const askScene = sceneLayer(T.ask);
const askCap = new Caption(askScene.el, { x: 1060, y: 360, size: 88 });
askCap.set('给你选项');
const optCursor = new Cursor(top);
function renderAsk(t) {
  if (!showScene(askScene, t)) return;
  askCap.render(t, T.ask[0] + .2, T.ask[1] - .3);
}

/* computer use: the pet fills a calendar entry, stops while the user moves the mouse, then finishes */
const desk = sceneLayer(T.cua);
const deskTaskbar = h('div', 'taskbar', TASKBAR);
desk.el.appendChild(deskTaskbar);
const win = h('div', 'win', '<div class="bar"><i></i><i></i><i></i><span style="margin-left:10px">日程</span></div><div class="body"><label>事项</label><div class="field f1"><span class="v"></span></div><label>时间</label><div class="field f2"><span class="v"></span></div><div class="btn">保存</div></div><div class="toast">已保存</div>');
Object.assign(win.style, { left: '860px', top: '240px', width: '760px', height: '560px', transformOrigin: '0 100%' });
desk.el.appendChild(win);
const cuaCap = new Caption(desk.el, { x: 120, y: 110, size: 88 });
cuaCap.set('操作电脑');
const cuaSub = new Caption(desk.el, { x: 120, y: 226, size: 40, weight: 400, color: 'var(--ink-soft)', stagger: .018 });
cuaSub.set('看屏幕、点鼠标、打字');
const petCursor = new Cursor(top, { color: '#00A870', badge: 'Coo' });
const userCursor = new Cursor(top);
const stopChip = new Chip(top, 'chip');
const typed = (t, parts) => parts.map(([text, a, b]) => text.slice(0, Math.floor(text.length * seg(t, a, b)))).join('');
function renderCua(t) {
  const on = showScene(desk, t, 0);
  taskbarShown = Math.max(taskbarShown, on);
  petCursor.render(t, on ? CUA.keys[0][0] : 1, on ? T.cua[1] - .2 : 0, CUA.keys, CUA.clicks);
  userCursor.render(t, on ? CUA.userKeys[0][0] : 1, on ? CUA.userKeys[CUA.userKeys.length - 1][0] : 0, CUA.userKeys, []);
  stopChip.render(t, on ? CUA.stop[0] : 1, on ? CUA.stop[1] : 0, '你一动鼠标,它就停下等你', 1250, 900);
  if (!on) return;
  cuaCap.render(t, T.cua[0] + .3, T.cua[1] - .4);
  cuaSub.render(t, T.cua[0] + .7, T.cua[1] - .4);
  const [c1, c2, cSave] = CUA.clicks;
  deskTaskbar.querySelector('.cal').classList.toggle('on', t >= CUA.win);
  const k = ease.outBack(seg(t, CUA.win, CUA.win + .45), 1.4);
  win.style.transform = `scale(${f1((.6 + .4 * k) * 100) / 100})`;
  win.style.opacity = String(f1(seg(t, CUA.win, CUA.win + .25) * 100) / 100);
  win.querySelector('.f1 .v').innerHTML = typed(t, CUA.f1) + (t > c1 && t < c2 - .05 ? '<i class="caret-line"></i>' : '');
  win.querySelector('.f2 .v').innerHTML = typed(t, CUA.f2) + (t > c2 && t < cSave ? '<i class="caret-line"></i>' : '');
  win.querySelector('.f1').classList.toggle('focus', t > c1 && t < c2 - .05);
  win.querySelector('.f2').classList.toggle('focus', t > c2 && t < cSave);
  win.querySelector('.btn').classList.toggle('press', t > cSave && t < cSave + .25);
  const toast = win.querySelector('.toast');
  toast.style.opacity = String(f1(seg(t, cSave + .2, cSave + .5) * 100) / 100);
  toast.style.transform = `translateY(${f1((1 - ease.outBack(seg(t, cSave + .2, cSave + .6))) * 20)}px)`;
}

/* extensions: examples around the pet, their links fading into a ring around it */
const ext = sceneLayer(T.ext);
const extCap = new Caption(ext.el, { x: 960, y: 70, size: 88, align: 'center', width: 1600 });
extCap.set('更多扩展');
const extSub = new Caption(ext.el, { x: 960, y: 960, size: 40, weight: 400, align: 'center', width: 1600, color: 'var(--ink-soft)', stagger: .015 });
extSub.set('从 npm 安装 Cortico World');
const links = svgEl('svg', { class: 'full', viewBox: `0 0 ${W} ${H}` });
ext.el.appendChild(links);
const EXT = [['发QQ?', 470, 400], ['玩游戏?', 1450, 400], ['画个画?', 470, 700], ['自定义扩展?', 1450, 700]];
const extEls = EXT.map(([name], i) => { const e = h('div', i === EXT.length - 1 ? 'ext own' : 'ext', `${name}<b></b>`); ext.el.appendChild(e); return e; });
const EXT_CENTER = { x: 960, y: 520 }, RING = 200;
function renderExt(t) {
  if (!showScene(ext, t, 0)) return;
  extCap.render(t, T.ext[0] + .1, T.ext[1] - .3);
  extSub.render(t, beat(208), T.ext[1] - .3);
  let defs = '', s = '';
  EXT.forEach(([, x0, y0], i) => {
    const at = beat(198 + i * 2);
    const k = ease.outBack(seg(t, at, at + .45), 2);
    const x = x0, y = y0 + Math.sin((t - at) * 2.2 + i) * 6;
    const e = extEls[i];
    e.style.opacity = String(f1(clamp01(seg(t, at, at + .2)) * 100) / 100);
    e.style.transform = `translate(${f1(x)}px, ${f1(y)}px) translate(-50%, -50%) scale(${f1(k * 100) / 100})`;
    if (t > at) {
      const dx = EXT_CENTER.x - x, dy = EXT_CENTER.y - y, len = Math.hypot(dx, dy);
      const reach = (len - RING) * ease.outCubic(seg(t, at, at + .6));
      const ex = x + dx / len * reach, ey = y + dy / len * reach;
      defs += `<linearGradient id="lk${i}" gradientUnits="userSpaceOnUse" x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + dx / len * (len - RING))}" y2="${f1(y + dy / len * (len - RING))}"><stop offset="0" stop-color="#54B494" stop-opacity=".6"/><stop offset=".55" stop-color="#54B494" stop-opacity=".45"/><stop offset="1" stop-color="#54B494" stop-opacity="0"/></linearGradient>`;
      s += `<path d="M${f1(x)} ${f1(y)}L${f1(ex)} ${f1(ey)}" fill="none" stroke="url(#lk${i})" stroke-width="8" stroke-linecap="round"${i === EXT.length - 1 ? ' stroke-dasharray="2 18"' : ''}/>`;
    }
  });
  links.innerHTML = `<defs>${defs}</defs>${s}`;
}

/* outro */
const outro = sceneLayer(T.outro);
const outTitle = new Wordmark(outro.el, 'Coopanion', { x: 960, y: 614, scale: 1.5 });
const outTag = new Caption(outro.el, { x: 960, y: 724, size: 50, weight: 400, align: 'center', width: 1600, stagger: .025, color: 'var(--ink-soft)' });
outTag.set('你的小小万能桌面伴侣');
const outUrl = new Chip(outro.el, 'chip primary');
const outQQ = new Chip(outro.el, 'chip');
const credit = h('div', 'cap', `MIT 开源 · 基于 Cortico      BGM:${SOUNDTRACK.title}`);
Object.assign(credit.style, { left: '960px', top: '1010px', fontSize: '24px', color: 'var(--ink-dim)', transform: 'translateX(-50%)', width: '1400px', textAlign: 'center' });
outro.el.appendChild(credit);
function renderOutro(t) {
  if (!showScene(outro, t, 0)) return;
  outTitle.render(t, T.outro[0] + .4);
  outTag.render(t, T.outro[0] + 1.2);
  outUrl.render(t, T.outro[0] + 1.9, Infinity, 'github.com/Pal-AI-Lab/Coopanion', 960, 846);
  outQQ.render(t, T.outro[0] + 2.3, Infinity, 'QQ群：1080755910', 960, 926);
  credit.style.opacity = String(seg(t, T.outro[0] + 2.9, T.outro[0] + 3.5));
}

/* signature, lifted above the taskbar while a desktop scene shows */
function renderSignature(t) {
  signature.style.opacity = String(f1(seg(t, .3, .9) * 100) / 100);
  signature.style.transform = `translateY(${f1(-80 * taskbarShown)}px)`;
}

/* ---------- speech: bubbles by time ---------- */
function renderBubbles(t) {
  const a = ctl.anchor();
  let talking = false, used = false, used2 = false;
  const sayAt = (text, start, end, cps) => { if (t >= start && t <= end) { used = true; talking = bubble.say(t, text, start, end, a, cps) || talking; } };
  sayAt('嗨,我是 Coo!', bar(5) + .5, bar(7) - .2, 12);
  for (const [text, start, end] of SAY) sayAt(text, start, end, 16);
  if (t >= HEARD.start && t <= HEARD.end) { used = true; bubble.heard(t, HEARD.text, HEARD.start, HEARD.final, HEARD.end, a); }
  sayAt(...REPLY, 16);
  if (t >= ASK.start && t <= ASK.end) {
    used = true;
    const row = bubble.ask(t, ASK.q, ASK.options, ASK.start, ASK.choose, ASK.chosen, ASK.end, a);
    if (!optKeys && t >= ASK.cursorIn - .2 && row) {
      const r = row.getBoundingClientRect(), s = stage.getBoundingClientRect(), k = s.width / W;
      const cx = (r.left - s.left) / k + 150, cy = (r.top - s.top) / k + r.height / k / 2;
      optKeys = [[ASK.cursorIn, 1500, 980], [ASK.choose - .4, cx, cy]];
    }
  }
  optCursor.render(t, optKeys ? ASK.cursorIn : 1, optKeys ? ASK.end - .3 : 0, optKeys ?? [[0, 0, 0]], [ASK.choose]);
  if (t >= CUA.done + .1 && t <= T.cua[1] - .15) { used2 = true; talking = bubble2.say(t, '填好了,已经保存。', CUA.done + .1, T.cua[1] - .15, a, 16) || talking; }
  if (t >= bar(31) && t <= bar(33) - .15) { used2 = true; talking = bubble2.say(t, '我们聊点什么?', bar(31), bar(33) - .15, a, 14) || talking; }
  if (!used) bubble.hide();
  if (!used2) bubble2.hide();
  if (talking) ctl.talk();
}

/* ---------- frame ---------- */
function render(t) {
  endFade.style.opacity = String(f1(seg(t, DURATION - END_FADE, DURATION) * 100) / 100);
  advance(t);
  applyCamera(t);
  arcs.render(TRAVEL(t), surgeAt(t));
  petWrap.style.opacity = String(t >= GRID_AT && t < bar(17) - .08 ? f1((1 - seg(t, GRID_AT, GRID_AT + .2)) * 100) / 100 : 1);
  taskbarShown = 0;
  renderIntro(t);
  renderNowPlaying(t);
  renderTitle(t);
  renderFaces(t);
  renderDress(t);
  renderStroll(t);
  renderSteps(t);
  renderSay(t);
  renderVoice(t);
  renderAsk(t);
  renderCua(t);
  renderExt(t);
  renderOutro(t);
  renderSignature(t);
  ctl.render();
  renderHearts(t);
  renderBonk(t);
  renderBubbles(t);
}

/* ---------- sound effects: what the pet plays in a dry run of the whole timeline, plus the promo's own ---------- */
function collectCues() {
  petCues = [];
  reset();
  advance(DURATION);
  const cues = petCues;
  petCues = null;
  reset();
  const add = (t, ...c) => cues.push([t, ...c]);
  // a bubble pops open and babbles as its characters appear, as on the pet page
  const speak = (text, start, cps) => {
    add(start, 'pop');
    [...text].forEach((ch, i) => { if (!/[\s,。!?、,.!?]/.test(ch)) add(start + (i + 1) / cps, 'babble', ch); });
  };
  const type = (parts) => parts.forEach(([text, a, b]) => [...text].forEach((ch, i) => { if (ch !== ' ') add(a + (i + 1) / text.length * (b - a), 'key'); }));
  add(T.title[0] + .1, 'sparkle');
  speak('嗨,我是 Coo!', bar(5) + .5, 12);
  OUTFITS.forEach((_, n) => add(OUTFIT_AT + n * EVERY, 'pop'));
  add(GRID_AT, 'sparkle');
  add(NIGHT.dusk, 'dusk');
  add(NIGHT.dawn + .1, 'dawn');
  CARD_AT.forEach((at) => add(at, 'pop'));
  add(bar(30.5), 'tick');
  speak('我们聊点什么?', bar(31), 14);
  for (const [text, start] of SAY) speak(text, start, 16);
  add(LISTEN[0], 'listenStart');
  add(HEARD.final, 'listenEnd');
  speak(REPLY[0], REPLY[1], 16);
  speak(ASK.q, ASK.start, 16);
  add(ASK.choose, 'click');
  add(ASK.choose + .02, 'select');
  add(CUA.win, 'pop');
  CUA.clicks.forEach((at) => add(at, 'click'));
  type(CUA.f1); type(CUA.f2);
  add(CUA.clicks[2] + .2, 'sparkle');
  speak('填好了,已经保存。', CUA.done + .1, 16);
  EXT.forEach((_, i) => add(beat(198 + i * 2), 'pop'));
  add(T.outro[0] + .4, 'sparkle');
  add(T.outro[0] + 1.9, 'pop');
  add(T.outro[0] + 2.3, 'pop');
  return cues.sort((a, b) => a[0] - b[0]);
}
const CUES = collectCues();

/* ---------- playback ---------- */
function fit() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${f1((innerWidth - W * k) / 2)}px, ${f1((innerHeight - H * k) / 2)}px) scale(${k})`;
}
addEventListener('resize', fit);
fit();
reset();

window.promo = {
  duration: DURATION,
  fps: 30,
  audioStart: AUDIO_START,
  fadeOut: END_FADE,
  renderAt(t) { render(Math.max(0, Math.min(DURATION, t))); return true; },
  get trace() { return D.trace; },
  mix: MIX,
  /** The sound effects in [from, to) as a mono WAV, base64, at the MIX level; the recorder lays it over the music. */
  async sfxWav(from, to) {
    const bytes = await renderTrack(CUES, from, to, MIX.sfx);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
};

if (!RECORD) {
  const audio = new Audio(SOUNDTRACK.file);
  audio.preload = 'auto';
  audio.volume = MIX.music;
  const clock = () => Math.max(0, Math.min(DURATION, audio.currentTime - AUDIO_START));
  // effects are scheduled a little ahead of the music's clock; nextCue is the first one not yet scheduled
  let fx = null, nextCue = 0;
  const resync = () => { const t = clock(); nextCue = CUES.findIndex((c) => c[0] >= t); if (nextCue < 0) nextCue = CUES.length; };
  const seekTo = (t) => { audio.currentTime = AUDIO_START + Math.max(0, Math.min(DURATION, t)); resync(); };
  const hud = h('div', 'hud', '<button class="play">▶ 播放</button><input type="range" min="0" max="1000" value="0"><span class="time">0:00</span>');
  document.body.appendChild(hud);
  const btn = hud.querySelector('.play'), seek = hud.querySelector('input'), time = hud.querySelector('.time');
  const gate = h('div', 'gate', '<button>▶ 播放宣传片</button>');
  document.body.appendChild(gate);
  let playing = false;
  const toggle = async () => {
    if (playing) { audio.pause(); playing = false; btn.textContent = '▶ 播放'; return; }
    if (audio.currentTime < AUDIO_START || clock() >= DURATION) seekTo(0);
    if (!fx) { const ctx = new AudioContext(); fx = { ctx, voices: createVoices(ctx, busInto(ctx, ctx.destination, MIX.sfx)) }; }
    fx.ctx.resume();
    resync();
    playing = true; btn.textContent = '❚❚ 暂停'; gate.remove();
    try { await audio.play(); } catch { /* no audio: the clock below still advances */ }
  };
  gate.querySelector('button').addEventListener('click', toggle);
  btn.addEventListener('click', toggle);
  seek.addEventListener('input', () => { seekTo(seek.value / 1000 * DURATION); render(clock()); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight') seekTo(clock() + 5);
    if (e.code === 'ArrowLeft') seekTo(clock() - 5);
  });
  audio.addEventListener('ended', () => { playing = false; btn.textContent = '↺ 重播'; });
  const loop = () => {
    const t = clock();
    render(t);
    audio.volume = MIX.music * (1 - seg(t, DURATION - END_FADE, DURATION));
    if (playing && fx) {
      for (; nextCue < CUES.length && CUES[nextCue][0] < t + .1; nextCue++) fx.voices.play(fx.ctx.currentTime + CUES[nextCue][0] - t, CUES[nextCue]);
    }
    seek.value = String(Math.round(t / DURATION * 1000));
    time.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (playing && t >= DURATION) { audio.pause(); playing = false; btn.textContent = '↺ 重播'; }
    requestAnimationFrame(loop);
  };
  render(0);
  requestAnimationFrame(loop);
}

// stills and the recorder start from a given time: ?record&t=12.5
if (RECORD) render(Number(params.get('t') ?? 0));
