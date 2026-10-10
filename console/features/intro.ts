/**
 * The heading of every Coopanion page, the same as 「系统提示词」's (`pageIntro`: the title, the note
 * under it only when there is one, a rule below, held at the top while the page scrolls). Controls
 * that belong to the whole page sit at the right of the title row; a page whose first card would
 * repeat the page's title drops that card's heading (`untitled`).
 */
import type { ConsoleUi } from '../../shared/client-panel.ts';
import { pageIntro } from '../ui/page.ts';

export function intro(ui: Pick<ConsoleUi, 'h'>, title: string, opts: { desc?: string | HTMLElement; actions?: HTMLElement[] } = {}): HTMLElement {
  const el = pageIntro(ui, title, typeof opts.desc === 'string' ? opts.desc : undefined);
  if (opts.desc instanceof HTMLElement) {
    opts.desc.classList.add('pagedesc');
    el.append(opts.desc);
  }
  if (opts.actions?.length) {
    const acts = ui.h('div', 'companion-introacts');
    acts.append(...opts.actions);
    el.append(acts);
  }
  return el;
}

/** A card shown right under the page's heading, without a heading of its own. */
export function untitled(card: { el: HTMLElement }): void {
  card.el.querySelector(':scope > h3')?.remove();
  card.el.classList.add('untitled');
}
