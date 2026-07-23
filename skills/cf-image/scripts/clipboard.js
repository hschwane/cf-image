#!/usr/bin/env node
"use strict";
/**
 * Save the image currently on the system clipboard to a file, so it can be
 * passed to generate.js as --reference-image.
 *
 * Why this exists: an image the user pastes or attaches in chat is visible to
 * Claude but has NO path on disk, so it can't be handed to the API. If the
 * user pasted it (Ctrl+V), the same image is still on their clipboard - this
 * grabs it from there and gives it a real path.
 *
 * Zero dependencies: shells out to whatever the OS already provides.
 *   Windows - PowerShell + System.Windows.Forms.Clipboard  (TESTED)
 *   macOS   - osascript, clipboard as PNG                  (UNTESTED)
 *   Linux   - wl-paste (Wayland) or xclip (X11)            (UNTESTED)
 *
 * Examples:
 *   node clipboard.js
 *   node clipboard.js --out-file ./ref.png
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const core = require("./core");
const { parseFlags } = require("./cli-args");

// References live next to generated output, inside the working directory, so
// their paths stay relative/linkable like everything else cf-image writes.
function defaultInputDir() {
  return process.env.CF_IMAGE_INPUT_DIR || path.join(process.cwd(), ".cf-image", "input");
}

function grabWindows(outFile) {
  // Written to a temp .ps1 rather than passed via -Command: the script has
  // enough quoting/escaping that inlining it is fragile. -STA because
  // clipboard access requires a single-threaded apartment.
  const ps = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $img) { Write-Error "NO_IMAGE"; exit 1 }
$img.Save(${JSON.stringify(outFile)}, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
`;
  const scriptPath = path.join(os.tmpdir(), `cf-image-clip-${process.pid}.ps1`);
  fs.writeFileSync(scriptPath, ps, "utf8");
  try {
    execFileSync("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch (e) {
      /* best effort */
    }
  }
}

function grabMac(outFile) {
  // «class PNGf» is the AppleScript type for PNG clipboard data.
  const target = JSON.stringify(outFile);
  execFileSync("osascript", [
    "-e",
    "set thePng to (the clipboard as «class PNGf»)",
    "-e",
    `set theFile to open for access POSIX file ${target} with write permission`,
    "-e",
    "write thePng to theFile",
    "-e",
    "close access theFile",
  ], { stdio: ["ignore", "pipe", "pipe"] });
}

function grabLinux(outFile) {
  const attempts = [
    ["wl-paste", ["--type", "image/png"]],
    ["xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]],
  ];
  let lastErr;
  for (const [cmd, args] of attempts) {
    try {
      const buf = execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      if (buf && buf.length) {
        fs.writeFileSync(outFile, buf);
        return;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("neither wl-paste nor xclip produced an image");
}

function main() {
  const args = parseFlags(process.argv.slice(2));

  let outFile = args["out-file"];
  if (!outFile) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    outFile = core.uniqueOutFile(path.join(defaultInputDir(), `${stamp}-clipboard.png`));
  }
  core.ensureOutputDir(path.dirname(outFile));

  try {
    if (process.platform === "win32") grabWindows(outFile);
    else if (process.platform === "darwin") grabMac(outFile);
    else grabLinux(outFile);
  } catch (e) {
    const raw = ((e.stderr && e.stderr.toString()) || e.message || "").trim();
    const firstLine = raw.split(/\r?\n/)[0] || "";
    const noImage = /NO_IMAGE/.test(raw);
    console.error(
      noImage
        ? "Error: the clipboard doesn't contain an image. Copy an IMAGE (not a file or text) " +
            "first - e.g. take a screenshot, or right-click an image and choose 'Copy image'."
        : "Error: could not read an image from the clipboard. Make sure an IMAGE (not a file " +
            `or text) is currently copied. Detail: ${firstLine}`
    );
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
    console.error("Error: clipboard command reported success but produced no image file.");
    process.exitCode = 1;
    return;
  }

  const relPath = path.relative(process.cwd(), outFile).split(path.sep).join("/");
  const insideCwd = !relPath.startsWith("..") && !path.isAbsolute(relPath);
  if (insideCwd) console.log(`Saved (relative, use this for the chat link): ${relPath}`);
  console.log(`Saved: ${outFile}`);
  console.log(`Bytes: ${fs.statSync(outFile).size}`);
  console.log("Pass it on with: --reference-image " + JSON.stringify(outFile));
}

main();
