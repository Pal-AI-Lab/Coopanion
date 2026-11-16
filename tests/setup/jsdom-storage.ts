// Vitest preserves Node's storage globals; browser tests use their jsdom window's storage.
declare const jsdom: { window: { localStorage: unknown; sessionStorage: unknown; Element: { prototype: object } } } | undefined;
if (typeof jsdom !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, { value: jsdom.window[key], configurable: true, writable: true });
  }
  // jsdom has no Web Animations: an element there runs no animation
  const element = jsdom.window.Element.prototype;
  if (!('getAnimations' in element)) Object.defineProperty(element, 'getAnimations', { value: () => [], configurable: true, writable: true });
}
