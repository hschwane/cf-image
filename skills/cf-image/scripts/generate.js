#!/usr/bin/env node
"use strict";
/**
 * Generate a single image via Cloudflare Workers AI.
 *
 * Examples:
 *   node generate.js --prompt "a coral-colored octopus mascot logo"
 *   node generate.js --prompt "..." --model lucid --allow-expensive
 *   node generate.js --prompt "..." --preset tech-saas
 *   node generate.js --prompt "..." --aspect-ratio 16:9
 *   node generate.js --prompt "..." --model klein4b --reference-image ./ref.jpg
 *     (repeatable up to 4x - see references/models.md for per-model support)
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
  let presetAspectRatio;
  if (args.preset) {
    try {
      const preset = core.getPreset(args.preset);
      prompt = core.applyPreset(prompt, preset);
      if (preset.defaultModel && !args.model) model = preset.defaultModel;
      presetAspectRatio = preset.defaultAspectRatio;
      console.log(`Prompt (with preset '${args.preset}' applied): ${prompt}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }

  // Explicit --width/--height/--aspect-ratio always wins over a preset's
  // defaultAspectRatio, which only fills in what the user didn't specify.
  const aspectRatio = args["aspect-ratio"] || (!args.width && !args.height ? presetAspectRatio : undefined);

  let width, height;
  try {
    ({ width, height } = core.resolveDimensions({ width: args.width, height: args.height, aspectRatio }));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const referenceImagePaths = args["reference-image"] || [];

  let outFile = args["out-file"];
  if (!outFile) {
    const outDir = args["out-dir"] || core.defaultOutputDir();
    core.warnIfOutputInsideSkill(outDir);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    // Keep the prompt slug short - long filenames are unwieldy in the chat
    // and the timestamp already guarantees uniqueness.
    outFile = core.uniqueOutFile(path.join(outDir, `${stamp}-${model}-${core.slugify(args.prompt, 20)}.jpg`));
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

    // The working-directory-relative path is what makes a clickable markdown
    // link in chat - print it first and explicitly so it gets used.
    const relPath = path.relative(process.cwd(), result.outFile).split(path.sep).join("/");
    const insideCwd = !relPath.startsWith("..") && !path.isAbsolute(relPath);
    if (insideCwd) {
      console.log(`Saved (relative, use this for the chat link): ${relPath}`);
    }
    console.log(`Saved: ${result.outFile}`);
    console.log(`Model: ${result.modelId} (tier: ${result.tier})`);
    if (result.neurons !== null) {
      const usd = (result.neurons / 1000) * core.OVERAGE_RATE_PER_1000;
      console.log(`Neurons used: ${result.neurons} (~${usd.toFixed(4)} USD)`);
    } else {
      console.log("Neurons used: not reported per-request for this model. Run cost.js in a few minutes for the confirmed figure.");
    }

    const budgetWarning = await core.checkBudgetWarning();
    if (budgetWarning) console.log(budgetWarning);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
