import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COO_SCHEME, WHALE_SCHEMES, followPetLook } from '../core/console-theme.ts';

const theme = (dir: string) => JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')) as { selectedId: string; mode: string; custom: Array<{ id: string }> };

describe('console colours follow the pet', () => {
  it('switches between Coo and each whale scheme, keeping the light/dark mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'coo', scheme: 'claude' });
    expect(theme(dir).selectedId).toBe(COO_SCHEME);
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ ...theme(dir), mode: 'dark' }));
    followPetLook(dir, { figure: 'whale', scheme: 'claude' });
    expect(theme(dir)).toMatchObject({ selectedId: 'coo-whale-claude', mode: 'dark' });
    expect(theme(dir).custom.map((s) => s.id)).toEqual(WHALE_SCHEMES.map((s) => s.id));
    followPetLook(dir, { figure: 'coo' });
    expect(theme(dir).selectedId).toBe(COO_SCHEME);
  });

  it('leaves a scheme picked on the appearance page, and keeps the person\'s own schemes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    const mine = { id: 'mine', name: '我的', note: '', palettes: { light: {}, dark: {} } };
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ selectedId: 'navigator', mode: 'system', custom: [mine] }));
    followPetLook(dir, { figure: 'whale', scheme: 'kimi' });
    expect(theme(dir).selectedId).toBe('navigator');
    expect(theme(dir).custom.map((s) => s.id)).toEqual(['mine', ...WHALE_SCHEMES.map((s) => s.id)]);
  });
});
