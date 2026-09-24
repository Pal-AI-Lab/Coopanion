import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { macDataPath } = createRequire(import.meta.url)('../app/data-path.cjs') as { macDataPath(root: string): string };
const dirs: string[] = [];
const root = () => { const dir = mkdtempSync(join(tmpdir(), 'coopanion-path-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('macOS data after the product rename', () => {
  it('uses the new name for a fresh install', () => {
    const dir = root();
    expect(macDataPath(dir)).toBe(join(dir, 'Coopanion'));
  });
  it('retains legacy data and its lock even if a new empty profile exists', () => {
    const dir = root(), old = join(dir, 'CortiCompanion');
    mkdirSync(join(old, 'home'), { recursive: true });
    writeFileSync(join(old, 'home', 'config.json'), '{"user":"existing"}');
    mkdirSync(join(dir, 'Coopanion'));
    expect(macDataPath(dir)).toBe(old);
    expect(readFileSync(join(macDataPath(dir), 'home', 'config.json'), 'utf8')).toBe('{"user":"existing"}');
  });
  it('keeps an established new deployment when both data directories exist', () => {
    const dir = root();
    for (const name of ['Coopanion', 'CortiCompanion']) mkdirSync(join(dir, name, 'home'), { recursive: true });
    expect(macDataPath(dir)).toBe(join(dir, 'Coopanion'));
  });
});
