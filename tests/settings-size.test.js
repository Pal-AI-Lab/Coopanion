import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { DEFAULT_SIZE, MIN_SIZE, readSettingsSize, saveSettingsSize } = require('../app/settings-size.cjs');
let dir, file;
const area = { width: 1920, height: 1080 };
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'coo-window-size-')); file = join(dir, 'settings-size.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('settings window size', () => {
  it('restores the saved size without persisting window position', () => {
    const size = { width: 1090, height: 730 };
    saveSettingsSize(file, { ...size, x: 100, y: 200 });
    expect(readSettingsSize(file, area)).toEqual(size);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(size);
  });
  it('uses the default for missing, malformed or invalid preferences', () => {
    expect(readSettingsSize(file, area)).toEqual(DEFAULT_SIZE);
    for (const value of ['{', 'null', '{"width":-2,"height":700}', '{"width":"1000","height":700}']) {
      writeFileSync(file, value);
      expect(readSettingsSize(file, area)).toEqual(DEFAULT_SIZE);
    }
  });
  it('fits saved dimensions to the work area and minimum size', () => {
    saveSettingsSize(file, { width: 3000, height: 2000 });
    expect(readSettingsSize(file, area)).toEqual(area);
    saveSettingsSize(file, { width: 100, height: 100 });
    expect(readSettingsSize(file, area)).toEqual(MIN_SIZE);
  });
});
