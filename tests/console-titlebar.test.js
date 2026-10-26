// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTitlebar } from '../console/titlebar.ts';
import { Router } from '../console/base/router.ts';
import { getThemeStudio, disposeThemeStudio, applyStoredTheme } from '../console/base/theme/studio.ts';
import { S as THEME } from '../console/base/theme/strings.ts';
import { L } from '../console/strings.ts';
let life;
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
beforeEach(() => {
  life = new AbortController();
  window.coopanionUpdate = { step: () => null, onStep: () => () => {} };
  document.body.replaceChildren();
  history.replaceState(null, '', '/#/home');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  applyStoredTheme(document, { injected: { defaultScheme: 'mint', theme: null }, save: async () => {} });
});
afterEach(() => { life.abort(); disposeThemeStudio(); delete window.coopanionWindow; delete window.coopanionUpdate; vi.unstubAllGlobals(); });

it('uses the current theme studio after server theme replacement and persists appearance changes', async () => {
  let nativeTheme, storedTheme;
  window.coopanionWindow = { platform: 'win32', setTheme: theme => { nativeTheme = theme; } };
  const bar = createTitlebar(document, document.createElement('button'), life.signal);
  document.body.append(bar);
  disposeThemeStudio();
  applyStoredTheme(document, { injected: { defaultScheme: 'navigator', theme: null }, save: async theme => { storedTheme = structuredClone(theme); } });
  await tick();
  const button = bar.querySelector('button:nth-of-type(4)');
  expect(button.title).toBe(THEME.appearanceDark);
  button.click();
  await tick();
  const snapshot = getThemeStudio().snapshot();
  expect(storedTheme.mode).toBe('dark');
  expect(nativeTheme).toEqual({ color: snapshot.palette['paper-2'], symbolColor: snapshot.palette['ink-soft'] });
  expect(button.title).toBe(THEME.appearanceLight);
  life.abort();
  const previous = nativeTheme;
  getThemeStudio().setMode('light');
  await tick();
  expect(nativeTheme).toBe(previous);
});

it('goes back and forward in the window history', async () => {
  const router = new Router({ win: window, confirmLeave: async () => true });
  const stop = router.start();
  const bar = createTitlebar(document, document.createElement('button'), life.signal);
  document.body.append(bar);
  router.navigate(['chat']);
  await tick();
  bar.querySelector('[aria-label="' + L.goBack + '"]').click();
  await expect.poll(() => router.route.segments[0]).toBe('home');
  bar.querySelector('[aria-label="' + L.goForward + '"]').click();
  await expect.poll(() => router.route.segments[0]).toBe('chat');
  stop.dispose();
});
