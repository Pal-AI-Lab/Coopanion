/** Settings-window size in DIP, stored under the app's data directory. */
const { readFileSync, writeFileSync, renameSync } = require('node:fs');

const DEFAULT_SIZE = { width: 1200, height: 820 };
const MIN_SIZE = { width: 880, height: 600 };

function readSettingsSize(file, area) {
  let size = DEFAULT_SIZE;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (Number.isInteger(saved?.width) && Number.isInteger(saved?.height)) size = saved;
  } catch { /* A missing or damaged preference uses the default size. */ }
  const minWidth = Math.min(area.width, MIN_SIZE.width);
  const minHeight = Math.min(area.height, MIN_SIZE.height);
  return {
    minWidth, minHeight,
    width: Math.min(area.width, Math.max(minWidth, size.width)),
    height: Math.min(area.height, Math.max(minHeight, size.height)),
  };
}

function saveSettingsSize(file, { width, height }) {
  writeFileSync(file + '.tmp', JSON.stringify({ width, height }) + '\n');
  renameSync(file + '.tmp', file);
}

module.exports = { DEFAULT_SIZE, MIN_SIZE, readSettingsSize, saveSettingsSize };
