/**
 * Types for the parts of the desktop-pet World's web modules the console uses: from `web/ui.js` the
 * icons of the pet's menu, for the 「习惯」 page's hover-button picker, and the links in Coo's words on
 * the chat page; from `web/sound.js` the kinds of the pet's sounds, for the 「习惯」 page's sound
 * switches; from `web/scale-slider.js` the slider of the 「习惯」 page's sizes, 外发光 and 音量. The
 * modules are plain browser JavaScript; esbuild bundles them into the console from the workspace package.
 */
declare module 'cortico-world-desktop-pet/web/ui.js' {
  export const ICONS: Record<string, string>;
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
