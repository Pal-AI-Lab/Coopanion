// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pageBadges } from '../console/base/ui/page-badges.ts';
import { placeOverflowPopover } from '../console/base/ui/overflow-popover.ts';
import { pageTabs } from '../console/base/ui/page-tabs.ts';
let life, resize;
beforeEach(() => {
  life = new AbortController();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { life.abort(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('fits badges on one line and preserves every hidden badge through narrowing, expansion and cleanup', () => {
  let width = 250;
  const badges = ['ready', 'online', 'watching', 'idle'].map(text => {
    const el = document.createElement('span'); el.className = 'pill'; el.textContent = text; return el;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const w = this.classList.contains('page-badge-more') ? 30 : 100;
    return { x: 0, y: 0, left: 0, right: w, top: 0, bottom: 22, width: w, height: 22 };
  });
  const row = pageBadges(document, document.body, life.signal, badges);
  row.style.columnGap = '6px';
  Object.defineProperty(row, 'clientWidth', { get: () => width });
  document.body.append(row);
  resize();
  const more = row.querySelector('button');
  const pop = document.querySelector('.page-badge-pop');
  expect([...row.children].map(el => el.textContent)).toEqual(['ready', 'online', '+2']);
  more.focus();
  expect(pop.hidden).toBe(false);
  document.dispatchEvent(new Event('scroll'));
  expect(pop.hidden).toBe(false);
  expect([...pop.children]).toEqual(badges.slice(2));
  more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(pop.hidden).toBe(true);
  width = 80; resize();
  expect(row.textContent).toBe('+4');
  more.click();
  expect([...pop.children]).toEqual(badges);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(pop.hidden).toBe(true);
  width = 500; resize();
  expect([...row.children]).toEqual(badges);
  expect(pop.children.length).toBe(0);
  life.abort();
  expect(pop.isConnected).toBe(false);
});

it('moves the tab indicator between wrapped rows only after navigation is accepted', () => {
  const selected = [];
  const tabs = pageTabs(document, life.signal, [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }], { value: 'a', onSelect: v => selected.push(v) });
  document.body.append(tabs.el);
  const labels = [...tabs.el.querySelectorAll('.pagetab > span')];
  let secondRow = 60;
  labels.forEach((label, index) => {
    Object.defineProperties(label, { offsetLeft: { get: () => 10 + index * 80 }, offsetWidth: { get: () => 60 }, offsetTop: { get: () => index ? secondRow : 10 }, offsetHeight: { get: () => 22 } });
  });
  resize();
  const firstY = parseFloat(tabs.el.style.getPropertyValue('--tab-y'));
  tabs.el.querySelectorAll('button')[1].click();
  expect(selected).toEqual(['b']);
  expect(parseFloat(tabs.el.style.getPropertyValue('--tab-y'))).toBe(firstY);
  tabs.setValue('b');
  expect(tabs.el.dataset.line).toBe('appear');
  resize();
  expect(tabs.el.dataset.line).toBe('appear');
  tabs.setValue('a');
  expect(tabs.el.dataset.line).toBe('appear');
  tabs.setValue('b');
  expect(tabs.el.dataset.line).toBe('appear');
  const wrappedY = parseFloat(tabs.el.style.getPropertyValue('--tab-y'));
  expect(wrappedY - firstY).toBe(labels[1].offsetTop - labels[0].offsetTop);
  secondRow = 10; resize();
  expect(parseFloat(tabs.el.style.getPropertyValue('--tab-y'))).toBe(firstY);
  tabs.setValue('a');
  expect(tabs.el.dataset.line).toBe('ready');
});


it.each([
  { bounds: [200, 900], trigger: [850, 890], expected: [530, 360] },
  { bounds: [200, 900], trigger: [210, 250], expected: [200, 360] },
  { bounds: [200, 450], trigger: [400, 440], expected: [200, 250] },
  { bounds: [200, 900], trigger: [890, 930], expected: [540, 360] },
])('keeps overflow within its content edges: %j', ({ bounds, trigger, expected }) => {
  const content = document.createElement('div');
  const anchor = document.createElement('button');
  const pop = document.createElement('div');
  content.getBoundingClientRect = () => ({ left: bounds[0], right: bounds[1] });
  anchor.getBoundingClientRect = () => ({ left: trigger[0], right: trigger[1], bottom: 100 });
  Object.defineProperty(pop, 'offsetWidth', { get: () => parseFloat(pop.style.maxWidth) });
  pop.getBoundingClientRect = () => ({ width: parseFloat(pop.style.maxWidth) });
  placeOverflowPopover(pop, anchor, content);
  expect([parseFloat(pop.style.left), parseFloat(pop.style.maxWidth)]).toEqual(expected);
  expect(parseFloat(pop.style.left) + pop.offsetWidth).toBeLessThanOrEqual(bounds[1]);
  expect(parseFloat(pop.style.left)).toBeGreaterThanOrEqual(bounds[0]);
});
