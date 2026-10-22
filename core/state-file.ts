/** JSON state owned by one process, with corrupt files retained beside their replacements. */
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { retryBusy } from 'cortico/core/fs-busy.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Missing or invalid state returns null; invalid content is kept as `<file>.bad` when possible. */
export function readState<T>(file: string, valid: (value: unknown) => value is T): T | null {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (valid(value)) return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (!(error instanceof SyntaxError)) {
      console.warn('[state] could not read', file, error);
      return null;
    }
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
