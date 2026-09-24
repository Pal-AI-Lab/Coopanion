const { existsSync } = require('node:fs');
const { join } = require('node:path');

/** Keep existing installs on their data and single-instance lock; new installs use the new name. */
function macDataPath(appData) {
  const current = join(appData, 'Coopanion');
  const legacy = join(appData, 'CortiCompanion');
  return !existsSync(join(current, 'home')) && existsSync(legacy) ? legacy : current;
}

module.exports = { macDataPath };
