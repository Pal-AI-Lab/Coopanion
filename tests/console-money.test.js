import { expect, it } from 'vitest';
import { consoleFormat, formatMoney } from '../console/base/ui/format.ts';
import { fmtAxis, fmtMetric } from '../console/features/cost/chart.ts';

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
