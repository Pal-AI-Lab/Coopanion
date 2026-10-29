/**
 * Where the Windows installed build keeps its data, and the record that ties the program to it.
 *
 * The data directory is `data\` beside the program. An update or a reinstall can put the program in another
 * directory, which has no data of its own. Each start writes the record (`%LOCALAPPDATA%\Coopanion\data-location.json`:
 * the data directory, the program directory, and when it started), so a program that finds no data beside it
 * knows which data was used last. It then asks whether to take that data over or start a new one, and the
 * answer binds the record to the new program directory. Data beside the program always wins: a folder copied
 * whole keeps its own data.
 */
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { readTextFile } = require('./read-text.cjs');

/**
 * @typedef {{ data: string, program: string, startedAt: string }} DataRecord
 * @typedef {{ use: string } | { ask: 'inherit' | 'missing', record: DataRecord }} DataLocation
 */

/** Windows paths compare without case. */
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** The record in `file`, or null when there is none or it is not one. */
function readRecord(file) {
  try {
    const record = JSON.parse(readTextFile(file));
    return typeof record?.data === 'string' && typeof record.program === 'string' && typeof record.startedAt === 'string' ? record : null;
  } catch {
    return null;
  }
}

/** @param {string} file @param {DataRecord} record */
function writeRecord(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 2));
}

/**
 * The data directory for the program in `programDir`, or what to ask:
 * - data beside the program, or no record: `data\` beside the program;
 * - a record bound to this program directory: its data directory, `missing` when that is gone;
 * - a record from another program directory: `inherit` when its data is there, `missing` when it is not.
 * @param {{ programDir: string, record: DataRecord | null, exists?: (path: string) => boolean }} at
 * @returns {DataLocation}
 */
function locateData({ programDir, record, exists = existsSync }) {
  const beside = join(programDir, 'data');
  if (exists(join(beside, 'home')) || !record) return { use: beside };
  if (samePath(record.program, programDir)) return exists(record.data) ? { use: record.data } : { ask: 'missing', record };
  return exists(join(record.data, 'home')) ? { ask: 'inherit', record } : { ask: 'missing', record };
}

/** The data directory in a folder someone picked: the folder itself, or the `data` in an install folder; null when neither holds data. */
function dataDirIn(folder, exists = existsSync) {
  if (exists(join(folder, 'home'))) return folder;
  if (exists(join(folder, 'data', 'home'))) return join(folder, 'data');
  return null;
}

module.exports = { readRecord, writeRecord, locateData, dataDirIn };
