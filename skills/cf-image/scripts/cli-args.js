"use strict";
/** Minimal `--flag value` / `--bool-flag` parser. No deps, no experimental
 * Node APIs (avoids relying on util.parseArgs stability across Node 18-22). */
function parseFlags(argv, boolFlags = []) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (boolFlags.includes(key)) {
      out[key] = true;
    } else {
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

module.exports = { parseFlags };
