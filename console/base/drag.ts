/**
 * Reordering a list by dragging, down: the desktop pet's web/drag.js (shared with its dressing page, which drags
 * across), with the copy laid in the list's own positioned box. The pressed element lifts out as a copy that follows
 * the pointer up and down with the pointer itself hidden, and stays behind as an empty place the list moves to where
 * it would land (see moveGap). Near the list's top or bottom the list scrolls. Esc, a cancelled pointer or the window
 * losing focus cancels; a drag the page is left in the middle of just ends, so the pointer shows again. The list
 * decides where things land and what a drop means.
 */
import { dragItems, moveGap as moveGapAlong, settledBox as settled } from 'cortico-world-desktop-pet/web/drag.js';

export interface DragListOptions {
  /** The element a press on `target` lifts, or null when this press does not drag (a control, a filtered view). */
  pick(target: HTMLElement): HTMLElement | null;
  /** Called once the press has moved far enough to be a drag. */
  lifted?(el: HTMLElement): void;
  /** Where a drop at viewport `y` would land: called on every move and every scroll step. */
  locate(y: number): void;
  /** The drop. The copy is gone by now; `copyTop` is where it showed, to slide the element in from. */
  drop(el: HTMLElement, copyTop: number): void;
  /** A drag that ended without a drop (Esc, a cancelled pointer, the window losing focus). */
  cancel(): void;
  /** The positioned box the copy is laid in; the copy stays inside its content, so the list cannot grow under it. */
  layer: HTMLElement;
  /** The list that scrolls while the pointer is near its top or bottom. Give it overflow-anchor: none, or moving the gap scrolls it. */
  scroller: HTMLElement;
  /** The copy's class, for its look. */
  copyClass: string;
}

export function dragList(root: HTMLElement, opts: DragListOptions, signal: AbortSignal): void {
  dragItems(root, { ...opts, axis: 'y' }, signal);
}

/** An element's box without the slide it may be in the middle of, so a drop target does not chase the animation. */
export function settledBox(el: HTMLElement): { top: number; bottom: number; height: number } {
  return settled(el);
}

/** Moves the dragged element's empty place to `next` in `parent`; the `moving` elements it passes slide aside. */
export function moveGap(gap: HTMLElement, parent: HTMLElement, next: Element | null, moving: readonly HTMLElement[]): void {
  moveGapAlong(gap, parent, next, moving, 'y');
}
