/** JSON state owned by one process, with invalid content retained beside its replacement. */
import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { retryBusy } from 'cortico/core/fs-busy.ts';
import { readTextFile } from 'cortico/core/util.ts';

/** Thrown by a `readState` restore function when the content cannot be used. */
export class InvalidState extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as an object; anything else is invalid content. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new InvalidState('not an object');
  return value;
}

/**
 * `record[key]` when `is` accepts it; `fallback` when the key is absent, if one is given. Any other
 * value is invalid content.
 */
export function field<T>(record: Record<string, unknown>, key: string, is: (value: unknown) => value is T, ...fallback: [T] | []): T {
  const value = record[key];
  if (is(value)) return value;
  if (value === undefined && fallback.length) return fallback[0] as T;
  throw new InvalidState(`${key}: ${value === undefined ? 'missing' : 'wrong type'}`);
}

/**
 * The state in `file` as `restore` makes it from the parsed JSON, or null when the file is missing.
 * Content that is not JSON or that `restore` rejects with InvalidState also gives null, and is kept
 * as `<file>.bad` when possible. Any other read error is thrown: the caller must not rebuild and then
 * replace a file it could not read.
 */
export function readState<T>(file: string, restore: (value: unknown) => T): T | null {
  let text: string;
  try {
    text = retryBusy(() => readTextFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    return restore(JSON.parse(text));
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof InvalidState)) throw error;
    console.warn('[state] invalid content', file, error.message);
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
