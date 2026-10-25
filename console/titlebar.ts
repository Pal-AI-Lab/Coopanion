/** Window navigation and appearance controls in the draggable title bar. */
import { getThemeStudio } from './base/theme/studio.ts';
import { readThemeColor } from './base/theme/palette.ts';
import { S as THEME } from './base/theme/strings.ts';
import { mountRelease } from './features/release.ts';
import { L } from './strings.ts';

declare global {
  interface Window {
    coopanionWindow?: {
      platform: string;
      setTheme(theme: { color: string; symbolColor: string }): void;
    };
  }
}

export function createTitlebar(doc: Document, toggle: HTMLButtonElement, signal: AbortSignal): HTMLElement {
  const win = doc.defaultView!;
  const native = win.coopanionWindow;
  const bar = doc.createElement('header');
  bar.className = 'companion-titlebar';
  bar.dataset.platform = native?.platform ?? 'browser';
  const actions = doc.createElement('div');
  actions.className = 'companion-titlebar-actions';
  bar.append(actions);
  const button = (label: string, path: string, action: () => void): HTMLButtonElement => {
    const el = doc.createElement('button');
    el.type = 'button';
    el.title = label;
    el.setAttribute('aria-label', label);
    el.innerHTML = svg(path);
    el.addEventListener('click', action, { signal });
    return el;
  };
  const back = button(L.goBack, '<path d="m14.5 6-6 6 6 6"/>', () => win.history.back());
  const forward = button(L.goForward, '<path d="m9.5 6 6 6-6 6"/>', () => win.history.forward());
  const appearance = button('', '', () => {
    const studio = getThemeStudio();
    studio.setMode(studio.appearance === 'dark' ? 'light' : 'dark');
  });
  actions.append(back, forward, toggle, appearance);
  const release = doc.createElement('div');
  release.className = 'companion-titlebar-release';
  actions.append(release);
  mountRelease(doc, release, signal);
  const navigation = (win as Window & { navigation?: EventTarget & { canGoBack: boolean; canGoForward: boolean } }).navigation;
  const paintHistory = (): void => {
    // Browsers without the Navigation API leave history controls enabled.
    if (!navigation) return;
    back.disabled = !navigation.canGoBack;
    forward.disabled = !navigation.canGoForward;
  };
  navigation?.addEventListener('currententrychange', paintHistory, { signal });
  paintHistory();

  const paintTheme = (): void => {
    const dark = doc.documentElement.dataset.colorMode === 'dark';
    const label = dark ? THEME.appearanceLight : THEME.appearanceDark;
    appearance.title = label;
    appearance.setAttribute('aria-label', label);
    appearance.innerHTML = svg(dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
      : '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>');
    native?.setTheme({ color: readThemeColor(doc, 'paper-2'), symbolColor: readThemeColor(doc, 'ink-soft') });
  };
  // Theme loading replaces the studio instance; the applied document palette remains the source of truth.
  const observer = new win.MutationObserver(paintTheme);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'data-color-mode'] });
  paintTheme();
  signal.addEventListener('abort', () => { observer.disconnect(); bar.remove(); }, { once: true });
  return bar;
}

function svg(shapes: string): string {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shapes + '</svg>';
}
