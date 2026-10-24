/**
 * Page tabs: the bar that switches between the views of one page (配置 / 提示词模板 / 工具表, 运行诊断's sub-pages).
 * It sits between two rules; the current view's label is larger and darker, with a theme-coloured line under it
 * that moves to the next label on a switch. Picking among options inside a view stays `ui.segmented`.
 *
 * The line is the bar's `::after`, placed through `--tab-x` / `--tab-w`; the bar carries `data-line` while a
 * current label is laid out, and `data-line="ready"` once it may animate (the first placement does not).
 * A page may append its own controls (a status line, a button) to `el` after the tabs.
 */

export interface PageTabItem {
  value: string;
  label: string;
  /** A small heading shown before the first tab of each group. */
  group?: string;
}

export interface PageTabs {
  el: HTMLElement;
  setValue(value: string): void;
}

export function pageTabs(
  doc: Document,
  signal: AbortSignal,
  items: readonly PageTabItem[],
  opts: { value?: string; onSelect?(value: string): void } = {},
): PageTabs {
  const el = doc.createElement('nav');
  el.className = 'pagetabs';
  const tabs: Array<{ value: string; btn: HTMLButtonElement; text: HTMLSpanElement }> = [];
  let current = opts.value ?? '';
  let group: string | undefined;
  for (const item of items) {
    if (item.group && item.group !== group) {
      const head = doc.createElement('span');
      head.className = 'pagetabs-group';
      head.textContent = item.group;
      el.appendChild(head);
    }
    group = item.group;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'pagetab';
    // the label at its current-tab size and weight, invisible, holds the width: a switch does not shift the bar
    btn.dataset.label = item.label;
    const text = doc.createElement('span');
    text.textContent = item.label;
    btn.appendChild(text);
    // the caller moves the highlight with setValue once the switch went through: a leave guard may refuse it
    btn.addEventListener('click', () => {
      if (current !== item.value) opts.onSelect?.(item.value);
    }, { signal });
    el.appendChild(btn);
    tabs.push({ value: item.value, btn, text });
  }

  const place = (): void => {
    const text = tabs.find((t) => t.value === current)?.text;
    if (!text?.offsetWidth) {
      el.removeAttribute('data-line');
      return;
    }
    el.style.setProperty('--tab-x', `${text.offsetLeft}px`);
    el.style.setProperty('--tab-w', `${text.offsetWidth}px`);
    if (el.getAttribute('data-line') === null) {
      el.setAttribute('data-line', '');
      doc.defaultView?.requestAnimationFrame(() => {
        if (el.getAttribute('data-line') !== null) el.setAttribute('data-line', 'ready');
      });
    }
  };
  const paint = (): void => {
    for (const t of tabs) {
      const on = t.value === current;
      t.btn.classList.toggle('active', on);
      if (on) t.btn.setAttribute('aria-current', 'page');
      else t.btn.removeAttribute('aria-current');
    }
    place();
  };
  // laid out later, re-wrapped or resized: the line follows
  const view = doc.defaultView;
  if (view?.ResizeObserver) {
    const size = new view.ResizeObserver(place);
    size.observe(el);
    signal.addEventListener('abort', () => size.disconnect(), { once: true });
  }
  paint();

  return {
    el,
    setValue(value: string): void {
      current = value;
      paint();
    },
  };
}
