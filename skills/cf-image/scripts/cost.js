#!/usr/bin/env node
"use strict";
/**
 * Show today's Workers AI neuron usage / free-tier budget, or estimate the
 * cost of a planned generation before spending anything.
 *
 * Examples:
 *   node cost.js
 *   node cost.js today --date 2026-07-21
 *   node cost.js today --json
 *   node cost.js estimate --model dev --count 3
 */
const core = require("./core");
const { parseFlags } = require("./cli-args");

async function runToday(argv) {
  const args = parseFlags(argv, ["json"]);

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
    if (usage.nearLimit) {
      const pct = Math.round(usage.fractionUsed * 100);
      console.log(`WARNING: ${pct}% of today's free allocation used - getting close to the ${usage.freeTierLimit}-neuron daily cap.`);
    }
  }

  const hoursLeft = core.hoursUntilReset();
  console.log(`Free tier resets at 00:00 UTC (~${hoursLeft.toFixed(1)} hours from now).`);
  console.log("");
  console.log("Note: Cloudflare's analytics can lag a few minutes behind real-time usage.");
}

function runEstimate(argv) {
  const args = parseFlags(argv, ["json"]);

  if (!args.model) {
    console.error("Error: --model is required, e.g. node cost.js estimate --model dev --count 3");
    process.exitCode = 1;
    return;
  }

  let est;
  try {
    est = core.estimateCost(args.model, args.count ? parseInt(args.count, 10) : 1);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(est, null, 2));
    return;
  }

  const pct = Math.round(est.fractionOfDailyBudget * 1000) / 10;
  console.log(`Estimated cost for ${est.count}x ${est.modelId} (tier: ${est.tier}):`);
  console.log(`  ${est.neurons} neurons (~$${est.usd.toFixed(4)} USD, ~${pct}% of the daily free allocation)`);
  console.log("This is a static estimate (no API call) - doesn't check remaining budget. Run 'node cost.js today' for that.");
  if (est.model === "dev") {
    console.log("Note: dev is billed per-step, not a flat per-image rate - this uses the measured default-step figure and may be off if step count ever changes.");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let mode = "today";
  let rest = argv;
  if (argv.length && !argv[0].startsWith("--")) {
    mode = argv[0];
    rest = argv.slice(1);
  }

  if (mode === "today") return runToday(rest);
  if (mode === "estimate") return runEstimate(rest);

  console.error(`Error: Unknown mode '${mode}'. Valid modes: today, estimate.`);
  process.exitCode = 1;
}

main();
