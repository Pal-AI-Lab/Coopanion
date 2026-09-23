/**
 * The promo's sound effects: the pet's own synthesized voices (pet-core `createSfx`), rebuilt so a
 * voice can be scheduled at an absolute time on any AudioContext, live or offline, with a seeded
 * random of its own (the timeline owns Math.random while the pet is simulated).
 *
 * A cue is [time, voice, ...args] on the timeline. `createVoices` plays cues into a context;
 * `renderTrack` renders a range of cues offline into a mono WAV for the recorder.
 */
import { rng } from './util.js';

/** Level of each voice relative to the pet's own mix; footsteps and typing sit well under the rest. */
const LEVEL = { step: .5, babble: .7, key: .6, snore: .8, whoosh: .45 };

export function createVoices(ctx, out, seed = 11) {
  const R = rng(seed), rnd = (a, b) => a + R() * (b - a);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
  let at0 = 0, lv = 1; // start time and level of the voice being played
  function tone({ type = 'sine', f0 = 440, f1 = f0, dur = .1, vol = .2, at = 0, attack = .005, vib = 0, vibRate = 0, filter = 0 }) {
    const t0 = at0 + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    if (vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = vibRate; lg.gain.value = vib;
      l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + .05);
    }
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * lv, t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    let node = o;
    if (filter) { const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = filter; o.connect(bq); node = bq; }
    node.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + dur + .03);
  }
  function noise({ type = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = .2, vol = .15, at = 0, attack = .01 }) {
    const t0 = at0 + at, s = ctx.createBufferSource(), bq = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; bq.type = type; bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t0);
    bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * lv, t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    s.connect(bq); bq.connect(g); g.connect(out);
    s.start(t0, R() * .5); s.stop(t0 + dur + .03);
  }
  // pet-core createSfx, voice for voice, plus the promo's own `key`, `click`, `thud` and `dusk`/`dawn`
  const V = {
    step(run, i) {
      const k = run ? 1.25 : 1;
      tone({ f0: (i ? 520 : 440) * k, f1: (i ? 380 : 330) * k, dur: .06, vol: run ? .07 : .05 });
      if (run) noise({ f0: 2500, q: .8, dur: .05, vol: .03 });
    },
    skid() { noise({ type: 'highpass', f0: 1800, f1: 900, dur: .22, vol: .08 }); },
    jump() { tone({ type: 'triangle', f0: 200, f1: 720, dur: .24, vol: .22, vib: 40, vibRate: 22 }); },
    land(hard) {
      tone({ f0: hard ? 160 : 190, f1: 48, dur: hard ? .28 : .16, vol: hard ? .4 : .25 });
      noise({ type: 'lowpass', f0: hard ? 700 : 500, f1: 120, dur: .12, vol: hard ? .25 : .12 });
      if (hard) tone({ type: 'square', f0: 420, f1: 300, dur: .08, vol: .06, at: .02, filter: 1600 });
    },
    grab() { tone({ type: 'triangle', f0: 680, f1: 1500, dur: .14, vol: .18, vib: 60, vibRate: 30 }); },
    squeak() { tone({ type: 'triangle', f0: rnd(900, 1200), f1: rnd(1300, 1700), dur: .09, vol: .08, vib: 40, vibRate: 35 }); },
    whoosh() { noise({ f0: 300, f1: 2400, q: 1.4, dur: .38, vol: .22, attack: .08 }); },
    chirps() { for (let i = 0; i < 3; i++) tone({ f0: 2300 + i * 120, f1: 3200, dur: .06, vol: .06, at: i * .11 }); },
    shake() { for (let i = 0; i < 5; i++) tone({ type: 'square', f0: 180, f1: 160, dur: .05, vol: .05, at: i * .06, filter: 900 }); },
    hmm() { tone({ type: 'triangle', f0: 330, f1: 360, dur: .12, vol: .08 }); tone({ type: 'triangle', f0: 392, f1: 470, dur: .16, vol: .08, at: .14 }); },
    yawn() { tone({ type: 'triangle', f0: 520, f1: 240, dur: 1, vol: .1, vib: 12, vibRate: 5, filter: 1500, attack: .15 }); },
    snore() { noise({ type: 'lowpass', f0: 250, f1: 700, dur: .7, vol: .09, attack: .35 }); },
    purr() { tone({ type: 'sawtooth', f0: 62, f1: 58, dur: .9, vol: .08, vib: 6, vibRate: 24, filter: 320, attack: .1 }); },
    poke() { tone({ f0: 320, f1: 200, dur: .09, vol: .16 }); },
    nod() { tone({ type: 'triangle', f0: 520, f1: 440, dur: .07, vol: .08 }); tone({ type: 'triangle', f0: 520, f1: 440, dur: .07, vol: .08, at: .2 }); },
    spin() { tone({ type: 'triangle', f0: 300, f1: 1200, dur: .3, vol: .12, vib: 30, vibRate: 18 }); },
    happy() { tone({ type: 'triangle', f0: 660, f1: 700, dur: .1, vol: .14 }); tone({ type: 'triangle', f0: 990, f1: 1050, dur: .14, vol: .14, at: .09 }); },
    wink() { tone({ f0: 1760, dur: .5, vol: .1 }); tone({ f0: 2637, dur: .45, vol: .06, at: .04 }); },
    love() { tone({ f0: 480, f1: 820, dur: .1, vol: .14 }); tone({ f0: 600, f1: 1000, dur: .12, vol: .14, at: .13 }); },
    surprised() { tone({ f0: 380, f1: 1500, dur: .2, vol: .16, vib: 15, vibRate: 12 }); },
    angry() { tone({ type: 'sawtooth', f0: 120, f1: 95, dur: .5, vol: .12, vib: 12, vibRate: 14, filter: 700 }); },
    sad() { tone({ type: 'triangle', f0: 440, f1: 392, dur: .3, vol: .13, vib: 8, vibRate: 6 }); tone({ type: 'triangle', f0: 392, f1: 262, dur: .55, vol: .13, at: .3, vib: 10, vibRate: 5 }); },
    shy() { tone({ f0: 1300, f1: 1600, dur: .07, vol: .07 }); tone({ f0: 1450, f1: 1750, dur: .07, vol: .06, at: .1 }); },
    expr(n) {
      const m = { happy: 'happy', wink: 'wink', love: 'love', surprised: 'surprised', angry: 'angry', sad: 'sad', shy: 'shy', sleepy: 'yawn' };
      if (m[n]) V[m[n]]();
    },
    tick() { tone({ f0: 1200, f1: 1000, dur: .03, vol: .05 }); },
    pop() { tone({ f0: 240, f1: 720, dur: .07, vol: .14 }); },
    sparkle() { [1568, 2093, 2637].forEach((fr, i) => tone({ f0: fr, dur: .25, vol: .06, at: i * .06 })); },
    select() { tone({ type: 'triangle', f0: 520, f1: 1040, dur: .1, vol: .12 }); },
    babble(ch) {
      const fr = 330 + (ch.codePointAt(0) % 9) * 28;
      tone({ type: 'square', f0: fr, f1: fr * rnd(.85, 1.1), dur: .05, vol: .05, filter: 1800 });
    },
    listenStart() { tone({ f0: 880, dur: .12, vol: .1 }); tone({ f0: 1320, dur: .16, vol: .1, at: .1 }); },
    listenEnd() { tone({ f0: 1320, dur: .1, vol: .09 }); tone({ f0: 990, dur: .16, vol: .09, at: .09 }); },
    // a key press and a mouse click on the promo's desktop
    key() { noise({ type: 'bandpass', f0: rnd(2600, 3400), q: 2.5, dur: .035, vol: .07, attack: .002 }); },
    click() { noise({ type: 'bandpass', f0: 3800, q: 3, dur: .025, vol: .12, attack: .001 }); tone({ f0: 1900, f1: 1500, dur: .03, vol: .04 }); },
    // the pet bumping into the intro's wall
    thud() { V.land(true); },
    // the stroll scene's evening and morning: a falling and a rising chime
    dusk() { [1047, 784, 659, 523].forEach((fr, i) => tone({ type: 'triangle', f0: fr, dur: .7, vol: .05, at: i * .14, attack: .02 })); },
    dawn() { [523, 659, 784, 1047].forEach((fr, i) => tone({ type: 'triangle', f0: fr, dur: .5, vol: .06, at: i * .07, attack: .01 })); },
  };
  return {
    /** Plays cue [t, voice, ...args] at context time `when`. */
    play(when, [, voice, ...args]) {
      if (!V[voice]) return;
      at0 = Math.max(when, ctx.currentTime); lv = LEVEL[voice] ?? 1;
      V[voice](...args);
    },
  };
}

/** The cues in [from, to) rendered offline at `gain` into a 16-bit mono WAV, time 0 = `from`. */
export async function renderTrack(cues, from, to, gain, rate = 48000) {
  const ctx = new OfflineAudioContext(1, Math.ceil((to - from) * rate), rate);
  const bus = busInto(ctx, ctx.destination, gain);
  const v = createVoices(ctx, bus);
  for (const c of cues) if (c[0] >= from && c[0] < to) v.play(c[0] - from, c);
  const data = (await ctx.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + data.length * 2), dv = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return new Uint8Array(buf);
}

/** The effects bus as in pet-core: a gain into a compressor, then `gain` for the balance with the music. */
export function busInto(ctx, dest, gain) {
  const master = ctx.createGain(), comp = ctx.createDynamicsCompressor(), out = ctx.createGain();
  master.gain.value = .55; out.gain.value = gain;
  master.connect(comp); comp.connect(out); out.connect(dest);
  return master;
}
