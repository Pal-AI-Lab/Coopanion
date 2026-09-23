import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPLOYMENT, ENDPOINT, KEY_NAME, seed } from '../core/seed.ts';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('first-run seed', () => {
  it('creates the deployment, the DeepSeek endpoint without a key, and the constitution', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-seed-'));
    seed(home);
    expect(read(join(home, DEPLOYMENT, 'deployment.json'))).toEqual({ bot: 'cormini' });
    expect(read(join(home, DEPLOYMENT, 'config.json'))).toMatchObject({ activeProvider: ENDPOINT, language: 'zh' });
    expect(read(join(home, 'providers', ENDPOINT, 'config.json'))).toMatchObject({ kind: 'deepseek', secret: KEY_NAME, multimodal: true });
    expect(readFileSync(join(home, DEPLOYMENT, 'workspace', 'CONSTITUTION.md'), 'utf8')).toContain('我叫可缇');
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
