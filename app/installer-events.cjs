// A quiet update that failed leaves `data\logs\last-update-error.txt` (installer/update.nsh): the
// program directory it was for and the version it was installing.
const { unlinkSync } = require('node:fs');
const { join } = require('node:path');
const { samePath } = require('./data-dir.cjs');
const { readTextFile } = require('./read-text.cjs');

/** The failed update recorded for this program directory, removing the record; null when there is none. */
function takeInstallerFailure(programDir) {
  const logs = join(programDir, 'data', 'logs');
  const marker = join(logs, 'last-update-error.txt');
  try {
    const [owner, version] = readTextFile(marker).split(/\r?\n/);
    unlinkSync(marker);
    return owner && version && samePath(programDir, owner) ? { version, logFile: join(logs, 'installer.log') } : null;
  } catch {
    return null;
  }
}

module.exports = { takeInstallerFailure };
