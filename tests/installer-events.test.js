import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import installerEvents from '../app/installer-events.cjs';

const { takeInstallerFailure } = installerEvents;
let root;
let program;
let marker;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'coo-install-failure-'));
  program = join(root, '安装目录');
  marker = join(program, 'data', 'logs', 'last-update-error.txt');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** The record as update.nsh writes it: UTF-16 LE with a BOM, CRLF lines. */
function record(owner, version) {
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, Buffer.from('﻿' + [owner, version, ''].join('\r\n'), 'utf16le'));
}

it('reports a quiet update failure once, for its program directory in any letter case', () => {
  record(program.toUpperCase(), '1.2.3');

  expect(takeInstallerFailure(program)).toEqual({ version: '1.2.3', logFile: join(dirname(marker), 'installer.log') });
  expect(takeInstallerFailure(program)).toBeNull();
});

it('does not report a record written for another program directory', () => {
  record(join(root, 'other copy'), '2.3.4');

  expect(takeInstallerFailure(program)).toBeNull();
});
