import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import installerEvents from '../app/installer-events.cjs';

const { takeInstallerFailure } = installerEvents;
let root;
let program;
let local;
let beside;
let fallback;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'coo-install-failure-'));
  program = join(root, '安装目录');
  local = join(root, 'local');
  beside = join(program, 'data', 'logs', 'last-update-error.txt');
  fallback = join(local, 'Coopanion', 'last-update-error.txt');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function record(file, owner, version) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from('\uFEFF' + [owner, version, ''].join('\r\n'), 'utf16le'));
}

it('consumes a quiet installation failure once', () => {
  record(beside, program.toUpperCase(), '1.2.3');

  expect(takeInstallerFailure(program, local)).toEqual({
    version: '1.2.3', logFile: join(dirname(beside), 'installer.log'),
  });
  expect(takeInstallerFailure(program, local)).toBeNull();
});

it('leaves a fallback report for a different installation', () => {
  const other = join(root, 'other copy');
  record(fallback, other, '2.3.4');

  expect(takeInstallerFailure(program, local)).toBeNull();
  expect(existsSync(fallback)).toBe(true);
  expect(takeInstallerFailure(other, local)).toEqual({
    version: '2.3.4', logFile: join(dirname(fallback), 'installer.log'),
  });
});

it('reports the latest failure if the installer switched log directories', () => {
  record(beside, program, '1.2.3');
  utimesSync(beside, 1, 1);
  record(fallback, program, '2.3.4');

  expect(takeInstallerFailure(program, local)).toEqual({
    version: '2.3.4', logFile: join(dirname(fallback), 'installer.log'),
  });
  expect(takeInstallerFailure(program, local)).toBeNull();
});
