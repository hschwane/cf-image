#!/usr/bin/env node
"use strict";
/**
 * Show today's Workers AI neuron usage by model and remaining free-tier budget.
 *
 * Examples:
 *   node cost.js
 *   node cost.js --date 2026-07-21
 *   node cost.js --json
 */
const core = require("./core");
const { parseFlags } = require("./cli-args");

async function main() {
  const args = parseFlags(process.argv.slice(2), ["json"]);

  let usage;
  try {
    usage = await core.getUsageToday(args.date);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(usage, null, 2));
    return;
  }

  console.log(`Workers AI usage for ${usage.date} (UTC):`);
  if (!usage.byModel.length) {
    console.log("  (no usage recorded yet today)");
  } else {
    for (const row of usage.byModel) {
      console.log(`  ${row.modelId.padEnd(45)} ${String(row.neurons).padStart(10)}`);
    }
  }

  console.log(`Total: ${usage.totalNeurons} neurons`);
  console.log(`Free daily budget: ${usage.freeTierLimit} neurons`);

  if (usage.overBudget) {
    const over = Math.round((usage.totalNeurons - usage.freeTierLimit) * 100) / 100;
    const cost = (over / 1000) * core.OVERAGE_RATE_PER_1000;
    console.log(`OVER budget by ${over} neurons.`);
    console.log("On Workers FREE plan this means further Workers AI requests are hard-blocked (HTTP 429) until reset - NOT billed automatically.");
    console.log(`On Workers PAID plan this would instead bill ~$${cost.toFixed(4)} as overage ($0.011/1,000 neurons) and continue working.`);
  } else {
    console.log(`Remaining free budget: ${usage.remaining} neurons`);
  }

  const hoursLeft = core.hoursUntilReset();
  console.log(`Free tier resets at 00:00 UTC (~${hoursLeft.toFixed(1)} hours from now).`);
  console.log("");
  console.log("Note: Cloudflare's analytics can lag a few minutes behind real-time usage.");
}

main();
