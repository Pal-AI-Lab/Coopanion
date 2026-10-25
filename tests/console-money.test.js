// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { consoleFormat, formatMoney } from '../console/base/ui/format.ts';
import { renderChart, fmtAxis, fmtMetric } from '../console/features/cost/chart.ts';

it.each([
  [null, '$0.00'], [0, '$0.00'], [0.004, '$0.00'], [0.1267, '$0.13'], [12.346, '$12.35'],
])('formats amount %s with two decimals across readouts and chart labels', (amount, expected) => {
  expect(consoleFormat.money(amount)).toBe(expected);
  expect(fmtMetric(amount ?? 0, 'cost')).toBe(expected);
  expect(fmtAxis(amount ?? 0, 'cost')).toBe(expected.slice(1));
});

it('preserves currency labels and uses three decimals for average costs', () => {
  expect(consoleFormat.money(0.1267, 'EUR')).toBe('EUR 0.13');
  expect(formatMoney(0.1267, 'EUR', 3)).toBe('EUR 0.127');
  expect(formatMoney(12, 'USD', 3)).toBe('$12.000');
  expect(formatMoney(0, 'USD', 3)).toBe('$0.000');
});


it('gives small costs distinct cent-based axis labels without changing the displayed amount', () => {
  const life = new AbortController();
  const ui = createConsoleUi({doc: document, overlayHost: document.body, signal: life.signal, memo: {get: (_, f) => f, set() {}}});
  const box = document.createElement('div');
  let detail = '';
  const tip = {clearHi() {}, setHi() {}, move() {}, hide() {}, show(html) {detail = html;}};
  renderChart({doc: document, ui, box, legend: document.createElement('div'), tip, color: () => '#008855'},
    {currency: 'USD', series: [{bucket: '2026-10-25', cost: 0.003, calls: 1}]}, {metric: 'cost', dims: {}});
  const labels = [...box.querySelectorAll('.vlabel')].map(el => el.textContent);
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels.every(label => /^\d+\.\d{2}$/.test(label))).toBe(true);
  box.querySelector('.bhit').dispatchEvent(new MouseEvent('click', {bubbles: true}));
  expect(detail).toContain(consoleFormat.money(0.003));
  life.abort();
});
