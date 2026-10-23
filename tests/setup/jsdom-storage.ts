// Vitest 2 preserves Node's storage globals; browser tests use their jsdom window's storage.
declare const jsdom: { window: { localStorage: unknown; sessionStorage: unknown } } | undefined;
if (typeof jsdom !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, { value: jsdom.window[key], configurable: true, writable: true });
  }
}
