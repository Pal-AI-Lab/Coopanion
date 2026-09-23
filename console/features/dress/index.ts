/**
 * 「装扮」: the desktop-pet World's dressing page (colors, hats, earrings, glasses, neckwear) in a
 * frame. Its address comes from the World's `pet` panel; until the pet's server is up the page says
 * so and asks again every few seconds.
 */
import { post } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';

const PET_PAGE = 'world:desktop-pet';

const S = pick({
  zh: {
    nav: '装扮',
    note: '换配色、帽子、耳饰、眼镜、颈饰,改动立刻生效。',
    noPet: '桌宠还没准备好,稍后再来。',
  },
  en: {
    nav: 'Dress up',
    note: 'Colors, hats, earrings, glasses and neckwear; changes apply at once.',
    noPet: 'The pet is not ready yet; come back in a moment.',
  },
});

const panelPath = (method: string) => `/api/console/providers/${encodeURIComponent(PET_PAGE)}/panels/pet/${method}`;

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  root.classList.add('home');

  const sheet = ui.sheet({ title: S.nav });
  const note = ui.h('p', 'home-note', S.note);
  const frame = ui.h('iframe', 'companion-dressframe');
  frame.title = S.nav;
  sheet.body.append(note, frame);
  root.append(sheet.el);

  const refresh = async () => {
    let url: string | null = null;
    try {
      url = (await post<{ dressUrl: string | null }>(panelPath('state'), { args: [] }, { signal }))?.dressUrl ?? null;
    } catch { url = null; }
    frame.hidden = !url;
    note.textContent = url ? S.note : S.noPet;
    if (url && frame.dataset.src !== url) {
      frame.dataset.src = url;
      frame.src = url;
    }
  };

  await refresh();
  ctx.lifecycle.interval(() => { if (frame.hidden) void refresh(); }, 3000);
}

export const dressFeature: FrameworkFeature = {
  route: 'dress',
  label: S.nav,
  icon: 'image',
  navMode: 'primary',
  mount,
};
