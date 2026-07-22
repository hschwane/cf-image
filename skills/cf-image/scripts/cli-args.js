"use strict";
/** Minimal `--flag value` / `--bool-flag` parser. No deps, no experimental
 * Node APIs (avoids relying on util.parseArgs stability across Node 18-22).
 *
 * multiFlags: keys that may be repeated (e.g. `--reference-image a.jpg
 * --reference-image b.jpg`) always come back as an array, even with zero or
 * one occurrence, so callers don't need to branch on type. */
function parseFlags(argv, boolFlags = [], multiFlags = []) {
  const out = {};
  for (const key of multiFlags) out[key] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (boolFlags.includes(key)) {
      out[key] = true;
    } else if (multiFlags.includes(key)) {
      out[key].push(argv[i + 1]);
      i++;
    } else {
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

module.exports = { parseFlags };
