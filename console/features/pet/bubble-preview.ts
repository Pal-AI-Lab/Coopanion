/**
 * The 气泡 section's sample: Coo's bubbles without the figure, drawn, placed and handled as the pet page does
 * (pet.css `.bubble`, `.heard`, `.status`; pet-app.js `place`, `placeLines`, `stepDialog`, `stepLines`; ui.js `tailAt`)
 * in the settings window's colors, Coo's tail pointing down to where its head would be. 播放示例 and the clock sit
 * under the frame; the frame has one height for every size and language, the bubbles centred in it.
 * At rest it shows a line of yours and Coo's reply; 「播放示例」 plays one exchange: your line, what Coo is doing,
 * then the reply typed and held line by line, each bubble leaving when its hold runs out. As on the pet, a click
 * closes a bubble (Coo's whole reply, or your line) and the pointer on Coo's line holds it once it is written.
 * A wrapped line takes the narrowest bubble that holds it in as many lines, and a tail's line is as wide as the border
 * is drawn, as on the pet (ui.js balancedWidth, tailLine). Size and text size follow the sliders at once; speed and
 * holds are read when the sample plays.
 */

import { balancedWidth, clamp, ICONS, tailAt, tailLine } from 'cortico-world-desktop-pet/web/ui.js';
import { motionLevel } from '../../base/motion.ts';
import { icon } from '../../base/ui/icons.ts';
import { S } from './strings.ts';

export interface BubbleSettings {
  size: number;
  font: number;
  speed: number;
  /** Seconds each of Coo's lines stays once written; 0 for automatic. */
  sayHoldSec: number;
  /** Seconds your line stays from sending; 0 to leave with the reply. */
  saidHoldSec: number;
  status: boolean;
  said: boolean;
}

/** Characters a bubble types a second at bubble speed 1 (pet-app.js typeText). */
const TYPING_CPS = 20;
/** The automatic hold of a written line: longer for the last line of a speech (pet-app.js stepDialog). */
const autoHold = (length: number, last: boolean, speed: number) => (last ? 1.6 + length * .07 : .9 + length * .03) / speed;
/** The pet page's punctuation pause: such a character takes five steps of typing (pet-app.js PAUSE). */
const PAUSE = /[,.!?;:…，。！？；：、]/;
/** Seconds a bubble takes to fade (pet.css), and how long after the reply is written out an automatic line of yours fades (pet-app.js REPLIED_FADE). */
const FADE_SEC = .4, REPLIED_FADE_SEC = .5;
/** The sample's own pacing: when your line is sent, how long Coo thinks and reads, the rest before the sample settles. */
const SENT_AT = .3, THINK_SEC = 1.2, READ_SEC = 1.4, QUIET_SEC = .9, REST_SEC = .8;
/** The pet's placing, in pixels at bubble size 1 (pet-app.js): Coo's bubble above the head and moved toward where Coo faces, your line above it or above the head. */
const SAY_UP = 18, FACING_SHIFT = 26, LINES_UP = 46, LINES_GAP = 8;
/** How far bubbles keep from the sample's sides: a wide line stops short of them instead of filling the frame (`--pv-edge` in home.css). */
const EDGE = 20;
/** At rest a bubble clicked away fades and comes back after this many seconds. */
const BACK_SEC = 1.2;
/**
 * The width the sample is laid out at before it is scaled to the panel (as wide as the panel at most, .bubble-preview in
 * home.css): Coo's bubble at its widest (300px at bubble size 1.6) and EDGE on each side, so no bubble is narrowed by
 * the frame. The sample lines are short enough to take two lines at most at any sizes, in every language.
 */
const STAGE_PX = 300 * 1.6 + 2 * EDGE;
/**
 * The stage's height, one for every size and language: the tallest picture the sample shows, at any bubble and text
 * size in any of the 11 languages, centred, with ROOM above and below it (236 for en at bubble size 1.05 and text
 * size 1.6, in Windows' fonts). The sample lines take two lines at most there; where another system's fonts wrap one
 * into a third, the stage grows once to hold it (`stageHeight`).
 */
const STAGE_H = 236, ROOM = 12;
/** The bubble and text size sliders' range and step (BUBBLE_SIZE_MIN and BUBBLE_SIZE_MAX in the World's config.ts). */
const SIZE_MIN = .8, SIZE_MAX = 1.6, SIZE_STEP = .05;
/** Where Coo's head would be across the stage: Coo's bubble sits above it centred on the stage, so its tail leans as on the pet. */
const HEAD_X = STAGE_PX / 2 - FACING_SHIFT;
/** How far a tail's tip reaches below its bubble at bubble size `size` (pet.css: 11.5px drawn from 0.5px inside the 2.5px border). */
const tailBelow = (size: number) => 11.5 * size - 3;
const READ_FILE = 'weather.md';

export interface BubblePreview {
  el: HTMLElement;
  /** Draws the size, text size and which bubbles show again from the settings. */
  refresh(): void;
}

export function bubblePreview(doc: Document, signal: AbortSignal, read: () => BubbleSettings): BubblePreview {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
    const el = doc.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el;
  };
  const el = h('div', 'bubble-preview');
  const frame = h('div', 'bubble-preview-frame');
  const stage = h('div', 'bubble-preview-stage');
  stage.style.width = `${STAGE_PX}px`;
  el.style.setProperty('--pv-stage', `${STAGE_PX}px`);
  stage.style.setProperty('--pv-edge', `${EDGE}px`);
  stage.setAttribute('aria-hidden', 'true');
  /** The stage's height in this window (`stageHeight`), and how far down Coo's head would be for the current sizes (`centre`). */
  let stageH = STAGE_H, headY = 0;
  stage.style.height = `${stageH}px`;
  /** Whether your line shows at rest: it follows the 输入气泡 switch. */
  let saidAtRest = true;
  const clock = h('span', 'bubble-preview-clock');
  const said = h('div', 'pv-bubble pv-heard');
  const saidText = h('p', 'pv-text', S.previewSaid);
  said.append(saidText);
  const status = h('div', 'pv-bubble pv-status');
  const statusIcon = h('span', 'pv-status-icon'), statusText = h('span', 'pv-status-text');
  status.append(statusIcon, statusText);
  const say = h('div', 'pv-bubble pv-say');
  const sayText = h('p', 'pv-text');
  say.append(sayText);
  stage.append(said, status, say);
  const play = h('button', 'btn sm bubble-preview-play');
  play.type = 'button';
  play.append(icon(doc, 'play'), h('span', '', S.previewPlay));
  const bar = h('div', 'bubble-preview-bar');
  bar.append(play, clock);
  frame.append(stage);
  el.append(frame, bar);

  /** Shows or hides a bubble at once; `pop` plays its entrance (pet.css `bubble-in`). */
  const show = (bubble: HTMLElement, on: boolean, pop = false) => {
    bubble.classList.remove('is-fading');
    bubble.hidden = !on;
    if (on && pop && motionLevel(doc.defaultView) !== 'low') { bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
  };
  const fading = (bubble: HTMLElement) => bubble.classList.contains('is-fading');
  const fade = (bubble: HTMLElement) => { if (!bubble.hidden) bubble.classList.add('is-fading'); };
  /** Coo's bubble for `line`, as narrow as the whole line allows, measured with the caret (pet-app.js fitLine); the text is left empty. */
  const fitSay = (line: string) => {
    sayText.textContent = line;
    sayText.append(h('span', 'pv-caret'));
    say.style.maxWidth = `${balancedWidth(say)}px`;
    sayText.replaceChildren();
  };
  /** Your line's bubble, as narrow as its text allows (pet-app.js drawLine). */
  const fitSaid = () => { said.style.maxWidth = `${balancedWidth(said)}px`; };
  /** The bubbles up, fitted again: after the sizes change their widths do (pet-app.js refitBubbles). Coo's is fitted to its whole line, what is typed of it kept. */
  const refit = () => {
    if (!said.hidden) fitSaid();
    if (say.hidden) return;
    const typed = [...sayText.childNodes];
    fitSay(run ? S.previewReply[run.beat] ?? '' : sayText.textContent ?? '');
    sayText.replaceChildren(...typed);
  };
  /** The tails' line follows the width the border is drawn at, which changes with the display's scale. */
  const watchTailLine = () => {
    const view = doc.defaultView;
    if (!view || signal.aborted) return;
    stage.style.setProperty('--tail-line', `${tailLine(view.devicePixelRatio || 1)}px`);
    view.matchMedia?.(`(resolution: ${view.devicePixelRatio || 1}dppx)`).addEventListener('change', watchTailLine, { once: true, signal });
  };
  watchTailLine();

  /** Your line's place relative to Coo's head, eased toward where it belongs as the pet eases it (pet-app.js placeLines). */
  let saidAt: { x: number; y: number } | null = null;
  const sizeNow = () => Number(stage.style.getPropertyValue('--bubble-size')) || 1;
  /**
   * Places the bubbles as the pet does over a head `headY` down the stage: Coo's bubble (or the status, the same bubble
   * on the pet) above the head, moved toward the side Coo faces, its tail pointing at the head; your line centred above
   * it, or above the head when Coo's bubble is down. `dt` eases your line; 0 puts it in place.
   */
  const lay = (dt: number) => {
    const size = sizeNow();
    const a = { x: HEAD_X, y: headY };
    let box: { left: number; top: number; bw: number } | null = null;
    for (const bubble of [say, status]) {
      if (bubble.hidden) continue;
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      const left = clamp(a.x - bw / 2 + FACING_SHIFT, EDGE, Math.max(EDGE, STAGE_PX - bw - EDGE));
      const top = a.y - bh - SAY_UP * size;
      bubble.style.left = `${left}px`; bubble.style.top = `${top}px`;
      bubble.style.setProperty('--tail', `${tailAt(bw, a.x - left, size)}px`);
      box = { left, top, bw };
    }
    if (!said.hidden) {
      const bw = said.offsetWidth, bh = said.offsetHeight;
      const cx = box ? box.left + box.bw / 2 : a.x;
      const bottom = box ? box.top - LINES_GAP * size : a.y - LINES_UP * size;
      const target = { x: clamp(cx - bw / 2, EDGE, Math.max(EDGE, STAGE_PX - bw - EDGE)) - a.x, y: bottom - bh - a.y };
      // a fading line stays where it was
      if (!saidAt || dt <= 0) saidAt = target;
      else if (!fading(said)) { const e = motionLevel(doc.defaultView) === 'low' ? 1 : Math.min(1, dt * 12); saidAt = { x: saidAt.x + (target.x - saidAt.x) * e, y: saidAt.y + (target.y - saidAt.y) * e }; }
      said.style.left = `${a.x + saidAt.x}px`; said.style.top = `${a.y + saidAt.y}px`;
    }
  };

  /**
   * Bubbles the sample measures with, never shown: measuring with the bubbles on show would hide and show them
   * again, and each showing replays their entrance.
   */
  const probe = (cls: string) => {
    const bubble = h('div', `pv-bubble ${cls}`), text = h('p', 'pv-text');
    bubble.append(text);
    bubble.style.visibility = 'hidden';
    bubble.setAttribute('aria-hidden', 'true');
    stage.append(bubble);
    return { bubble, text };
  };
  const saidProbe = probe('pv-heard'), sayProbe = probe('pv-say');
  /** The probes' heights for your line and for Coo's line `line`, with its caret, at the sizes set on the stage. */
  const saidHeight = () => { saidProbe.text.textContent = S.previewSaid; return saidProbe.bubble.offsetHeight; };
  const sayHeight = (line: string) => {
    sayProbe.text.textContent = line;
    sayProbe.text.append(h('span', 'pv-caret'));
    return sayProbe.bubble.offsetHeight;
  };
  /**
   * The stage's height in this window: STAGE_H, or more where its fonts make the tallest picture need it. Every picture
   * has the resting one's bottom (the tail's tip) and is centred as it is (`centre`), so one `p` high needs
   * 2 × ROOM + 2p − rest. Measured once, at the largest text size and every bubble size, so it never follows the sliders.
   */
  const stageHeight = () => {
    const keep = ['--bubble-size', '--bubble-font'].map((name) => stage.style.getPropertyValue(name));
    stage.style.setProperty('--bubble-font', String(SIZE_MAX));
    let need = 0;
    for (let size = SIZE_MIN; size <= SIZE_MAX + 1e-9; size += SIZE_STEP) {
      stage.style.setProperty('--bubble-size', String(size));
      const saidRoom = saidHeight() + LINES_GAP * size, says = S.previewReply.map(sayHeight), tail = tailBelow(size);
      for (const above of [saidRoom, 0]) {
        const rest = above + (says[0] ?? 0) + tail;
        for (const tall of says) need = Math.max(need, 2 * ROOM + 2 * (above + tall + tail) - rest);
      }
    }
    ['--bubble-size', '--bubble-font'].forEach((name, i) => stage.style.setProperty(name, keep[i]!));
    return Math.max(STAGE_H, Math.ceil(need));
  };
  /**
   * Puts the head where the resting picture (your line, if 输入气泡 is on, over Coo's first line, to its tail's tip)
   * comes out centred on the stage, so a size change grows the picture about the middle. Its height does not depend
   * on how narrow the bubbles are fitted: that keeps their number of lines.
   */
  const centre = () => {
    const size = sizeNow();
    const rest = (read().said ? saidHeight() + LINES_GAP * size : 0) + sayHeight(S.previewReply[0] ?? '') + tailBelow(size);
    headY = stageH / 2 + rest / 2 - tailBelow(size) + SAY_UP * size;
  };
  /** The stage keeps its layout size and scales to the panel, so the bubbles keep their proportions to each other. */
  let fitted = false;
  const fit = () => {
    // laid out only once the page shows it: before that the panel has no width and the text no lines
    if (!frame.clientWidth) return;
    const scale = Math.min(1, frame.clientWidth / STAGE_PX);
    // mounted hidden, the stage is measured and the bubbles fitted here, the first time they have lines
    if (!fitted) { fitted = true; stageH = stageHeight(); stage.style.height = `${stageH}px`; refit(); }
    centre();
    stage.style.setProperty('--pv-scale', String(scale));
    frame.style.height = `${Math.ceil(stageH * scale)}px`;
    lay(0);
  };
  const sizes = () => {
    const s = read();
    stage.style.setProperty('--bubble-size', String(s.size));
    stage.style.setProperty('--bubble-font', String(s.font));
    if (frame.clientWidth) refit();
    fit();
  };
  /** At rest: your line if it shows, and Coo's first line written out. */
  const rest = () => {
    run = null;
    clock.hidden = true;
    saidAtRest = read().said;
    show(said, saidAtRest);
    show(status, false);
    sayText.textContent = S.previewReply[0] ?? '';
    show(say, true);
    saidAt = null;
    sizes();
  };

  /** One exchange, stepped frame by frame as the pet steps its bubbles (pet-app.js stepDialog, stepLines). */
  interface Run {
    s: BubbleSettings; t: number; speakAt: number;
    /** Coo's line under way: its index, characters typed (in steps), whether it is written, when its hold ends. */
    beat: number; typed: number; written: boolean; holdUntil: number;
    /** When the last line was written out, when the reply closed, and when your line was settled or closed. */
    writtenAt?: number; endedAt?: number; saidAt?: number; saidGone?: number;
    /** The pointer came onto Coo's line from outside it: the hold waits while it stays (pet-app.js heldByCursor). */
    holding: boolean;
  }
  let run: Run | null = null, generation = 0;
  const pointer = { over: false, was: false };
  say.addEventListener('pointerenter', () => { pointer.over = true; }, { signal });
  say.addEventListener('pointerleave', () => { pointer.over = false; if (run) run.holding = false; }, { signal });
  /** At rest a bubble clicked away comes back, so the picture is whole again; playing, it stays closed as on the pet. */
  const comeBack = (bubble: HTMLElement) => {
    const mine = generation;
    doc.defaultView!.setTimeout(() => {
      if (signal.aborted || run || mine !== generation || (bubble === said && !saidAtRest)) return;
      show(bubble, true, true);
      refit();
      lay(0);
    }, BACK_SEC * 1000);
  };
  // a click closes Coo's reply whole, or your line, as on the pet
  say.addEventListener('click', () => {
    if (say.hidden || fading(say)) return;
    fade(say);
    if (!run) comeBack(say);
    else if (run.endedAt === undefined) run.endedAt = run.t;
  }, { signal });
  said.addEventListener('click', () => {
    if (said.hidden || fading(said)) return;
    fade(said);
    if (!run) comeBack(said);
    else run.saidGone ??= run.t;
  }, { signal });

  function step(r: Run, dt: number): boolean {
    const { s } = r;
    r.t += dt;
    const t = r.t;
    clock.textContent = `${t.toFixed(1)} s`;
    if (s.said && r.saidAt === undefined && t >= SENT_AT) { r.saidAt = t; show(said, true, true); fitSaid(); }
    if (s.status && t >= SENT_AT && t < r.speakAt && r.endedAt === undefined) {
      const reading = t >= SENT_AT + THINK_SEC;
      const kind = reading ? 'read' : 'think';
      if (status.dataset.kind !== kind || status.hidden) {
        status.dataset.kind = kind;
        statusIcon.innerHTML = ICONS[`status_${kind}`] ?? '';
        statusText.textContent = reading ? READ_FILE : '';
        show(status, true, status.hidden);
      }
    } else if (!status.hidden) show(status, false);
    // Coo's reply: each line typed at the bubble speed, then held; the pointer on it holds it once it is written
    if (t >= r.speakAt && r.endedAt === undefined) {
      const lines = S.previewReply, line = lines[r.beat]!, chars = [...line];
      if (say.hidden) { show(say, true, true); fitSay(line); }
      if (!r.written) {
        r.typed += dt * TYPING_CPS * s.speed;
        let n = 0, used = 0;
        while (n < chars.length && used + (PAUSE.test(chars[n]!) ? 5 : 1) <= r.typed) used += PAUSE.test(chars[n++]!) ? 5 : 1;
        sayText.textContent = chars.slice(0, n).join('');
        if (n < chars.length) sayText.append(h('span', 'pv-caret'));
        else {
          r.written = true;
          const last = r.beat === lines.length - 1;
          r.holdUntil = t + (s.sayHoldSec || autoHold(line.length, last, s.speed));
          if (last) r.writtenAt = t;
        }
      } else {
        if (pointer.over && (r.holding || !pointer.was)) r.holding = true;
        if (r.holding) r.holdUntil += dt;
        if (t >= r.holdUntil) {
          if (r.beat < lines.length - 1) { r.beat++; r.typed = 0; r.written = false; fitSay(lines[r.beat]!); }
          else { r.endedAt = t; fade(say); }
        }
      }
    }
    pointer.was = pointer.over;
    // your line: a fixed hold from when it settled, or automatic, a moment after the reply is written out or closed
    if (r.saidAt !== undefined && r.saidGone === undefined) {
      const done = Math.min(r.writtenAt ?? Infinity, r.endedAt ?? Infinity);
      if (s.saidHoldSec ? t >= r.saidAt + s.saidHoldSec : t >= done + REPLIED_FADE_SEC) { r.saidGone = t; fade(said); }
    }
    lay(dt);
    const saidDone = !s.said || r.saidGone !== undefined;
    const last = Math.max(r.endedAt ?? Infinity, saidDone ? r.saidGone ?? 0 : Infinity);
    return t < last + FADE_SEC + REST_SEC;
  }

  function start(): void {
    const s = read();
    const mine = ++generation;
    run = { s, t: 0, speakAt: SENT_AT + (s.status ? THINK_SEC + READ_SEC : QUIET_SEC), beat: 0, typed: 0, written: false, holdUntil: 0, holding: false };
    show(said, false); show(status, false); show(say, false);
    saidAt = null;
    clock.hidden = false;
    let last = performance.now();
    const frameStep = (now: number) => {
      if (signal.aborted || mine !== generation || !run) return;
      const dt = Math.min(.1, (now - last) / 1000);
      last = now;
      if (!step(run, dt)) { rest(); return; }
      doc.defaultView!.requestAnimationFrame(frameStep);
    };
    doc.defaultView!.requestAnimationFrame(frameStep);
  }
  play.addEventListener('click', start, { signal });
  const view = doc.defaultView;
  if (view?.ResizeObserver) {
    const observer = new view.ResizeObserver(fit);
    observer.observe(frame);
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }
  rest();
  return {
    el,
    refresh() {
      // the 输入气泡 switch shows or hides your line at rest; shown, it is fitted with the sizes
      if (!run && read().said !== saidAtRest) { saidAtRest = read().said; show(said, saidAtRest); }
      sizes();
    },
  };
}
