import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'cortico/core/types.ts';
import { ConsoleAssets } from 'cortico/web/console-pages.ts';
import { bundledConsoleAssets } from '../core/bundled-panels.ts';

const log = { error: (msg: string) => { throw new Error(msg); } } as unknown as Logger;

describe('bundled World panels', () => {
  // needs the panel bundle that `pnpm run build:cortico` builds
  it('the console has a bundle for the desktop pet page and serves its files', () => {
    const table = bundledConsoleAssets([
      { id: 'desktop-pet', packageName: 'cortico-world-desktop-pet' },
      { id: 'cua', packageName: 'cortico-world-cua' },
    ]);
    expect(table.map((a) => a.pageId)).toEqual(['world:desktop-pet']);
    expect(existsSync(table[0].jsFile) && existsSync(table[0].cssFile!)).toBe(true);
    const assets = new ConsoleAssets(join(tmpdir(), 'no-web-dist'), log, table);
    // package version plus a content hash, so a rebuilt bundle gets a new URL
    expect(table[0].version).toMatch(/^\d+\.\d+\.\d+-[0-9a-f]{10}$/);
    expect(assets.forPage('world:desktop-pet')).toEqual({
      js: expect.stringMatching(/^\/assets\/extensions\/cortico-world-desktop-pet\/.+\.js$/),
      css: expect.stringMatching(/\.css$/),
    });
  });
});
