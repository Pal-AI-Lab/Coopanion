import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGES, type Language } from 'cortico/core/language.ts';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { runGuide } from '../core/guide.ts';
import { coreText } from '../core/i18n/index.ts';
import { PERSONAS, applyPersona, personaFile } from '../core/seed.ts';

/** A pet that answers each bubble from `answers` (then closes), the app language the config API sets, and the statistics sent. */
function setup(start: Language, answers: PetDialogAnswer[], done = false, whale = true) {
  const dir = mkdtempSync(join(tmpdir(), 'guide-language-'));
  const workspace = join(dir, 'workspace');
  mkdirSync(workspace);
  applyPersona(workspace, 'coo', start);
  const dressed: unknown[] = [];
  const posted: string[] = [];
  const doneFile = join(dir, 'guide.json');
  if (done) writeFileSync(doneFile, '{}');
  let language = start;
  const shown: PetDialog[] = [];
  const saved: unknown[] = [];
  const tracked: Array<[string, Record<string, unknown>]> = [];
  const pet = {
    petState: () => ({ connected: true }),
    dress: (skin: unknown) => { dressed.push(skin); },
    dialog: (d: PetDialog) => {
      shown.push(d);
      return { answer: Promise.resolve(answers.shift() ?? { closed: true }), close() {}, update() {} };
    },
  } as unknown as DesktopPetWorld;
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      posted.push(new URL(url).pathname);
      const body = JSON.parse(init.body ?? '{}') as { group: string; values: Record<string, unknown> };
      saved.push(body);
      if (body.group === 'companion' && typeof body.values.language === 'string') language = body.values.language as Language;
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const run = runGuide({ pet: () => pet, console: 'http://127.0.0.1:1', doneFile, openDress() {}, language: () => language, workspace, whale,
    track: (type, fields) => { tracked.push([type, fields]); } });
  return { run, shown, saved, workspace, dressed, posted, tracked };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the introduction asks for the language first', () => {
  it('asks with the language in force picked, then speaks the language picked', async () => {
    const { run, shown, saved } = setup('ja', [{ index: LANGUAGES.indexOf('zh') }]);
    await run;
    const first = shown[0]!;
    expect(first.step).toEqual([1, 8]);
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
    expect(shown[1]!.step).toEqual([2, 8]);
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

describe('the introduction asks who Coo is', () => {
  /** Answers up to the persona cards: the language kept, hello, a name, a source; then `pick`, then a close. */
  const upToPersona = (pick: PetDialogAnswer): PetDialogAnswer[] => [
    { index: LANGUAGES.indexOf('zh') }, { index: 0 }, { text: '小明' }, { done: true }, { index: 0 }, { done: true }, pick,
  ];

  it('writes the persona picked, dresses Coo in its colours and reloads the prefix', async () => {
    const { run, shown, workspace, dressed, posted } = setup('zh', upToPersona({ index: PERSONAS.indexOf('winter') }));
    await run;
    const cards = shown.find((d) => d.text === coreText('zh').guide.askPersona)!;
    expect(cards.input?.kind === 'choices' && cards.input.options.map((o) => o.label)).toEqual(PERSONAS.map((id) => coreText('zh').guide.personas[id].label));
    expect(readFileSync(join(workspace, 'CONSTITUTION.md'), 'utf8')).toBe(readFileSync(personaFile('winter', 'zh'), 'utf8'));
    expect(dressed).toEqual([{ figure: 'coo', palette: 'winter' }]);
    expect(posted).toContain('/api/session/reload-prefix');
  }, 10_000);

  it('offers no whale on the Steam build, and leaves the persona as it was when closed', async () => {
    const { run, shown, workspace, dressed } = setup('zh', upToPersona({ closed: true }), false, false);
    await run;
    const cards = shown.find((d) => d.text === coreText('zh').guide.askPersona)!;
    expect(cards.input?.kind === 'choices' && cards.input.options.map((o) => o.icon)).not.toContain('persona_whale');
    expect(readFileSync(join(workspace, 'CONSTITUTION.md'), 'utf8')).toBe(readFileSync(personaFile('coo', 'zh'), 'utf8'));
    expect(dressed).toEqual([]);
  }, 10_000);

  it('skips the cards once the self-description has been changed', async () => {
    const { run, shown, workspace } = setup('zh', upToPersona({ closed: true }));
    writeFileSync(join(workspace, 'CONSTITUTION.md'), '# 我自己写的');
    await run;
    expect(shown.map((d) => d.text)).not.toContain(coreText('zh').guide.askPersona);
  }, 10_000);
});

describe('the introduction goes back a step', () => {
  it('shows the step answered before as it was answered, and keeps and counts what is answered last', async () => {
    const S = coreText('zh').guide;
    const { run, shown, workspace, dressed, tracked } = setup('zh', [
      { index: LANGUAGES.indexOf('zh') }, { index: 0 }, { text: '小明' }, { done: true }, { index: 0 }, { done: true },
      // back from the persona cards to the source, past the line after it; another source, then a persona
      { back: true }, { index: 5 }, { done: true }, { index: PERSONAS.indexOf('winter') },
      // back from how lively to the persona cards, and another persona
      { back: true }, { index: PERSONAS.indexOf('heart') },
    ]);
    await run;
    expect(shown[0]!.back).toBeUndefined();
    const sources = shown.filter((d) => d.text === S.askSource);
    expect(sources).toHaveLength(2);
    expect(sources[1]!.back).toBe(S.back);
    expect(sources[1]!.input?.kind === 'buttons' && sources[1]!.input.options.map((o) => !!o.primary)).toEqual(S.sources.map((_, i) => i === 0));
    const personas = shown.filter((d) => d.text === S.askPersona);
    expect(personas).toHaveLength(3);
    expect(personas[2]!.input?.kind === 'choices' && personas[2]!.input.value).toBe(PERSONAS.indexOf('winter'));
    expect(readFileSync(join(workspace, 'CONSTITUTION.md'), 'utf8')).toBe(readFileSync(personaFile('heart', 'zh'), 'utf8'));
    expect(dressed).toEqual([{ figure: 'coo', palette: 'winter' }, { figure: 'coo', palette: 'heart' }]);
    expect(tracked.filter(([type]) => type === 'source' || type === 'persona'))
      .toEqual([['source', { answer: S.sources[5]![1] }], ['persona', { id: 'heart' }]]);
  }, 10_000);
});
