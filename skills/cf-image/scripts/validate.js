#!/usr/bin/env node
"use strict";
/**
 * Validate that this environment is ready to use the cf-image toolkit:
 * checks env vars are set, and that CF_ACCOUNT_ID/CF_API_TOKEN can actually
 * reach the Cloudflare API. Run this first in any new environment (a
 * friend's machine, a cloud sandbox, CI) before generating images.
 *
 * Example:
 *   node validate.js
 */
const fs = require("fs");
const path = require("path");
const core = require("./core");

function check(label, ok, detail = "") {
  console.log(`[${ok ? "OK" : "FAIL"}] ${label}${detail ? " - " + detail : ""}`);
  return ok;
}

async function main() {
  let allOk = true;

  const accountId = process.env.CF_ACCOUNT_ID;
  allOk = check("CF_ACCOUNT_ID set", !!accountId) && allOk;

  const token = process.env.CF_API_TOKEN;
  allOk = check("CF_API_TOKEN set", !!token) && allOk;

  if (!accountId || !token) {
    console.log("\nSet both environment variables, then re-run this script.");
    console.log("PowerShell: $env:CF_ACCOUNT_ID = '...'; $env:CF_API_TOKEN = '...'");
    console.log("bash/zsh:   export CF_ACCOUNT_ID=...; export CF_API_TOKEN=...");
    process.exitCode = 1;
    return;
  }

  try {
    await core.verifyToken();
    check("Account/token reachable", true, `account: ${accountId}`);
  } catch (e) {
    check("Account/token reachable", false, e.message);
    console.log("\nToken needs 'Workers AI: Run' permission at minimum. Create/edit one at:");
    console.log("https://dash.cloudflare.com/profile/api-tokens");
    process.exitCode = 1;
    return;
  }

  try {
    const usage = await core.getUsageToday();
    check("Account Analytics: Read permission (for cost.js)", true, `${usage.totalNeurons}/${usage.freeTierLimit} neurons used today`);
  } catch (e) {
    allOk = check("Account Analytics: Read permission (for cost.js)", false, "cost.js won't work without this scope - " + e.message) && allOk;
  }

  const outDir = core.defaultOutputDir();
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const testFile = path.join(outDir, ".write_test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    check("Output directory writable", true, outDir);
  } catch (e) {
    allOk = check("Output directory writable", false, e.message) && allOk;
  }

  console.log("");
  if (allOk) {
    console.log('Setup looks good. Try: node generate.js --prompt "a test image"');
  } else {
    console.log("Some checks failed - fix the items marked FAIL above before generating images.");
    process.exitCode = 1;
  }
}

main();
