import { describe, expect, it } from 'vitest';
import type { Core } from 'cortico/core/core.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import type { DesktopPetWorld, PetDialog } from 'cortico-world-desktop-pet';
import { hintFailures } from '../core/companion.ts';
import { coreText } from '../core/i18n/index.ts';

const S = coreText('en').failure;
const origin = { instance: 'test', module: 'test', model: 'm', compatibilityDomain: 'test' };

/** Fails five model requests with `status` and the upstream's `message`, and returns the bubble the pet showed. */
async function bubbleFor(status: number, message: string): Promise<PetDialog> {
  const shown: PetDialog[] = [];
  const llm = {
    respond: async () => { throw new GenerationError(`LLM API ${status}`, [], null, origin, status, JSON.stringify({ error: { message } })); },
  };
  const pet = {
    petState: () => ({ connected: true }),
    dialog: (d: PetDialog) => { shown.push(d); return { answer: new Promise(() => {}), close() {}, update() {} }; },
  };
  hintFailures({ llm } as unknown as Core<CoreConfig>, { language: 'en' } as CoreConfig, () => pet as unknown as DesktopPetWorld);
  for (let i = 0; i < 5; i++) await expect(llm.respond()).rejects.toBeInstanceOf(GenerationError);
  expect(shown).toHaveLength(1);
  return shown[0];
}

const labels = (d: PetDialog) => (d.input?.kind === 'buttons' ? d.input.options.map((o) => o.label) : []);

describe('failure bubble', () => {
  it.each([
    { status: 401, advice: S.advice.key, settings: true },
    { status: 404, advice: S.advice.model, settings: true },
    { status: 503, advice: S.advice.later, settings: false },
  ])('status $status follows the reason with its advice', async ({ status, advice, settings }) => {
    const d = await bubbleFor(status, 'upstream says no');
    expect(d.text).toContain('upstream says no');
    expect(d.text).toContain(advice);
    expect(labels(d)).toEqual(settings ? [S.open, S.ok] : [S.ok]);
  });

  it.each([400, 0])('status %i says the reason alone, with no settings button', async (status) => {
    const d = await bubbleFor(status, 'content rejected by moderation');
    expect(d.text.endsWith('content rejected by moderation.')).toBe(true);
    expect(labels(d)).toEqual([S.ok]);
  });
});
