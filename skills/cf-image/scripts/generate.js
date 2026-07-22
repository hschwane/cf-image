#!/usr/bin/env node
"use strict";
/**
 * Generate a single image via Cloudflare Workers AI.
 *
 * Examples:
 *   node generate.js --prompt "a coral-colored octopus mascot logo"
 *   node generate.js --prompt "..." --model lucid --allow-expensive
 *   node generate.js --prompt "..." --preset tech-saas
 *   node generate.js --prompt "..." --model klein4b --reference-image ./ref.jpg
 *     (EXPERIMENTAL/UNTESTED - see references/models.md)
 */
const path = require("path");
const core = require("./core");
const { parseFlags } = require("./cli-args");

async function main() {
  const args = parseFlags(process.argv.slice(2), ["allow-expensive"], ["reference-image"]);

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

  const width = args.width ? parseInt(args.width, 10) : 1024;
  const height = args.height ? parseInt(args.height, 10) : 1024;
  const referenceImagePaths = args["reference-image"] || [];
  if (referenceImagePaths.length) {
    console.log(`WARNING: reference-image support is experimental/untested (${referenceImagePaths.length} image(s) attached). Report back if this works or fails.`);
  }

  let outFile = args["out-file"];
  if (!outFile) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    outFile = path.join(core.defaultOutputDir(), `${stamp}-${model}-${core.slugify(args.prompt)}.jpg`);
  }

  try {
    const result = await core.generateImage({
      modelKey: model,
      prompt,
      width,
      height,
      outFile,
      allowExpensive: !!args["allow-expensive"],
      referenceImagePaths,
    });

    console.log(`Saved: ${result.outFile}`);
    console.log(`Model: ${result.modelId} (tier: ${result.tier})`);
    if (result.neurons !== null) {
      const usd = (result.neurons / 1000) * core.OVERAGE_RATE_PER_1000;
      console.log(`Neurons used: ${result.neurons} (~${usd.toFixed(4)} USD)`);
    } else {
      console.log("Neurons used: not reported per-request for this model. Run cost.js in a few minutes for the confirmed figure.");
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
