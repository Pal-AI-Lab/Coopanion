// Windows Setup records quiet update failures beside installer.log.
const { statSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');
const { samePath } = require('./data-dir.cjs');
const { readTextFile } = require('./read-text.cjs');

function takeInstallerFailure(programDir, localAppData) {
  const directories = [join(programDir, 'data', 'logs')];
  if (localAppData) directories.push(join(localAppData, 'Coopanion'));
  let latest = null;
  for (const directory of directories) {
    const marker = join(directory, 'last-update-error.txt');
    try {
      const [owner, version] = readTextFile(marker).split(/\r?\n/);
      if (!owner || !version || !samePath(programDir, owner)) continue;
      const { mtimeMs } = statSync(marker);
      unlinkSync(marker);
      if (!latest || mtimeMs > latest.mtimeMs) {
        latest = { mtimeMs, failure: { version, logFile: join(directory, 'installer.log') } };
      }
    } catch { /* absent or still open */ }
  }
  return latest?.failure ?? null;
}

module.exports = { takeInstallerFailure };
