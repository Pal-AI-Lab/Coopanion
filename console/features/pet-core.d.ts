/**
 * Types for the part of the desktop-pet World's `web/pet-core.js` the console uses: the icons of the
 * pet's menu, for the 「习惯」 page's hover-button picker. The module is plain browser JavaScript;
 * esbuild bundles it into the console from the workspace package.
 */
declare module 'cortico-world-desktop-pet/web/pet-core.js' {
  export const ICONS: Record<string, string>;
}
