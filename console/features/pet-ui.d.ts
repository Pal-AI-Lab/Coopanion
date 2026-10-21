/**
 * Types for the part of the desktop-pet World's `web/ui.js` the console uses: the icons of the
 * pet's menu, for the 「习惯」 page's hover-button picker, and the links in Coo's words on the chat
 * page. The module is plain browser JavaScript; esbuild bundles it into the console from the
 * workspace package.
 */
declare module 'cortico-world-desktop-pet/web/ui.js' {
  export const ICONS: Record<string, string>;
  /** The first `n` characters of `text` (all of it by default) as nodes, written-out http(s) addresses as links. */
  export function linked(text: string, n?: number, doc?: Document): DocumentFragment;
}
