/**
 * Types for the parts of the desktop-pet World's web modules the console uses: from `web/ui.js` the
 * icons of the pet's menu, for the 「习惯」 page's hover-button picker, the links in Coo's words on
 * the chat page, and how bubbles are sized and their tails placed, for the 「习惯」 page's bubble sample;
 * from `web/sound.js` the kinds of the pet's sounds, for the 「习惯」 page's sound switches; from
 * `web/scale-slider.js` the slider of the 「习惯」 page's sizes, 外发光 and 音量; and the motion the
 * window shares with the pet (docs/DEVELOPMENT.md「动画与动态效果」): the level (`web/motion-level.js`), frame
 * motion (`web/motion-frames.js`), showing and hiding (`web/show-hide.js`) and dragging (`web/drag.js`). The modules
 * are plain browser JavaScript; esbuild bundles them into the console from the workspace package.
 */
declare module 'cortico-world-desktop-pet/web/ui.js' {
  export const ICONS: Record<string, string>;
  /** The narrowest width `el` can take without its text wrapping into more lines; its own width is left as it was. */
  export function balancedWidth(el: HTMLElement): number;
  /** The width a bubble tail's line is drawn at on a display of `dpr` device pixels per pixel. */
  export function tailLine(dpr: number): number;
  /** Where a bubble tail's tip sits along a bubble `bw` wide whose left edge is `x` left of Coo, at bubble size `size`. */
  export function tailAt(bw: number, x: number, size?: number): number;
  /** `v` held between `lo` and `hi`. */
  export function clamp(v: number, lo: number, hi: number): number;
  /** The first `n` characters of `text` (all of it by default) as nodes, written-out http(s) addresses as links. */
  export function linked(text: string, n?: number, doc?: Document): DocumentFragment;
}

declare module 'cortico-world-desktop-pet/web/scale-slider.js' {
  export interface ScaleSliderOptions {
    min: number;
    /** Where the divider sits: the end of the main stretch; at `max`, one plain stretch. */
    soft: number;
    max: number;
    label: string;
    /** One step of the value; by default .05 up to `soft` and .1 past it. */
    step?: number;
    /** The value as read aloud; a percentage by default. */
    format?(value: number): string;
    /** The root's class, which the page styles it by (`.companion-scale` in the settings window). */
    className?: string;
    /** Pixels the bar may take in its row. */
    room(): number;
    /** While the value changes (dragging, keys). */
    onInput(value: number): void;
    /** Once a drag or a key press ends. */
    onChange(value: number): void;
  }
  export interface ScaleSlider {
    el: HTMLElement;
    readonly value: number;
    /** Whether the person is dragging it now. */
    readonly active: boolean;
    /** A value from outside; the first is drawn at rest at once, later ones move the bar as a step does. */
    set(value: number): void;
    /** Draws again for a new `room()`. */
    relayout(): void;
  }
  export function scaleSlider(doc: Document, o: ScaleSliderOptions): ScaleSlider;
}

declare module 'cortico-world-desktop-pet/web/sound.js' {
  /** Each kind of the pet's sounds and the sounds in it; `worlds.desktop-pet.sounds.<kind>` mutes a kind. */
  export const SOUND_KINDS: Record<string, readonly string[]>;
}

declare module 'cortico-world-desktop-pet/web/motion-level.js' {
  export type MotionLevel = 'low' | 'medium' | 'high';
  export type MotionChoice = 'system' | MotionLevel;
  /** The level for `win`: its choice, or the system's when the choice is 'system'. */
  export function motionLevel(win: Window | null | undefined): MotionLevel;
  /** Sets `win`'s choice (anything but a level counts as 'system') and applies it. */
  export function setMotionChoice(win: Window, choice: MotionChoice | string): void;
  /** Writes `data-motion` on `win`'s root now and whenever the level changes. */
  export function watchMotion(win: Window): void;
}

declare module 'cortico-world-desktop-pet/web/motion-frames.js' {
  /** Grows `el` from its old size (`w`/`h` px) to its current one; nothing at low motion or without a change. */
  export function growFrom(el: HTMLElement, was: { w?: number; h?: number }, opts?: { duration?: number; easing?: string; overshoots?: boolean }): Animation | undefined;
  /** A duration `el` gets from the stylesheet as a custom property (`160ms`, `.16s`), in ms; `fallback` without one. */
  export function cssMs(el: Element | null | undefined, name: string, fallback: number): number;
  /** How far a change started at `start` and running `ms` is at `now`, 0–1, linear; 1 at low motion. */
  export function progress(start: number, ms: number, now: number, win?: Window | null): number;
  /** The share of the gap to a target one frame of `dt` seconds closes, by `rate` per second; 1 at low motion. */
  export function approachShare(rate: number, dt: number, win?: Window | null): number;
  /** From `from` to `to` over `ms`; at `to` at once at low motion, without overshoot at medium. */
  export function tween(from: number, to: number, ms: number, opts?: { ease?: (k: number) => number; overshoots?: boolean; start?: number; win?: Window | null }): { at(now: number): number; done(now: number): boolean };
  /** Characters of `length` shown after `elapsed` seconds at `perSecond`; all of them at low motion. */
  export function typeOut(length: number, perSecond: number, elapsed: number, win?: Window | null): number;
}

declare module 'cortico-world-desktop-pet/web/show-hide.js' {
  export interface ShowHide {
    readonly hidden: boolean;
    readonly leaving: boolean;
    /** Shows it from the start of its entrance. */
    show(): void;
    /** Shows it without an entrance; one leaving is called back. */
    reveal(): void;
    /** Plays its exit for `ms`, then hides it; at once at low motion or when `now`. */
    hide(ms: number, now?: boolean): void;
    hideNow(): void;
    /** Calls back an exit under way. */
    stay(): void;
  }
  /** Entrance (`entering`, `enterMs`) and exit (`leaving`) for `el`; hidden by `hiddenClass` or the `hidden` attribute. */
  export function showHide(el: HTMLElement, opts?: { enterMs?: () => number; hiddenClass?: string | null }): ShowHide;
}

declare module 'cortico-world-desktop-pet/web/drag.js' {
  export interface DragItemsOptions {
    axis?: 'x' | 'y';
    pick(target: HTMLElement): HTMLElement | null;
    lifted?(el: HTMLElement): void;
    locate(at: number): void;
    drop(el: HTMLElement, copyAt: number): void;
    cancel(): void;
    scroller: HTMLElement | (() => HTMLElement);
    copyClass: string;
    /** A positioned box the copy is laid in; without one the copy is fixed in the window, inside the scroller. */
    layer?: HTMLElement;
  }
  /** Reordering by dragging, down (`y`) or across (`x`). */
  export function dragItems(root: HTMLElement, opts: DragItemsOptions, signal?: AbortSignal): void;
  /** An element's box without the slide it may be in the middle of. */
  export function settledBox(el: HTMLElement): { top: number; bottom: number; height: number; left: number; right: number; width: number };
  /** Slides `el` from `delta` px along the axis to its place; nothing at low motion. */
  export function slideIn(el: HTMLElement, delta: number, axis?: 'x' | 'y', id?: string): void;
  /** Moves the dragged element's empty place to `next` in `parent`; the `moving` elements slide aside. */
  export function moveGap(gap: HTMLElement, parent: HTMLElement, next: Element | null, moving: readonly HTMLElement[], axis?: 'x' | 'y'): void;
}
