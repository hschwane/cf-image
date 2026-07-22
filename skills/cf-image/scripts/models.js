#!/usr/bin/env node
"use strict";
/** List available Cloudflare Workers AI image models: tier, measured pricing,
 * and researched strengths/weaknesses (see references/models.md for sources). */
const core = require("./core");

function main() {
  const keys = Object.keys(core.MODEL_CATALOG).sort();

  console.log(`${"Key".padEnd(9)}${"Tier".padEnd(11)}${"Neurons/img".padEnd(13)}${"USD/img".padEnd(10)}Model ID`);
  console.log("-".repeat(100));
  for (const key of keys) {
    const e = core.MODEL_CATALOG[key];
    const usd = ((e.neuronsPer1024 / 1000) * core.OVERAGE_RATE_PER_1000).toFixed(4);
    console.log(`${key.padEnd(9)}${e.tier.padEnd(11)}${String(e.neuronsPer1024).padEnd(13)}${usd.padEnd(10)}${e.id}`);
  }

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
  console.log(`Free tier models (no flag needed): ${core.FREE_MODEL_KEYS.join(", ")}`);
  console.log("Free daily budget: 10,000 neurons total across all models (resets 00:00 UTC).");
  console.log("Paid/Expensive models: pass --allow-expensive to generate.js / batch.js");
  console.log("Run cost.js to see today's actual usage against the free budget.");
}

main();
