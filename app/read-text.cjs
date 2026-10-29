/**
 * A text file's contents as Cortico's `readTextFile` (core/util.ts) decodes them: UTF-16 LE after that byte
 * order mark, otherwise UTF-8 with any byte order mark dropped. The main process reads text files through it.
 */
const { readFileSync } = require('node:fs');

function readTextFile(file) {
  const bytes = readFileSync(file);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString('utf8');
  return bytes.toString('utf8');
}

module.exports = { readTextFile };
