#!/usr/bin/env node
"use strict";
/**
 * Generate N variations of the same prompt. Defaults to the cheapest model
 * for cheap exploration before committing to a pricier model for the final pick.
 *
 * Examples:
 *   node batch.js --prompt "a coral-colored octopus mascot logo" --count 4
 *   node batch.js --prompt "..." --count 3 --aspect-ratio 16:9
 */
const fs = require("fs");
const path = require("path");
const core = require("./core");
const { parseFlags } = require("./cli-args");

async function main() {
  const args = parseFlags(process.argv.slice(2), ["allow-expensive"]);

  if (!args.prompt) {
    console.error("Error: --prompt is required");
    process.exitCode = 1;
    return;
  }

  let model = args.model || core.CHEAPEST_MODEL_KEY;
  if (!core.MODEL_CATALOG[model]) {
    console.error(`Error: Unknown model key '${model}'. Valid keys: ${Object.keys(core.MODEL_CATALOG).sort().join(", ")}`);
    process.exitCode = 1;
    return;
  }

  let prompt = args.prompt;
  if (args.preset) {
    try {
      const preset = core.getPreset(args.preset);
      prompt = core.applyPreset(prompt, preset);
      if (preset.defaultModel && !args.model) model = preset.defaultModel;
      console.log(`Prompt (with preset '${args.preset}' applied): ${prompt}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const count = args.count ? parseInt(args.count, 10) : 3;
  let width, height;
  try {
    ({ width, height } = core.resolveDimensions({ width: args.width, height: args.height, aspectRatio: args["aspect-ratio"] }));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const allowExpensive = !!args["allow-expensive"];

  const outDir = core.defaultOutputDir();
  fs.mkdirSync(outDir, { recursive: true });
  const slug = core.slugify(args.prompt, 30);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);

  const results = [];
  for (let i = 1; i <= count; i++) {
    const outFile = path.join(outDir, `${stamp}-${model}-${slug}-v${i}.jpg`);
    console.log(`[${i}/${count}] generating with ${model}...`);
    try {
      const r = await core.generateImage({ modelKey: model, prompt, width, height, outFile, allowExpensive });
      results.push(r);
      const neuronsMsg = r.neurons !== null ? `${r.neurons} neurons` : "neurons unknown - check cost.js";
      console.log(`  saved ${outFile} (${neuronsMsg})`);
    } catch (e) {
      console.error(`  [${i}/${count}] failed: ${e.message}`);
    }
  }

  const reported = results.filter((r) => r.neurons !== null);
  console.log("");
  console.log(`Batch complete: ${results.length}/${count} generated.`);
  if (reported.length) {
    const total = reported.reduce((a, r) => a + r.neurons, 0);
    console.log(`Total neurons (reported subset): ${total}`);
  }
  if (reported.length < results.length) {
    console.log("Some models in this batch don't report per-request neurons (e.g. phoenix) - run cost.js for the confirmed total.");
  }

  if (results.length) {
    const budgetWarning = await core.checkBudgetWarning();
    if (budgetWarning) console.log(budgetWarning);
  }
}

main();
