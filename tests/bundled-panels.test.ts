import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'cortico/core/types.ts';
import { WebUiAssets } from 'cortico/web/webui-pages.ts';
import { bundledWebUiAssets } from '../core/bundled-panels.ts';

const log = { error: (msg: string) => { throw new Error(msg); } } as unknown as Logger;

describe('bundled World panels', () => {
  // needs the panel bundle that `pnpm run build:cortico` builds
  it('the WebUI server has a bundle for the desktop pet page and serves its files', () => {
    const table = bundledWebUiAssets([
      { id: 'desktop-pet', packageName: 'cortico-world-desktop-pet' },
    ]);
    expect(table.map((a) => a.pageId)).toEqual(['world:desktop-pet']);
    expect(existsSync(table[0].jsFile) && existsSync(table[0].cssFile!)).toBe(true);
    // the server sends these bytes, never the file on disk
    expect(table[0].jsBytes.equals(readFileSync(table[0].jsFile))).toBe(true);
    expect(table[0].cssBytes?.equals(readFileSync(table[0].cssFile!))).toBe(true);
    const assets = new WebUiAssets(join(tmpdir(), 'no-web-dist'), log, table);
    // package version plus a content hash, so a rebuilt bundle gets a new URL
    expect(table[0].version).toMatch(/^\d+\.\d+\.\d+-[0-9a-f]{10}$/);
    expect(assets.forPage('world:desktop-pet')).toEqual({
      js: expect.stringMatching(/^\/assets\/extensions\/cortico-world-desktop-pet\/.+\.js$/),
      css: expect.stringMatching(/\.css$/),
    });
  });
});
