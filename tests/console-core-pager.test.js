// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { createPager } from '../console/advanced/features/core/pager.ts';

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

function mount(opts = {}) {
  const life = new AbortController();
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, f) => f, set() {} } });
  const changes = [];
  const pager = createPager(ui, { key: 'test', sizes: [10, 20], defaultSize: 10, onChange: (beyond) => changes.push(beyond), ...opts });
  document.body.appendChild(pager.el);
  // the pager's only buttons: previous, then next
  const buttons = () => pager.el.querySelectorAll('button');
  return { pager, changes, prev: () => buttons()[0], next: () => buttons()[1] };
}

describe('运行诊断 table pager', () => {
  it('slices pages, clamps the page when rows shrink, and hides the page keys on a single page', () => {
    const { pager, next } = mount();
    pager.render(25);
    expect(pager.slice(25)).toEqual([0, 10]);
    expect(pager.el.querySelector('.core-pager-of').textContent).toBe('1 / 3');
    next().click();
    next().click();
    pager.render(25);
    expect(pager.slice(25)).toEqual([20, 25]);
    expect(next().disabled).toBe(true);
    pager.render(8);
    expect(pager.page).toBe(0);
    expect(next().hidden).toBe(true);
  });

  it('keeps 下一页 usable on the last loaded page while earlier rows exist, and reports it as beyond', () => {
    const { pager, changes, next } = mount();
    pager.render(10, true);
    expect(pager.el.querySelector('.core-pager-shown').textContent).toContain('10+');
    expect(next().disabled).toBe(false);
    next().click();
    expect(changes).toEqual([true]);
  });

  it('remembers the page size per key', () => {
    const { pager } = mount();
    const sel = pager.el.querySelector('select');
    sel.value = '20';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(pager.size).toBe(20);
    expect(mount().pager.size).toBe(20);
  });
});
