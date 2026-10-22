/** JSON state owned by one process, with corrupt files retained beside their replacements. */
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { retryBusy } from 'cortico/core/fs-busy.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Missing or invalid state returns null; invalid content is kept as `<file>.bad` when possible. Any
 * other read error is thrown: the caller must not rebuild and then replace a file it could not read.
 */
export function readState<T>(file: string, valid: (value: unknown) => value is T): T | null {
  let text: string;
  try {
    text = retryBusy(() => readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (valid(value)) return value;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  try { retryBusy(() => renameSync(file, `${file}.bad`)); }
  catch (error) { console.warn('[state] could not preserve invalid content', file, error); }
  return null;
}

export function writeState(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  const fd = retryBusy(() => openSync(tmp, 'w'));
  try { writeFileSync(fd, text); fsyncSync(fd); }
  finally { closeSync(fd); }
  retryBusy(() => renameSync(tmp, file));
}
