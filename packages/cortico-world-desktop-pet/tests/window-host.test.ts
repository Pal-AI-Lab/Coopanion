import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOST_ENV, resolveHostCommand } from '../src/window-host.ts';

const URL = 'http://127.0.0.1:7797/pet#key=k';

describe('which command runs the pet window', () => {
  let dir: string;
  let electron: string;
  let saved: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pet-host-'));
    electron = join(dir, 'electron.exe');
    writeFileSync(electron, '');
    saved = process.env[HOST_ENV];
    delete process.env[HOST_ENV];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[HOST_ENV];
    else process.env[HOST_ENV] = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses the embedding app's command over a configured Electron program", () => {
    process.env[HOST_ENV] = JSON.stringify(['C:\\App\\Coopanion.exe', '--no-sandbox', '--pet-host']);
    expect(resolveHostCommand(URL, electron, null)).toEqual({
      command: 'C:\\App\\Coopanion.exe', args: ['--no-sandbox', '--pet-host', `--pet-url=${URL}`], source: HOST_ENV,
    });
  });

  it('uses the configured Electron program without the embedding command, over the managed runtime', () => {
    const cmd = resolveHostCommand(URL, electron, join(dir, 'managed.exe'));
    expect(cmd).toMatchObject({ command: electron, source: electron });
    expect('args' in cmd && cmd.args.at(-1)).toBe(`--pet-url=${URL}`);
  });

  it('reports a configured Electron program that is not there', () => {
    const missing = join(dir, 'gone.exe');
    expect(resolveHostCommand(URL, missing, null)).toEqual({ missing: { kind: 'noElectronFile', file: missing } });
  });
});
