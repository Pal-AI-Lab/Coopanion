/**
 * Types for the parts of the desktop-pet World's web modules the console uses: from `web/ui.js` the
 * icons of the pet's menu, for the 「习惯」 page's hover-button picker, and the links in Coo's words on
 * the chat page; from `web/sound.js` the kinds of the pet's sounds, for the 「习惯」 page's sound
 * switches; from `web/scale-slider.js` the slider of the 「习惯」 page's sizes, 外发光 and 音量; from
 * `web/coo/coo.js` Coo's drawing, for the bubble sample on the 「习惯」 page. The
 * modules are plain browser JavaScript; esbuild bundles them into the console from the workspace package.
 */
declare module 'cortico-world-desktop-pet/web/ui.js' {
  export const ICONS: Record<string, string>;
  /** The narrowest width `el` can take without its text wrapping into more lines; its own width is left as it was. */
  export function balancedWidth(el: HTMLElement): number;
  /** The width a bubble tail's line is drawn at on a display of `dpr` device pixels per pixel. */
  export function tailLine(dpr: number): number;
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

declare module 'cortico-world-desktop-pet/web/coo/coo.js' {
  /** A skin read from anything: unknown fields take the default dress. */
  export function normalizeSkin(raw: unknown): object;
  /** Coo standing with `face` (a FACES key of web/kit/body.js) in `skin`, as SVG markup in Coo's drawing space. */
  export function mini(face: string, skin: object): string;
  /** The CSS variables that color `skin`, light or dark. */
  export function skinVars(skin: object, dark: boolean): string;
  /** How far above the body each head piece reaches, in Coo's drawing units; the bubble points above it. */
  export const HEAD_TOP: Record<string, number>;
}

declare module 'cortico-world-desktop-pet/web/sound.js' {
  /** Each kind of the pet's sounds and the sounds in it; `worlds.desktop-pet.sounds.<kind>` mutes a kind. */
  export const SOUND_KINDS: Record<string, readonly string[]>;
}
