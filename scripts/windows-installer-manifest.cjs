// Hashes the final Windows payload, including the executable after resource editing.
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ({ appOutDir, electronPlatformName, targets }) => {
  if (electronPlatformName !== 'win32' || !targets.some(({ name }) => name === 'nsis')) return;

  const ownership = readFileSync(join(__dirname, '..', 'installer', 'program-files.nsh'), 'utf8');
  const owned = new Set([...ownership.matchAll(/^\s+!insertmacro \$\{OP\} "([^"]+)"$/gm)].map((match) => match[1]));
  const manifest = new Map();
  function collect(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!prefix && !owned.has(entry.name)) throw new Error(`Unmanaged installer payload entry: ${entry.name}`);
      const path = join(dir, entry.name);
      const relative = prefix + entry.name;
      if (entry.isDirectory()) collect(path, relative + '\\');
      else if (entry.isFile()) manifest.set(relative, createHash('sha256').update(readFileSync(path)).digest('hex'));
      else throw new Error(`Unsupported installer payload entry: ${relative}`);
    }
  }
  collect(appOutDir, '');
  for (const required of [
    'Coopanion.exe',
    'resources\\app-update.yml',
    'resources\\app\\core\\boot.ts',
    'resources\\app\\node_modules\\tsx\\dist\\loader.mjs',
  ]) {
    if (!manifest.has(required)) throw new Error(`Missing installer payload entry: ${required}`);
  }
  const lines = [...manifest].map(([path, hash]) => {
    const line = `${hash} ${path}`;
    // FileReadUTF16LE needs room for CRLF and a terminator in the NSIS string buffer.
    if (line.length + 2 >= 1024) throw new Error(`NSIS manifest line exceeds the string limit: ${path}`);
    return line;
  });
  writeFileSync(join(appOutDir, 'coopanion-payload.sha256'), '\uFEFF' + [...lines, 'END', ''].join('\r\n'), 'utf16le');
};
