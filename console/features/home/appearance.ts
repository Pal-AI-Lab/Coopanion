/**
 * 「配色方案」 on the 开始 page, below 「我的桌宠」: Cortico's appearance page (features/appearance,
 * which keeps the theme studio, the drafts and saving) mounted embedded. Its one card holds the
 * schemes, the light/dark switch and the 「调色盘」 fold; Coopanion sets only the card's title.
 */
import { mountAppearance } from '../appearance/index.ts';
import type { FeatureContext } from '../feature.ts';
import { S } from './strings.ts';

export function mountSchemes(ctx: FeatureContext): HTMLElement {
  const { ui } = ctx;
  const box = ui.h('div');
  mountAppearance({ ...ctx, root: box }, { embedded: true });
  const schemes = box.firstElementChild as HTMLElement;
  schemes.querySelector(':scope > h3')!.replaceChildren(S.schemeTitle);
  schemes.classList.add('home-schemes');
  return schemes;
}
