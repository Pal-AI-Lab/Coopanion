/**
 * 「配色方案」 on the 开始 page, below 「我的桌宠」: Cortico's appearance page (features/appearance,
 * which keeps the theme studio, the drafts and saving) laid out as one card. The schemes and the
 * light/dark switch show at once; 「调色盘」 is a fold at the card's bottom, closed by default, styled
 * as the Model page's folds, with the colors on the left and the component specimen on the right,
 * and the save row across both.
 */
import { mountAppearance } from '../appearance/index.ts';
import { S as AS } from '../appearance/strings.ts';
import type { FeatureContext } from '../feature.ts';
import { S } from './strings.ts';

export function mountSchemes(ctx: FeatureContext): HTMLElement {
  const { ui } = ctx;
  const box = ui.h('div');
  mountAppearance({ ...ctx, root: box }, { embedded: true });
  const [schemes, workbench] = [...box.children] as HTMLElement[];
  const [palette, specimen] = [...workbench!.children] as HTMLElement[];

  // the card: its own title, the color-scheme note, the schemes
  schemes!.querySelector(':scope > h3')!.replaceChildren(S.schemeTitle);
  // the deployment keeps the choice (/api/theme): the note says so in place of Cortico's 「in this browser」
  schemes!.querySelector(':scope > .sheetbody > .sh-desc')!.textContent = S.schemeDesc;
  schemes!.classList.add('home-schemes');

  // 调色盘: the palette card's body on the left, the specimen's on the right
  const fold = ui.foldSheet('home-palette', { title: AS.paletteSheetTitle, desc: AS.paletteSheetDesc });
  fold.el.classList.add('home-palette');
  const bench = ui.h('div', 'home-palettebench');
  const colors = ui.h('div', 'home-palettecolors');
  const paletteBody = [...palette!.querySelector(':scope > .sheetbody')!.children];
  colors.append(...paletteBody.filter((el) => !el.matches('.sh-desc, .theme-actions')));
  const sample = ui.h('div', 'home-palettesample');
  sample.append(ui.h('h4', null, AS.specimenTitle), ...specimen!.querySelector(':scope > .sheetbody')!.children);
  bench.append(colors, sample);
  // the save row (its rule, the note and the buttons) spans both columns, under the colors and the specimen
  fold.body.append(bench, paletteBody.find((el) => el.matches('.theme-actions'))!);
  schemes!.querySelector(':scope > .sheetbody')!.append(fold.el);
  return schemes!;
}
