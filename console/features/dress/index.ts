/**
 * 「装扮」: the desktop-pet World's dressing page (colors, hats, earrings, glasses, neckwear) in a
 * frame: the preview across the top, the choices below. The frame is as tall as the page (the page
 * reports its height), so the window scrolls it with the scrollbar every page has. Its address comes
 * from the World's `pet` panel; until the pet's server is up the page says so and asks again every
 * few seconds. Saving a look recolours the settings window (core/console-theme.ts
 * writes the deployment's theme.json); while this page is open it reads that record every
 * `THEME_POLL_MS` and applies it when the scheme or mode differs from what the window shows.
 */
import { get, post } from '../../core/api.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { applyStoredTheme, disposeThemeStudio, getThemeStudio } from '../../theme/studio.ts';
import type { InjectedTheme } from '../../../shared/theme.ts';
import { intro } from '../intro.ts';
import { S } from './strings.ts';

const PET_PAGE = 'world:desktop-pet';
/** How often the open page reads the theme record, one local request each time. */
const THEME_POLL_MS = 1000;

const panelPath = (method: string) => `/api/console/providers/${encodeURIComponent(PET_PAGE)}/panels/pet/${method}`;

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  root.classList.add('home');

  const note = ui.h('p', null, S.note);
  const frame = ui.h('iframe', 'companion-dressframe');
  frame.title = S.nav;
  root.append(intro(ui, S.nav, { desc: note }), frame);

  const doc = root.ownerDocument;
  const appearance = () => doc.documentElement.dataset.colorMode === 'dark' ? 'dark' : 'light';
  const accent = () => getComputedStyle(doc.documentElement).getPropertyValue('--accent').trim();
  const syncAppearance = () => {
    if (frame.dataset.origin) frame.contentWindow?.postMessage({ type: 'companion:appearance', mode: appearance(), accent: accent() }, frame.dataset.origin);
  };
  frame.addEventListener('load', syncAppearance, { signal });
  // the page says how tall it is: the frame takes that height, so the window scrolls it and the frame shows no scrollbar
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== frame.dataset.origin || e.data?.type !== 'companion:height') return;
    const height = Number(e.data.height);
    if (Number.isFinite(height) && height > 0) frame.style.height = `${height}px`;
  }, { signal });
  const observer = new MutationObserver(syncAppearance);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-color-mode', 'data-theme-scheme'] });
  ctx.lifecycle.add(() => observer.disconnect());

  const refresh = async () => {
    let url: string | null = null;
    try {
      url = (await post<{ dressUrl: string | null }>(panelPath('state'), { args: [] }, { signal }))?.dressUrl ?? null;
    } catch { url = null; }
    frame.hidden = !url;
    note.textContent = url ? S.note : S.noPet;
    if (url && frame.dataset.src !== url) {
      frame.dataset.src = url;
      const target = new URL(url);
      frame.dataset.origin = target.origin;
      target.searchParams.set('appearance', appearance());
      target.searchParams.set('fit', '1');
      frame.src = target.href;
    }
  };

  const followTheme = async () => {
    const injected = await get<InjectedTheme>('/api/theme', { signal }).catch(() => null);
    const theme = injected?.theme;
    if (!injected || !theme || signal.aborted) return;
    const shown = getThemeStudio().snapshot();
    if (theme.selectedId === shown.selectedId && theme.mode === shown.mode) return;
    // the studio holds the record it started with: a fresh one reads the new schemes and selection
    disposeThemeStudio();
    applyStoredTheme(doc, { injected });
  };

  await refresh();
  ctx.lifecycle.interval(() => { if (frame.hidden) void refresh(); }, 3000);
  ctx.lifecycle.interval(() => void followTheme(), THEME_POLL_MS);
}

export const dressFeature: FrameworkFeature = {
  route: 'dress',
  label: S.nav,
  icon: 'shirt',
  navMode: 'primary',
  mount,
};
