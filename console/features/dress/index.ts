/**
 * 「装扮」: the desktop-pet World's dressing page (colors, hats, earrings, glasses, neckwear) in a
 * frame: the preview across the top, the choices below. The frame is as tall as the page (the page
 * reports its height), so the window scrolls it with the scrollbar every page has. Its address comes
 * from the World's `pet` panel; until the pet's server is up the page says so and asks again every
 * few seconds. Saving a look recolours the settings window (core/console-theme.ts
 * writes the deployment's theme.json); while this page is open it reads that record every
 * `THEME_POLL_MS` and applies it when the scheme or mode differs from what the window shows.
 *
 * The page asks for a dialog with `companion:confirm` ({ id, title, body, danger, notice }); the window shows its
 * own (`ui.confirm`, or `notice` for a message with one button) and answers `companion:confirmed` ({ id, ok }).
 */

import { listProblem } from '../../base/ui/problem.ts';
import { S as COMMON } from '../../base/ui/strings.ts';
import { invokePanel } from '../../base/api.ts';
import { notice } from '../../base/ui/index.ts';
import type { Page, PageContext } from '../../base/page.ts';
import { applyStoredTheme, disposeThemeStudio, getThemeStudio } from '../../base/theme/studio.ts';
import { fetchTheme } from '../../base/theme/storage.ts';
import { intro } from '../intro.ts';
import { revealWhenPainted } from '../frame-reveal.ts';
import { S } from './strings.ts';

const PET_PAGE = 'world:desktop-pet';
/** How often the open page reads the theme record, one local request each time. */
const THEME_POLL_MS = 1000;


async function mount(ctx: PageContext): Promise<void> {
  const { ui, root, signal } = ctx;
  root.classList.add('home');

  const frame = ui.h('iframe', 'companion-dressframe');
  const reveal = revealWhenPainted(frame, signal);
  frame.title = S.nav;
  const readError = ui.h('div', 'read-feedback');
  frame.hidden = true;
  root.append(intro(ui, S.nav), readError, frame);

  const doc = root.ownerDocument;
  const appearance = () => doc.documentElement.dataset.colorMode === 'dark' ? 'dark' : 'light';
  const accent = () => getComputedStyle(doc.documentElement).getPropertyValue('--accent').trim();
  const syncAppearance = () => {
    if (frame.dataset.origin) frame.contentWindow?.postMessage({ type: 'companion:appearance', mode: appearance(), accent: accent() }, frame.dataset.origin);
  };
  frame.addEventListener('load', syncAppearance, { signal });
  // the page says how tall it is: the frame takes that height, so the window scrolls it and the frame shows no scrollbar
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== frame.dataset.origin) return;
    if (e.data?.type === 'companion:height') {
      const height = Number(e.data.height);
      if (Number.isFinite(height) && height > 0) frame.style.height = `${height}px`;
    } else if (e.data?.type === 'companion:confirm') void answer(e.data, e.origin);
  }, { signal });
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  const answer = async (ask: Record<string, unknown>, origin: string): Promise<void> => {
    const title = text(ask.title) ?? '';
    const body = text(ask.body);
    const ok = ask.notice === true
      ? await notice(ui, { title, body }).then(() => true)
      : await ui.confirm({ title, body, danger: ask.danger === true });
    frame.contentWindow?.postMessage({ type: 'companion:confirmed', id: ask.id, ok }, origin);
  };
  const observer = new MutationObserver(syncAppearance);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-color-mode', 'data-theme-scheme'] });
  ctx.lifecycle.add(() => observer.disconnect());

  const refresh = async () => {
    let url: string | null = null;
    try {
      url = (await invokePanel<{ dressUrl: string | null }>(PET_PAGE, 'pet', 'state', [], { signal }))?.dressUrl ?? null;
      if (signal.aborted) return;
      readError.replaceChildren();
    } catch (err) {
      // State is read only until the frame gets its address, so a failed read has no frame to keep.
      if (!signal.aborted) {
        const text = err instanceof Error ? err.message : String(err);
        readError.replaceChildren(listProblem(root.ownerDocument, text, COMMON.retry, refresh));
      }
      return;
    }
    frame.hidden = !url;
    if (!url) readError.replaceChildren(listProblem(doc, S.noPet, COMMON.retry, refresh));
    if (url && frame.dataset.src !== url) {
      frame.dataset.src = url;
      const target = new URL(url);
      frame.dataset.origin = target.origin;
      target.searchParams.set('appearance', appearance());
      target.searchParams.set('fit', '1');
      reveal.pend();
      frame.src = target.href;
    }
  };

  const followTheme = async () => {
    const injected = await fetchTheme(signal).catch(() => null);
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

export const dressPage: Page = {
  route: 'dress',
  label: S.nav,
  icon: 'shirt',
  mount,
};
