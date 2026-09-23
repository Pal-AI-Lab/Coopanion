import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPLOYMENT, DISPLAY_NAME, ENDPOINT, KEY_NAME, seed } from '../core/seed.ts';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('first-run seed', () => {
  it('creates the deployment, the DeepSeek endpoint without a key, and the constitution', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    expect(read(join(home, DEPLOYMENT, 'deployment.json'))).toEqual({ bot: 'cormini' });
    expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ activeProvider: ENDPOINT, language: 'zh' });
    expect(read(join(home, 'providers', ENDPOINT, 'config.json'))).toMatchObject({ kind: 'deepseek', secret: KEY_NAME, multimodal: true });
    expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toContain('我叫 Coo');
    expect(readFileSync(join(home, DEPLOYMENT, 'avatar.png')).subarray(1, 4).toString()).toBe('PNG');
  });

  it('renames a deployment seeded with the old name in the config and the self-description', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ ...read(cfg), displayName: '可缇' }));
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, '# 我是谁\n\n我叫可缇。可缇住在屏幕底边。\n');
    seed(home);
    expect(read(cfg).displayName).toBe(DISPLAY_NAME);
    expect(readFileSync(constitution, 'utf8')).toBe(`# 我是谁\n\n我叫 ${DISPLAY_NAME}。${DISPLAY_NAME}住在屏幕底边。\n`);
  });

  it('leaves files the operator already has', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    const cfg = join(home, DEPLOYMENT, 'config.json');
    writeFileSync(cfg, JSON.stringify({ displayName: 'mine' }));
    const constitution = join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md');
    writeFileSync(constitution, '# 我自己写的');
    seed(home);
    expect(read(cfg)).toEqual({ displayName: 'mine' });
    expect(readFileSync(constitution, 'utf8')).toBe('# 我自己写的');
  });
});
