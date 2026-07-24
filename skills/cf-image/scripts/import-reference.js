#!/usr/bin/env node
"use strict";
/**
 * Turn an attached/uploaded file into a usable reference image.
 *
 * Why this exists: attachments are routed by FILE EXTENSION. Non-image types
 * arrive as real files with a path (readable byte-for-byte); images arrive
 * embedded in the message with no path and no bytes. So the way to get an
 * image through as data is to give it a non-image extension - either by
 * zipping it, or by renaming it before attaching. This script normalizes
 * whatever comes out of that back into a real image file.
 *
 * Handles:
 *   - .zip archives  -> extracts every image inside (STORED + DEFLATE)
 *   - renamed images -> detected by magic bytes, saved with the right suffix
 *   - plain images   -> copied through unchanged
 *
 * Zero dependencies: ZIP is parsed by hand, DEFLATE via Node's built-in zlib.
 *
 * Examples:
 *   node import-reference.js /root/.claude/uploads/<id>/<uuid>-photo.zip
 *   node import-reference.js ./foto.bin
 *   node import-reference.js a.zip b.jpgc          # several at once
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const core = require("./core");

// Signature -> extension. Order matters only for readability; each check is
// explicit below.
function sniffImageExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buf.length >= 6 && (buf.slice(0, 6).toString("latin1") === "GIF87a" || buf.slice(0, 6).toString("latin1") === "GIF89a")) return ".gif";
  if (buf.length >= 12 && buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return ".webp";
  return null;
}

function isZip(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

/**
 * Minimal ZIP reader. Walks the central directory rather than the local
 * headers, because local headers may carry sizes of 0 when a data descriptor
 * is used, while the central directory is always authoritative.
 * Returns [{ name, data }].
 */
function unzip(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  // The end-of-central-directory record sits in the last 64KB (+22 byte min).
  const from = Math.max(0, buf.length - 66 * 1024);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a valid ZIP archive (no end-of-central-directory record)");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("corrupt ZIP central directory");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString("utf8");

    // Local header carries its own name/extra lengths; the data starts after them.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);

    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`unsupported ZIP compression method ${method} for '${name}'`);

    entries.push({ name, data });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function saveImage(data, baseName, destDir) {
  const ext = sniffImageExt(data);
  if (!ext) return null;
  const stem = path.basename(baseName, path.extname(baseName)).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 30) || "reference";
  const outFile = core.uniqueOutFile(path.join(destDir, `${stem}${ext}`));
  fs.writeFileSync(outFile, data);
  return outFile;
}

function main() {
  const inputs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!inputs.length) {
    console.error(
      "Usage: node import-reference.js <file> [...]\n" +
        "Accepts a .zip containing images, an image whose extension was changed, or a plain image."
    );
    process.exitCode = 1;
    return;
  }

  const destDir = core.defaultInputDir();
  core.ensureOutputDir(destDir);
  const saved = [];

  for (const input of inputs) {
    if (!fs.existsSync(input)) {
      console.error(`Error: file not found: ${input}`);
      process.exitCode = 1;
      continue;
    }
    const buf = fs.readFileSync(input);

    try {
      if (isZip(buf)) {
        const entries = unzip(buf);
        const images = entries.filter((e) => sniffImageExt(e.data));
        if (!images.length) {
          console.error(`Error: ${path.basename(input)} contains no images (entries: ${entries.map((e) => e.name).join(", ") || "none"})`);
          process.exitCode = 1;
          continue;
        }
        for (const e of images) {
          const out = saveImage(e.data, e.name, destDir);
          if (out) saved.push(out);
        }
      } else {
        const out = saveImage(buf, path.basename(input), destDir);
        if (!out) {
          console.error(
            `Error: ${path.basename(input)} is neither a ZIP nor a recognized image ` +
              `(JPEG/PNG/GIF/WebP). If it's an image with a changed extension, it should still be ` +
              `detected - so this looks like a different file type.`
          );
          process.exitCode = 1;
          continue;
        }
        saved.push(out);
      }
    } catch (e) {
      console.error(`Error processing ${path.basename(input)}: ${e.message}`);
      process.exitCode = 1;
    }
  }

  if (!saved.length) return;

  console.log(`Imported ${saved.length} image(s):`);
  for (const f of saved) {
    const rel = path.relative(process.cwd(), f).split(path.sep).join("/");
    const insideCwd = !rel.startsWith("..") && !path.isAbsolute(rel);
    console.log(`  ${f}${insideCwd ? `   (relative: ${rel})` : ""}`);
  }
  console.log("");
  console.log("Pass to generate.js with: " + saved.map((f) => `--reference-image ${JSON.stringify(f)}`).join(" "));
}

main();
