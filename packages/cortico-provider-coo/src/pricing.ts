/**
 * List prices in USD per million tokens for the services whose price pages state them per model:
 * DeepSeek, OpenAI, Anthropic, Gemini (paid tier) and xAI. Each table names its page and the day it
 * was read. Services not here have no built-in prices.
 */
import type { PriceDefinition } from 'cortico/providers/pricebook.ts';
import type { PriceRule } from 'cortico/core/generation.ts';

/**
 * DeepSeek, from https://api-docs.deepseek.com/quick_start/pricing (read 2026-09-22). The table is the
 * off-peak price; peak hours, 01:00–04:00 and 06:00–10:00 UTC Monday to Friday, cost twice as much.
 * DeepSeek also treats Chinese public holidays as off-peak; those dates are not listed here, so a
 * holiday request is charged at peak.
 */
const DEEPSEEK_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing (2026-09-22)';
const PEAK_HOURS = [['01:00', '04:00'], ['06:00', '10:00']] as const;
const WORKDAYS = [1, 2, 3, 4, 5];

interface ModelPrice { cachedInput: number; uncachedInput: number; output: number }

/** Off-peak prices; peak is double. */
export const OFF_PEAK: Record<string, ModelPrice> = {
  'deepseek-flash': { cachedInput: 0.003, uncachedInput: 0.15, output: 0.6 },
  'deepseek-v4-pro': { cachedInput: 0.022, uncachedInput: 0.66, output: 1.98 },
};

const rules = (p: ModelPrice, k = 1): PriceRule[] => [
  { meter: 'cachedInput', perMillion: +(p.cachedInput * k).toFixed(6) },
  { meter: 'uncachedInput', perMillion: +(p.uncachedInput * k).toFixed(6) },
  { meter: 'output', perMillion: +(p.output * k).toFixed(6) },
];

export function deepseekPrices(): PriceDefinition[] {
  return Object.entries(OFF_PEAK).map(([model, p]) => ({
    models: [model],
    currency: 'USD',
    basis: 'marginal',
    source: DEEPSEEK_SOURCE,
    rules: rules(p, 1),
    timeWindows: PEAK_HOURS.map(([from, to]) => ({ from, to, timezone: 'UTC', weekdays: WORKDAYS, rules: rules(p, 2) })),
  }));
}

/** A model whose whole request moves to a second price once the prompt, cached tokens included, reaches `from` tokens. */
const banded = (models: string[], source: string, base: ModelPrice, from?: number, long?: ModelPrice): PriceDefinition => ({
  models, currency: 'USD', basis: 'marginal', source, rules: rules(base),
  ...(from && long ? { inputBands: [{ from, rules: rules(long) }] } : {}),
});

/** OpenAI: a prompt over 272K tokens pays twice the input and cache rates and 1.5 times the output rate. */
const OPENAI_SOURCE = 'https://developers.openai.com/api/docs/pricing (2026-10-08)';
const OPENAI_LONG_FROM = 272_001;
const openai = (model: string, p: ModelPrice) =>
  banded([model], OPENAI_SOURCE, p, OPENAI_LONG_FROM, { cachedInput: p.cachedInput * 2, uncachedInput: p.uncachedInput * 2, output: p.output * 1.5 });

export function openaiPrices(): PriceDefinition[] {
  return [
    openai('gpt-6-luna', { cachedInput: 0.01, uncachedInput: 0.10, output: 0.50 }),
    openai('gpt-6.1-sol', { cachedInput: 0.10, uncachedInput: 2, output: 10 }),
    openai('gpt-6-astra', { cachedInput: 1, uncachedInput: 10, output: 50 }),
  ];
}

/** xAI: a prompt of 200K tokens or more pays the second price for the whole request. */
const XAI_SOURCE = 'https://docs.x.ai/developers/models (2026-10-08)';
const XAI_LONG_FROM = 200_000;

export function xaiPrices(): PriceDefinition[] {
  return [
    banded(['grok-4.3'], XAI_SOURCE, { cachedInput: 0.20, uncachedInput: 1.25, output: 2.50 }, XAI_LONG_FROM, { cachedInput: 0.40, uncachedInput: 2.50, output: 5 }),
    banded(['grok-4.7'], XAI_SOURCE, { cachedInput: 0.50, uncachedInput: 2, output: 6 }, XAI_LONG_FROM, { cachedInput: 1, uncachedInput: 4, output: 12 }),
  ];
}

/**
 * Gemini API paid tier. Output includes thinking. gemini-3.8-flash is listed at a lower price through
 * 2026-12-31 UTC; a request started after that pays the price the page lists from 2027-01-01.
 */
const GEMINI_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing (2026-10-08)';
const GEMINI_FLASH_RAISE = '2027-01-01T00:00:00.000Z';
const GEMINI_PRO_LONG_FROM = 200_001;

export function geminiPrices(startedAt: string): PriceDefinition[] {
  const flash = startedAt < GEMINI_FLASH_RAISE ? { cachedInput: 0.075, uncachedInput: 0.75, output: 3.75 } : { cachedInput: 0.15, uncachedInput: 1.50, output: 7.50 };
  return [
    banded(['gemini-3.8-flash'], GEMINI_SOURCE, flash),
    banded(['gemini-3.5-flash-lite'], GEMINI_SOURCE, { cachedInput: 0.03, uncachedInput: 0.30, output: 2.50 }),
    banded(['gemini-3.1-pro-preview'], GEMINI_SOURCE, { cachedInput: 0.20, uncachedInput: 2, output: 12 }, GEMINI_PRO_LONG_FROM, { cachedInput: 0.40, uncachedInput: 4, output: 18 }),
  ];
}

/**
 * Anthropic: [input, 5-minute cache write, cache read, output]. Fresh input is what came after the last
 * cache breakpoint.
 */
const ANTHROPIC_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing (2026-10-08)';
const anthropicRules = ([input, write, read, output]: readonly [number, number, number, number]): PriceRule[] => [
  { meter: 'detail:fresh_input', perMillion: input },
  { meter: 'detail:cache_write', perMillion: write },
  { meter: 'cachedInput', perMillion: read },
  { meter: 'output', perMillion: output },
];

/** Claude Haiku 5.5 bills a request whose prompt, cache reads and writes included, is over 100,000 tokens at its second rate card. */
const HAIKU_LONG_PROMPT_FROM = 100_001;

export function anthropicPrices(): PriceDefinition[] {
  const row = (models: string[], card: readonly [number, number, number, number]): PriceDefinition =>
    ({ models, currency: 'USD', basis: 'marginal', rules: anthropicRules(card), source: ANTHROPIC_SOURCE });
  return [
    { ...row(['claude-haiku-5-5'], [0.10, 0.125, 0.01, 0.50]), inputBands: [{ from: HAIKU_LONG_PROMPT_FROM, rules: anthropicRules([0.50, 0.625, 0.05, 2.50]) }] },
    row(['claude-sonnet-5-5'], [2, 2.50, 0.10, 10]),
    row(['claude-opus-5-5'], [4, 5, 0.20, 20]),
  ];
}

/** The built-in prices of the service `id` for a request started at `startedAt`. */
export function vendorPrices(id: string | undefined, startedAt: string): PriceDefinition[] {
  switch (id) {
    case 'deepseek': return deepseekPrices();
    case 'openai': return openaiPrices();
    case 'anthropic': return anthropicPrices();
    case 'gemini': return geminiPrices(startedAt);
    case 'xai': return xaiPrices();
    default: return [];
  }
}
