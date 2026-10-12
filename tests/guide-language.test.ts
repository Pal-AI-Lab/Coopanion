import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGES, type Language } from 'cortico/core/language.ts';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { runGuide } from '../core/guide.ts';
import { coreText } from '../core/i18n/index.ts';

/** A pet that answers each bubble from `answers` (then closes), and the app language the config API sets. */
function setup(start: Language, answers: PetDialogAnswer[], done = false) {
  const dir = mkdtempSync(join(tmpdir(), 'guide-language-'));
  const doneFile = join(dir, 'guide.json');
  if (done) writeFileSync(doneFile, '{}');
  let language = start;
  const shown: PetDialog[] = [];
  const saved: unknown[] = [];
  const pet = {
    petState: () => ({ connected: true }),
    dialog: (d: PetDialog) => {
      shown.push(d);
      return { answer: Promise.resolve(answers.shift() ?? { closed: true }), close() {}, update() {} };
    },
  } as unknown as DesktopPetWorld;
  vi.stubGlobal('fetch', async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}') as { group: string; values: Record<string, unknown> };
      saved.push(body);
      if (body.group === 'companion' && typeof body.values.language === 'string') language = body.values.language as Language;
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const run = runGuide({ pet: () => pet, console: 'http://127.0.0.1:1', doneFile, openDress() {}, language: () => language });
  return { run, shown, saved };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the introduction asks for the language first', () => {
  it('asks with the language in force picked, then speaks the language picked', async () => {
    const { run, shown, saved } = setup('ja', [{ index: LANGUAGES.indexOf('zh') }]);
    await run;
    const first = shown[0]!;
    expect(first.step).toEqual([1, 7]);
    expect(first.input?.kind).toBe('choices');
    expect(first.input?.kind === 'choices' && first.input.value).toBe(LANGUAGES.indexOf('ja'));
    // each card says hello over its language's name, without a region in it
    const options = first.input?.kind === 'choices' ? first.input.options : [];
    expect(options[LANGUAGES.indexOf('es-419')]).toEqual({ label: '¡Hola!', note: 'Español' });
    expect(options[LANGUAGES.indexOf('pt-BR')]).toEqual({ label: 'Olá!', note: 'Português' });
    expect(options[LANGUAGES.indexOf('en')]).toEqual({ label: 'Hello!', note: 'English' });
    expect(saved).toContainEqual({ group: 'companion', values: { language: 'zh' } });
    // the next line, the hello, is in the language picked, and the dots moved on by one
    expect(shown[1]!.text).toBe(coreText('zh').guide.hello);
    expect(shown[1]!.step).toEqual([2, 7]);
  }, 10_000);

  it('keeps the language when the page is closed', async () => {
    const { run, shown, saved } = setup('zh', [{ closed: true }]);
    await run;
    expect(saved.filter((b) => (b as { group: string }).group === 'companion')).toEqual([]);
    expect(shown.at(-1)!.text).toBe(coreText('zh').guide.closed);
  }, 10_000);

  it('saves nothing when the language in force is kept', async () => {
    const { run, shown, saved } = setup('de', [{ index: LANGUAGES.indexOf('de') }], true);
    await run;
    expect(saved.filter((b) => (b as { group: string }).group === 'companion')).toEqual([]);
    expect(shown[1]!.text).toBe(coreText('de').guide.hello);
  }, 10_000);
});
