/**
 * The 气泡 section's sample: Coo in its current dress (coo/coo.js `mini`) under its bubbles, drawn as the pet
 * page draws them (pet.css `.bubble`, `.heard`, `.status`) in the settings window's colors. A figure from a
 * pack shows as Coo. At rest it shows a line of yours and Coo's reply; 「播放示例」
 * plays one exchange on the pet page's clock: your line, what Coo is doing, then the reply typed and held
 * beat by beat (pet-app.js stepDialog and stepLines), each bubble leaving when its hold runs out. Size and text size follow the
 * sliders at once; speed and holds are read when the sample plays.
 */

import { ICONS } from 'cortico-world-desktop-pet/web/ui.js';
import { mini, normalizeSkin, skinVars } from 'cortico-world-desktop-pet/web/coo/coo.js';
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
/** Seconds a line takes to fade (pet.css), and how long after the reply is written out an automatic line of yours fades (pet-app.js REPLIED_FADE). */
const FADE_SEC = .4, REPLIED_FADE_SEC = .5;
/** The sample's own pacing: when your line is sent, how long Coo thinks and reads, the rest before the sample settles. */
const SENT_AT = .3, THINK_SEC = 1.2, READ_SEC = 1.4, QUIET_SEC = .9, REST_SEC = .8;
/** The width the sample is laid out at before it is scaled to the panel: a little wider than Coo's widest bubble at 100%. */
const STAGE_PX = 340;
/** The stage's height: room for the bubbles at the largest size and text size, so the frame keeps its height. */
const STAGE_H = 380;
/** Coo's drawing space with room above for the tallest head piece (HEAD_TOP in coo.js). */
const COO_VIEWBOX = '14 -40 228 300';
const READ_FILE = 'weather.md';

/** One of Coo's lines: the typing steps after each character, when it starts, and when its hold ends. */
interface Beat { chars: string[]; steps: number[]; start: number; written: number; end: number }

export interface BubblePreview {
  el: HTMLElement;
  /** Draws the size, text size and which bubbles show again from the settings. */
  refresh(): void;
  /** Dresses Coo as the pet panel's state says (`skin`). */
  setSkin(skin: unknown): void;
}

export function bubblePreview(doc: Document, signal: AbortSignal, read: () => BubbleSettings): BubblePreview {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
    const el = doc.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el;
  };
  const el = h('div', 'bubble-preview');
  const frame = h('div', 'bubble-preview-frame');
  const stage = h('div', 'bubble-preview-stage');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.width = `${STAGE_PX}px`; stage.style.height = `${STAGE_H}px`;
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
  const coo = h('div', 'bubble-preview-coo');
  stage.append(said, status, say, coo);
  let skin = normalizeSkin(null), face = '', drawn = '';
  /** Draws Coo with `next` face in the current dress, in the window's light or dark colors; the same drawing is not redone. */
  const pose = (next: string) => {
    face = next;
    const dark = doc.defaultView?.getComputedStyle(doc.documentElement).colorScheme.includes('dark') ?? false;
    const key = `${next}|${dark}|${JSON.stringify(skin)}`;
    if (key === drawn) return;
    drawn = key;
    coo.innerHTML = `<svg viewBox="${COO_VIEWBOX}" style="${skinVars(skin, dark)}">${mini(next, skin)}</svg>`;
  };
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
  const fade = (bubble: HTMLElement) => { if (!bubble.hidden) bubble.classList.add('is-fading'); };

  /** The stage keeps its layout size and scales to the panel, so the bubbles keep their proportions to each other. */
  const fit = () => {
    const scale = Math.min(1, frame.clientWidth / STAGE_PX);
    stage.style.setProperty('--pv-scale', String(scale));
    frame.style.height = `${Math.ceil(STAGE_H * scale)}px`;
  };
  const sizes = () => {
    const s = read();
    stage.style.setProperty('--bubble-size', String(s.size));
    stage.style.setProperty('--bubble-font', String(s.font));
    fit();
  };
  /** At rest: your line if it shows, and Coo's first line written out. */
  const rest = () => {
    playing = false;
    clock.hidden = true;
    show(said, read().said);
    show(status, false);
    sayText.textContent = S.previewReply[0] ?? '';
    show(say, true);
    pose('neutral');
    sizes();
  };

  /** Each press starts a new run; an older run's frames stop. */
  let generation = 0, playing = false;
  function start(): void {
    const s = read();
    const run = ++generation;
    playing = true;
    // the timeline, in seconds from the press
    const speakAt = SENT_AT + (s.status ? THINK_SEC + READ_SEC : QUIET_SEC);
    let at = speakAt;
    const beats: Beat[] = S.previewReply.map((text, i, all) => {
      const chars = [...text], steps: number[] = [];
      let total = 0;
      for (const ch of chars) { total += PAUSE.test(ch) ? 5 : 1; steps.push(total); }
      const start = at, written = start + total / (TYPING_CPS * s.speed);
      const hold = s.sayHoldSec || autoHold(text.length, i === all.length - 1, s.speed);
      at = written + hold;
      return { chars, steps, start, written, end: at };
    });
    const replyEnd = at;
    // automatic: your line leaves a moment after the reply is written out, before the reply (pet-app.js stepLines)
    const saidEnd = s.saidHoldSec ? SENT_AT + s.saidHoldSec : Math.min(beats.at(-1)!.written + REPLIED_FADE_SEC, replyEnd);
    const end = Math.max(replyEnd, s.said ? saidEnd : 0) + FADE_SEC + REST_SEC;
    show(said, false); show(status, false); show(say, false);
    clock.hidden = false;
    const t0 = performance.now();
    let speaking = false;
    const frameStep = (now: number) => {
      if (signal.aborted || run !== generation) return;
      const t = (now - t0) / 1000;
      clock.textContent = `${t.toFixed(1)} s`;
      if (s.said) {
        if (t >= SENT_AT && t < saidEnd) show(said, true, said.hidden);
        else if (t >= saidEnd) fade(said);
      }
      pose(t >= SENT_AT && t < speakAt ? 'thinking' : 'neutral');
      if (s.status && t >= SENT_AT && t < speakAt) {
        const reading = t >= SENT_AT + THINK_SEC;
        const kind = reading ? 'read' : 'think';
        if (status.dataset.kind !== kind || status.hidden) {
          status.dataset.kind = kind;
          statusIcon.innerHTML = ICONS[`status_${kind}`] ?? '';
          statusText.textContent = reading ? READ_FILE : '';
          show(status, true, status.hidden);
        }
      } else if (!status.hidden) show(status, false);
      const i = beats.findIndex(b => t >= b.start && t < b.end);
      if (i >= 0) {
        const beat = beats[i]!;
        if (!speaking) { speaking = true; show(say, true, true); }
        const steps = (t - beat.start) * TYPING_CPS * s.speed;
        let n = 0;
        while (n < beat.steps.length && beat.steps[n]! <= steps) n++;
        sayText.textContent = beat.chars.slice(0, n).join('');
        if (n < beat.chars.length) sayText.append(h('span', 'pv-caret'));
      } else if (t >= replyEnd) fade(say);
      if (t >= end) { rest(); return; }
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
    refresh() { sizes(); pose(face); if (!playing) show(said, read().said); },
    setSkin(raw) { skin = normalizeSkin(raw); pose(face); },
  };
}
