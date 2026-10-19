/**
 * Coo's speech: while a bubble types, each syllable is read from a voice bank the way Animal Crossing's villagers
 * talk. It stands in for the 'talk' kind's babble and is muted with it. The bank (web/speech/, built by
 * scripts/speech-bank/build.py) holds one pitch-flat unit per toneless Mandarin syllable; the pitch is set by
 * playback rate alone, so a unit plays shorter as it plays higher. Which syllables a text is spoken as comes
 * from the World (`POST /api/speech`, src/speech): every language goes through its IPA to the nearest syllable.
 *
 * Two clocks: the bubble reveals characters at its own pace (`reveal`), and the voice starts a unit at most
 * `unitsPerSecond` times a second, so it falls behind the text and ends after it. After each pause mark the voice
 * keeps a silence (VOICE_GAP) however far behind it is; behind by more than MAX_LAG it drops weak characters, by
 * twice that anything but a phrase's last two units. Characters revealed before the World answers wait for it.
 *
 * Within a phrase the pitch stays within about a semitone; a stressed syllable is a semitone higher, a Mandarin
 * one follows its tone a little, a question ends rising, an exclamation starts a semitone higher and louder.
 */
const BANK = 'zh';
/** Seconds the voice keeps silent after each pause mark; consecutive marks add up. */
export const VOICE_GAP = {
  ',': .14, '，': .14, '、': .14, ';': .2, '；': .2, ':': .2, '：': .2,
  '.': .45, '。': .45, '!': .5, '！': .5, '?': .5, '？': .5, '…': .3, '~': .1, '～': .1,
};
/** While speech is on, how long the bubble waits after each pause mark, in typing steps (1/20 s). */
export const TEXT_PAUSE = {
  ',': 5, '，': 5, '、': 5, ';': 6, '；': 6, ':': 6, '：': 6,
  '.': 9, '。': 9, '!': 9, '！': 9, '?': 9, '？': 9, '…': 4, '~': 3, '～': 3,
};
/**
 * While speech is on, the typing steps one character takes. A letter of an alphabet (and a space or apostrophe)
 * takes LETTER_STEP: three or four of them make one syllable, where a Han character, kana or Hangul block is one,
 * so letters type faster for the voice to keep its pace, as Animal Crossing's English text does (45-70 letters
 * against 13-14 syllables a second).
 */
const LETTER_STEP = .4;
const ALPHABET = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\s'’-]/u;
export function textSteps(ch) {
  return TEXT_PAUSE[ch] ?? (ALPHABET.test(ch) ? LETTER_STEP : 1);
}
/** Seconds behind the text past which the voice drops weak characters (twice this: any but a phrase's last two). */
export const MAX_LAG = 1;
/** Each tone as semitones over the unit, scaled by TONE_AMOUNT; 5 is the neutral tone. */
const TONES = { 1: [.8, .8], 2: [-.6, 1.6], 3: [-1, -1.8, -.6], 4: [1.6, -1.2], 5: [-.8, -.8] };
const TONE_AMOUNT = .35;
const STRESS_ST = 1;
const GAIN = .45;

/* ---------- the voice clock ---------- */

/** When the voice starts each unit, in seconds on one clock; `now` is when the text revealed it. */
export class VoiceClock {
  constructor() { this.reset(0); }
  reset(now) { this.last = -Infinity; this.end = now; this.free = now; this.gap = 0; }
  /** A pause mark revealed: the next unit starts no sooner than this mark's silence after the voice ends. */
  mark(ch) { this.gap += VOICE_GAP[ch] ?? 0; this.free = this.end + this.gap; }
  /** The start of a unit `len` seconds long, or null to drop it; `final` = among its phrase's last two. */
  place(now, { weak, final }, unitsPerSecond, len) {
    const t = Math.max(now, this.last + 1 / unitsPerSecond, this.free);
    const lag = t - now;
    if (!final && (lag > 2 * MAX_LAG || (lag > MAX_LAG && weak))) return null;
    this.last = t; this.end = Math.max(this.end, t + len); this.gap = 0;
    return t;
  }
}

/* ---------- playback ---------- */

/**
 * `sfx` (sound.js) gives the audio output; `onUnit` runs as each unit starts; `base`: where the bank is;
 * `unitsOf(text)`: the units the World gives for `text`.
 */
export function createSpeech(sfx, {
  base = new URL('speech/', import.meta.url).href,
  onUnit = () => {},
  unitsOf = (text) => fetch('/api/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((d) => d.units),
} = {}) {
  let on = false, hz = 400, ups = 13;
  /** The bank once fetched: manifest and encoded audio; `buffer` once decoded. */
  let bank = null, fetching = null, decoding = null;
  /** The text being typed, its units by the index that starts them once the World answered, and reveals waiting for that. */
  let text = '', byAt = null, waiting = [], rnd = 1;
  const clock = new VoiceClock();
  const playing = new Set(), timers = new Set();

  function fetchBank() {
    const get = (name, how) => fetch(new URL(name, new URL(base, location.href))).then((r) => (r.ok ? r[how]() : Promise.reject(new Error(`HTTP ${r.status}`))));
    fetching ??= Promise.all([get(`${BANK}.json`, 'json'), get(`${BANK}.ogg`, 'arrayBuffer')]).then(([manifest, bytes]) => {
      bank = { hz: manifest.hz, units: new Map(Object.entries(manifest.units)), bytes, buffer: null };
    }, (err) => { console.error('说话声没能载入:', err); });
    return fetching;
  }
  /** The output and the decoded bank, or null while speech would not be heard (then the caller babbles). */
  function ready() {
    if (!on) return null;
    if (!bank) { void fetchBank(); return null; }
    const out = sfx.output('talk');
    if (!out) return null;
    if (!bank.buffer) {
      decoding ??= out.ctx.decodeAudioData(bank.bytes.slice(0)).then((b) => { bank.buffer = b; }, (err) => console.error('说话声没能解码:', err));
      return null;
    }
    return out;
  }
  const random = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };

  function play(out, u, t) {
    const [off, len] = bank.units.get(u.key);
    const { ctx, master } = out;
    const rate = hz / bank.hz;
    // the phrase's line: a step up at its start, a slow fall, a rise at a question's end
    const q = /[?？]/.test(u.end), ex = /[!！]/.test(u.end), last = u.pos === u.of - 1;
    let st = (u.pos === 0 ? .8 : 0) - .06 * u.pos + (random() - .5) * .4 + (ex ? 1 : 0) + (u.stress ? STRESS_ST : 0);
    let bend = 0;
    if (q && u.pos === u.of - 2) st += 1.5;
    if (q && last) { st += 2; bend = 3; }
    if (/…/.test(u.end) && last) st -= .8;
    const tone = u.tone ? TONES[u.tone] : [0, 0];
    const curve = new Float32Array(8);
    for (let k = 0; k < 8; k++) {
      const p = k / 7, x = p * (tone.length - 1), a = Math.floor(x), b = Math.min(tone.length - 1, a + 1);
      const ts = (tone[a] + (tone[b] - tone[a]) * (x - a)) * TONE_AMOUNT;
      curve[k] = rate * 2 ** ((st + ts + bend * p) / 12);
    }
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = bank.buffer;
    src.playbackRate.setValueCurveAtTime(curve, t, len / rate);
    g.gain.value = GAIN * (ex ? 1.26 : 1);
    src.connect(g); g.connect(master);
    src.start(t, off, len);
    playing.add(src);
    src.onended = () => playing.delete(src);
    const timer = setTimeout(() => { timers.delete(timer); onUnit(); }, Math.max(0, (t - ctx.currentTime) * 1000));
    timers.add(timer);
  }

  let asked = false;
  /** Asks the World for the units of the text being typed; the reveals waiting meanwhile are spoken once they come. */
  function ask() {
    if (asked || !text) return;
    asked = true;
    const t = text;
    unitsOf(t).then((units) => {
      if (text !== t) return;
      byAt = new Map();
      for (const u of units) { if (!byAt.has(u.at)) byAt.set(u.at, []); byAt.get(u.at).push(u); }
      const out = ready();
      if (out) for (const i of waiting) speak(out, i);
      waiting = [];
    }, (err) => { console.error('说话声没能拆成音节:', err); if (text === t) { byAt = new Map(); waiting = []; } });
  }

  /** Character `i` reaches the voice: its pause mark, then the units it starts. */
  function speak(out, i) {
    const ch = text[i];
    if (VOICE_GAP[ch] !== undefined) clock.mark(ch);
    const now = out.ctx.currentTime + .02;
    if (clock.end < now - 2) clock.reset(now);
    for (const u of byAt.get(i) ?? []) {
      if (!bank.units.has(u.key)) continue;
      const len = bank.units.get(u.key)[1] / (hz / bank.hz);
      const t = clock.place(now, { weak: u.weak, final: u.pos >= u.of - 2 }, ups, len);
      if (t !== null) play(out, u, t);
    }
  }

  return {
    /** `enabled`; `pitchHz`: the voice's pitch; `unitsPerSecond`: most units started a second. */
    configure({ enabled, pitchHz, unitsPerSecond } = {}) {
      if (typeof enabled === 'boolean') { on = enabled; if (on) void fetchBank(); else this.stop(); }
      if (typeof pitchHz === 'number' && pitchHz > 0) hz = pitchHz;
      if (typeof unitsPerSecond === 'number' && unitsPerSecond > 0) ups = unitsPerSecond;
    },
    /** Whether the bubble types with speech's pauses and leaves the sound to it. */
    get active() { return Boolean(ready()); },
    /** The bubble starts typing `t`: while speech is on, its units are asked for now, else at its first reveal. */
    begin(t) {
      if (t === text) return;
      text = t; byAt = null; waiting = []; asked = false;
      if (on) ask();
    },
    /** Character `i` of the text just appeared; false = speech cannot play now, babble instead. */
    reveal(i) {
      const out = ready();
      if (!out) return false;
      if (byAt) speak(out, i); else { waiting.push(i); ask(); }
      return true;
    },
    /** Stops what is playing and what waits to play. */
    stop() {
      for (const s of playing) { try { s.stop(); } catch { /* not started */ } }
      playing.clear();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      clock.reset(0);
      text = ''; byAt = null; waiting = []; asked = false;
    },
  };
}
