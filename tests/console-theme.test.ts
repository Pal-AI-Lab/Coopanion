import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { figurePacks } from 'cortico-world-desktop-pet';
import { COO_SCHEME, figureSchemes, followPetLook, refreshFigureSchemes } from '../core/console-theme.ts';

const packs = figurePacks([]).packs;
const WHALE_SCHEMES = figureSchemes(packs);

const theme = (dir: string) => JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')) as { selectedId: string; mode: string; custom: Array<{ id: string; name: string }> };

describe('console colours follow the pet', () => {
  it('switches between Coo and each whale scheme, keeping the light/dark mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'coo', scheme: 'claude' }, packs);
    expect(theme(dir).selectedId).toBe(COO_SCHEME);
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ ...theme(dir), mode: 'dark' }));
    followPetLook(dir, { figure: 'whale', scheme: 'claude' }, packs);
    expect(theme(dir)).toMatchObject({ selectedId: 'coo-whale-claude', mode: 'dark' });
    expect(theme(dir).custom.map((s) => s.id)).toEqual(WHALE_SCHEMES.map((s) => s.id));
    followPetLook(dir, { figure: 'coo' }, packs);
    expect(theme(dir).selectedId).toBe(COO_SCHEME);
  });

  it('gives a look that is no preset the colours of the preset with its colour scheme', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'whale', scheme: 'claude-cape' }, packs);
    expect(theme(dir).selectedId).toBe('coo-whale-claude');
  });

  it('leaves a scheme picked on the appearance page, and keeps the person\'s own schemes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    const mine = { id: 'mine', name: '我的', note: '', palettes: { light: {}, dark: {} } };
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ selectedId: 'navigator', mode: 'system', custom: [mine] }));
    followPetLook(dir, { figure: 'whale', scheme: 'kimi' }, packs);
    expect(theme(dir).selectedId).toBe('navigator');
    expect(theme(dir).custom.map((s) => s.id)).toEqual(['mine', ...WHALE_SCHEMES.map((s) => s.id)]);
  });

  it('keeps a whale scheme picked while the pet wears another look across a start', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    const picked = WHALE_SCHEMES[1].id;
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ selectedId: picked, mode: 'system', custom: [] }));
    refreshFigureSchemes(dir, { figure: 'coo' }, packs);
    expect(theme(dir).selectedId).toBe(picked);
    expect(theme(dir).custom.map((s) => s.id)).toEqual(WHALE_SCHEMES.map((s) => s.id));
    refreshFigureSchemes(dir, { figure: 'whale', scheme: 'claude' }, packs);
    expect(theme(dir).selectedId).toBe(picked);
  });

  it('starts a deployment without a record on the pet\'s scheme', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    refreshFigureSchemes(dir, { figure: 'whale', scheme: 'claude' }, packs);
    expect(theme(dir).selectedId).toBe('coo-whale-claude');
  });

  it('keeps the selection across an app language change and names the schemes in the new language', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    const picked = WHALE_SCHEMES[1].id;
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ selectedId: picked, mode: 'system', custom: [] }));
    refreshFigureSchemes(dir, { figure: 'coo' }, packs, 'en');
    expect(theme(dir).selectedId).toBe(picked);
    expect(theme(dir).custom.map((s) => s.name)).toEqual(figureSchemes(packs, 'en').map((s) => s.name));
  });

  it('keeps the colours of a selected scheme whose pack did not load, until another scheme is picked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    const picked = WHALE_SCHEMES[1];
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ selectedId: picked.id, mode: 'system', custom: WHALE_SCHEMES }));
    refreshFigureSchemes(dir, { figure: 'whale', scheme: 'claude' }, []);
    expect(theme(dir)).toMatchObject({ selectedId: picked.id, custom: [{ id: picked.id }] });
    expect(theme(dir).custom).toHaveLength(1);
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ ...theme(dir), selectedId: 'navigator' }));
    refreshFigureSchemes(dir, { figure: 'whale', scheme: 'claude' }, []);
    expect(theme(dir).custom).toEqual([]);
  });
});
