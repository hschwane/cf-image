#!/usr/bin/env node
"use strict";
/** List available Cloudflare Workers AI image models: tier, measured pricing,
 * and researched strengths/weaknesses (see references/models.md for sources). */
const core = require("./core");

function main() {
  const keys = Object.keys(core.MODEL_CATALOG).sort();

  console.log(`${"Key".padEnd(9)}${"Tier".padEnd(9)}${"Neurons/img".padEnd(13)}${"USD/img".padEnd(10)}${"RefImg".padEnd(8)}Model ID`);
  console.log("-".repeat(105));
  for (const key of keys) {
    const e = core.MODEL_CATALOG[key];
    const usd = ((e.neuronsPer1024 / 1000) * core.OVERAGE_RATE_PER_1000).toFixed(4);
    const refImg = e.referenceImages ? "yes*" : "no";
    console.log(`${key.padEnd(9)}${e.tier.padEnd(9)}${String(e.neuronsPer1024).padEnd(13)}${usd.padEnd(10)}${refImg.padEnd(8)}${e.id}`);
  }
  console.log("* = experimental/untested, see references/models.md");

  console.log("");
  for (const key of keys) {
    const e = core.MODEL_CATALOG[key];
    console.log(`${key} (${e.tier}, ~${e.neuronsPer1024} neurons/1024px img)`);
    console.log(`  ${e.notes}`);
    console.log(`  best for: ${e.bestFor.join(", ")}`);
    console.log(`  weaker for: ${e.weakerFor.join(", ")}`);
    console.log("");
  }

  console.log(`Cheapest model (default): ${core.CHEAPEST_MODEL_KEY}`);
  console.log(`Cheap-tier models (no flag needed): ${core.CHEAP_MODEL_KEYS.join(", ")}`);
  console.log("Costly-tier models: pass --allow-expensive to generate.js / batch.js");
  console.log("");
  console.log("Note: 'tier' is relative cost within Workers AI, not a 'free plan vs paid plan'");
  console.log("distinction - every model draws from the same account-wide free daily allocation");
  console.log("(10,000 neurons/day, resets 00:00 UTC). Run cost.js to see today's actual usage.");
}

main();
