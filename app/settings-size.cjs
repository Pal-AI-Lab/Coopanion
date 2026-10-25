/** Settings-window size in DIP, stored under the app's data directory. */
const { readFileSync, writeFileSync, renameSync } = require('node:fs');

const DEFAULT_SIZE = { width: 1200, height: 800 };
const MIN_SIZE = { width: 880, height: 600 };

function readSettingsSize(file, area) {
  let size = DEFAULT_SIZE;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (Number.isInteger(saved?.width) && saved.width > 0 && Number.isInteger(saved?.height) && saved.height > 0) size = saved;
  } catch { /* A missing or damaged preference uses the default size. */ }
  return {
    width: Math.min(area.width, Math.max(MIN_SIZE.width, size.width)),
    height: Math.min(area.height, Math.max(MIN_SIZE.height, size.height)),
  };
}

function saveSettingsSize(file, { width, height }) {
  writeFileSync(file + '.tmp', JSON.stringify({ width, height }) + '\n');
  renameSync(file + '.tmp', file);
}

module.exports = { DEFAULT_SIZE, MIN_SIZE, readSettingsSize, saveSettingsSize };
