/**
 * DeepSeek list prices in USD per million tokens, from https://api-docs.deepseek.com/quick_start/pricing
 * (read 2026-09-22). The table is the off-peak price; peak hours, 01:00–04:00 and 06:00–10:00 UTC
 * Monday to Friday, cost twice as much. DeepSeek also treats Chinese public holidays as off-peak;
 * those dates are not listed here, so a holiday request is charged at peak.
 */
import type { PriceDefinition } from 'cortico/providers/pricebook.ts';
import type { PriceRule } from 'cortico/core/generation.ts';

const SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing (2026-09-22)';
const PEAK_HOURS = [['01:00', '04:00'], ['06:00', '10:00']] as const;
const WORKDAYS = [1, 2, 3, 4, 5];

interface ModelPrice { cachedInput: number; uncachedInput: number; output: number }

/** Off-peak prices; peak is double. */
export const OFF_PEAK: Record<string, ModelPrice> = {
  'deepseek-flash': { cachedInput: 0.003, uncachedInput: 0.15, output: 0.6 },
  'deepseek-v4-pro': { cachedInput: 0.022, uncachedInput: 0.66, output: 1.98 },
};

const rules = (p: ModelPrice, k: number): PriceRule[] => [
  { meter: 'cachedInput', perMillion: +(p.cachedInput * k).toFixed(6) },
  { meter: 'uncachedInput', perMillion: +(p.uncachedInput * k).toFixed(6) },
  { meter: 'output', perMillion: +(p.output * k).toFixed(6) },
];

export function deepseekPrices(): PriceDefinition[] {
  return Object.entries(OFF_PEAK).map(([model, p]) => ({
    models: [model],
    currency: 'USD',
    basis: 'marginal',
    source: SOURCE,
    rules: rules(p, 1),
    timeWindows: PEAK_HOURS.map(([from, to]) => ({ from, to, timezone: 'UTC', weekdays: WORKDAYS, rules: rules(p, 2) })),
  }));
}
