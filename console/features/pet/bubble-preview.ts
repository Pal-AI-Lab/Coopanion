/**
 * The 气泡 section's sample: Coo's bubbles without the figure, drawn, placed and handled as the pet page does
 * (pet.css `.bubble`, `.heard`, `.status`; pet-app.js `place`, `tailAt`, `placeLines`, `stepDialog`, `stepLines`)
 * in the settings window's colors, Coo's tail pointing down to where its head would be. Without the figure the frame
 * keeps one height in every language. At rest it shows a line of yours and Coo's reply; 「播放示例」 plays one
 * exchange: your line, what Coo is doing, then the reply typed and held line by line, each bubble leaving when its
 * hold runs out. As on the pet, a click closes a bubble (Coo's whole reply, or your line) and the pointer on Coo's line
 * holds it once it is written.
 * A wrapped line takes the narrowest bubble that holds it in as many lines, and a tail's line is as wide as the border
 * is drawn, as on the pet (ui.js balancedWidth, tailLine). Size and text size follow the sliders at once; speed and
 * holds are read when the sample plays.
 */

import { balancedWidth, clamp, ICONS, tailLine } from 'cortico-world-desktop-pet/web/ui.js';
import { prefersStill } from '../../base/motion.ts';
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
const EDGE = 40;
/** At rest a bubble clicked away fades and comes back after this many seconds. */
const BACK_SEC = 1.2;
/** Bubbles up to TAIL_CENTER wide point their tail from their middle, wider ones toward Coo by TAIL_FOLLOW (pet-app.js tailAt). */
const TAIL_CENTER = 70, TAIL_FOLLOW = 130;
/** The width the sample is laid out at before it is scaled to the panel (as wide as the panel at most, .bubble-preview in home.css). */
const STAGE_PX = 440;
/**
 * The stage's height: the sample lines are kept short enough in every language for their tallest bubbles to fit
 * (293px in de and es-419, at the largest text size), so the frame is this high in all of them; it grows, once, only
 * if a language's lines do not fit (see `measure`).
 */
const STAGE_MIN_H = 296;
/** Room kept above the topmost bubble, under 播放示例. */
const PLAY_ROOM = 44;
/** The bubble size slider's steps, and the largest text size (BUBBLE_SIZE_MIN, BUBBLE_SIZE_MAX in the World's config.ts; 5% steps). */
const SIZE_STEPS = Array.from({ length: 17 }, (_, i) => .8 + i * .05), FONT_MAX = 1.6;
/** Where Coo's head would be, from the stage's bottom: Coo's bubble sits above it, centred on the stage, so its tail leans as on the pet. */
const HEAD_BOTTOM = 4, HEAD_X = STAGE_PX / 2 - FACING_SHIFT;
const READ_FILE = 'weather.md';

/** Where the tail's tip sits along a bubble `bw` wide whose left edge is `x` left of Coo (pet-app.js tailAt). */
const tailAt = (bw: number, x: number) => bw / 2 + (clamp(x, 22, bw - 22) - bw / 2) * clamp((bw - TAIL_CENTER) / (TAIL_FOLLOW - TAIL_CENTER), 0, 1);

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
  stage.style.setProperty('--pv-edge', `${EDGE}px`);
  stage.setAttribute('aria-hidden', 'true');
  let stageH = STAGE_MIN_H, measured = false;
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
  frame.append(stage, clock, play);
  el.append(frame);

  /** Shows or hides a bubble at once; `pop` plays its entrance (pet.css `bubble-in`). */
  const show = (bubble: HTMLElement, on: boolean, pop = false) => {
    bubble.classList.remove('is-fading');
    bubble.hidden = !on;
    if (on && pop && !prefersStill(doc.defaultView)) { bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
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
  /**
   * Places the bubbles on a stage `height` high as the pet does over a head at its bottom: Coo's bubble (or the
   * status, the same bubble on the pet) above the head, moved toward the side Coo faces, its tail pointing at the
   * head; your line centred above it, or above the head when Coo's bubble is down. `dt` eases your line; 0 puts it in
   * place. Returns the top of the highest bubble shown.
   */
  const lay = (height: number, dt: number): number => {
    const size = Number(stage.style.getPropertyValue('--bubble-size')) || 1;
    const a = { x: HEAD_X, y: height - HEAD_BOTTOM };
    let highest = height;
    let box: { left: number; top: number; bw: number } | null = null;
    for (const bubble of [say, status]) {
      if (bubble.hidden) continue;
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      const left = clamp(a.x - bw / 2 + FACING_SHIFT, EDGE, Math.max(EDGE, STAGE_PX - bw - EDGE));
      const top = a.y - bh - SAY_UP * size;
      bubble.style.left = `${left}px`; bubble.style.top = `${top}px`;
      bubble.style.setProperty('--tail', `${tailAt(bw, a.x - left)}px`);
      box = { left, top, bw }; highest = Math.min(highest, top);
    }
    if (!said.hidden) {
      const bw = said.offsetWidth, bh = said.offsetHeight;
      const cx = box ? box.left + box.bw / 2 : a.x;
      const bottom = box ? box.top - LINES_GAP * size : a.y - LINES_UP * size;
      const target = { x: clamp(cx - bw / 2, EDGE, Math.max(EDGE, STAGE_PX - bw - EDGE)) - a.x, y: bottom - bh - a.y };
      // a fading line stays where it was
      if (!saidAt || dt <= 0) saidAt = target;
      else if (!fading(said)) { const e = Math.min(1, dt * 12); saidAt = { x: saidAt.x + (target.x - saidAt.x) * e, y: saidAt.y + (target.y - saidAt.y) * e }; }
      said.style.left = `${a.x + saidAt.x}px`; said.style.top = `${a.y + saidAt.y}px`;
      highest = Math.min(highest, bottom - bh);
    }
    return highest;
  };

  /**
   * The stage's height: room for the tallest the bubbles get at the largest text size and any bubble size (a
   * narrower bubble wraps into more lines, a wider one has more padding), your line over each of Coo's lines or the
   * status, in this language. Measured once, so the frame keeps its height while the sliders move.
   */
  const measure = () => {
    const texts = [[...saidText.childNodes], [...sayText.childNodes], [...statusText.childNodes]];
    const shown = [said.hidden, say.hidden, status.hidden];
    const vars = ['--bubble-size', '--bubble-font'].map((name) => stage.style.getPropertyValue(name));
    const tall = 4000;
    stage.style.setProperty('--bubble-font', String(FONT_MAX));
    said.hidden = false;
    statusText.textContent = READ_FILE;
    const widths = [said.style.maxWidth, say.style.maxWidth];
    let room = 0;
    for (const size of SIZE_STEPS) {
      stage.style.setProperty('--bubble-size', String(size));
      fitSaid();
      for (const line of [...S.previewReply, null]) {
        say.hidden = line === null; status.hidden = line !== null;
        if (line !== null) { fitSay(line); sayText.textContent = line; }
        room = Math.max(room, tall - lay(tall, 0));
      }
    }
    [saidText, sayText, statusText].forEach((text, i) => text.replaceChildren(...texts[i]!));
    [said.hidden, say.hidden, status.hidden] = shown;
    [said.style.maxWidth, say.style.maxWidth] = widths;
    ['--bubble-size', '--bubble-font'].forEach((name, i) => stage.style.setProperty(name, vars[i]!));
    stageH = Math.max(STAGE_MIN_H, Math.ceil(room + PLAY_ROOM));
    stage.style.height = `${stageH}px`;
  };
  /** The stage keeps its layout size and scales to the panel, so the bubbles keep their proportions to each other. */
  const fit = () => {
    // laid out only once the page shows it: before that the panel has no width and the text no lines
    if (!frame.clientWidth) return;
    // mounted hidden, the bubbles are fitted here, the first time they have lines
    if (!measured) { measured = true; measure(); refit(); }
    const scale = Math.min(1, frame.clientWidth / STAGE_PX);
    stage.style.setProperty('--pv-scale', String(scale));
    frame.style.height = `${Math.ceil(stageH * scale)}px`;
    lay(stageH, 0);
  };
  const sizes = () => {
    const s = read();
    stage.style.setProperty('--bubble-size', String(s.size));
    stage.style.setProperty('--bubble-font', String(s.font));
    if (frame.clientWidth) refit();
    fit();
  };
  /** Whether your line shows at rest: it follows the 输入气泡 switch. */
  let saidAtRest = true;
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
      lay(stageH, 0);
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
    lay(stageH, dt);
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
