"use strict";
/**
 * cf-image core - shared logic for the Cloudflare Workers AI image generation toolkit.
 *
 * Zero dependencies - only Node.js built-ins (fetch, FormData, fs, path, os),
 * all stable since Node 18. No `npm install` step, so this works anywhere
 * Claude Code itself runs (Claude Code IS a Node app, so Node is always
 * present) - including offline/restricted cloud sandboxes.
 *
 * Storage: generated images and saved presets live under ~/.cf-image/ by
 * default (override with the CF_IMAGE_HOME env var).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const API_BASE = "https://api.cloudflare.com/client/v4";
const FREE_DAILY_NEURONS = 10000;
const OVERAGE_RATE_PER_1000 = 0.011;

// Pricing (neuronsPer1024) is MEASURED from real 1024x1024 generations
// against a live account on 2026-07-22 - see references/models.md for the
// full writeup of per-model quirks (multipart requirements, a raw-binary
// response format, a safety-filter false positive, etc).
//
// bestFor / weakerFor are distilled from published benchmarks, vendor docs,
// and third-party comparisons (see references/models.md "Researched
// characteristics" section for sources) - reputational, not measured by us.
const MODEL_CATALOG = {
  schnell: {
    id: "@cf/black-forest-labs/flux-1-schnell",
    tier: "free",
    requestFormat: "json",
    responseFormat: "json_base64",
    neuronsPer1024: 19.2,
    notes: "Fastest, 4-step distilled Flux. Default for drafts, iteration, and batches.",
    bestFor: ["rapid drafts", "exploring composition/ideas", "high-volume low-stakes images", "thumbnails"],
    weakerFor: ["legible in-image text", "fine detail/complex hands", "photorealism at close range"],
  },
  klein4b: {
    id: "@cf/black-forest-labs/flux-2-klein-4b",
    tier: "free",
    requestFormat: "multipart",
    responseFormat: "json_base64",
    neuronsPer1024: 0,
    notes:
      "Measured 0 neurons billed (confirmed via header + GraphQL analytics) - likely promotional, not guaranteed permanent. Requires multipart/form-data. Safety filter can false-positive on innocuous prompts (error code 3030) - reword if blocked.",
    bestFor: ["rapid drafts", "interactive/real-time iteration", "sub-second turnaround"],
    weakerFor: ["legible in-image text (worse than klein9b)", "fine texture detail"],
  },
  klein9b: {
    id: "@cf/black-forest-labs/flux-2-klein-9b",
    tier: "paid",
    requestFormat: "multipart",
    responseFormat: "json_base64",
    neuronsPer1024: 1363.64,
    notes: "Sharper/more coherent than klein-4b. ~13.6% of the daily free budget per image.",
    bestFor: ["near-production quality on a budget", "sharper faces/textures than the free models", "most jobs without a hard legible-text requirement"],
    weakerFor: ["legible in-image text (flux-2-dev is meaningfully better)"],
  },
  phoenix: {
    id: "@cf/leonardo/phoenix-1.0",
    tier: "paid",
    requestFormat: "json",
    responseFormat: "raw_binary",
    neuronsPer1024: 3120,
    notes:
      "Leonardo Phoenix. Returns RAW image bytes directly (Content-Type: image/jpeg, no JSON wrapper, no per-request neuron header) - actual cost only visible afterwards via cost.js.",
    bestFor: ["complex multi-element/multi-constraint compositions", "logos, labels, posters, UI mockups needing legible text", "strict prompt adherence"],
    weakerFor: ["close-range photorealism (weaker skin/material realism than lucid)", "deliberately unusual/impossible prompts (can 'correct' them)"],
  },
  lucid: {
    id: "@cf/leonardo/lucid-origin",
    tier: "paid",
    requestFormat: "json",
    responseFormat: "json_base64",
    neuronsPer1024: 3904.69,
    notes: "Leonardo flagship. Best prompt adherence/polish of the Cloudflare-native models.",
    bestFor: ["photorealistic portraits/products/architecture", "convincing skin/hair/material detail", "final production assets when unsure which model to pick"],
    weakerFor: ["fastest iteration (favors quality over speed)"],
  },
  dev: {
    id: "@cf/black-forest-labs/flux-2-dev",
    tier: "expensive",
    requestFormat: "multipart",
    responseFormat: "json_base64",
    neuronsPer1024: 7500,
    notes:
      "Full (non-distilled) Flux.2. Best raw quality/detail and in-image text rendering, but ~75% of the ENTIRE daily free budget for one image. Billed per step - actual cost can exceed this figure at non-default step counts.",
    bestFor: ["legible in-image text/typography (best in the catalog)", "final production/marketing assets", "multi-reference brand/character consistency", "maximum photorealism"],
    weakerFor: ["speed/cost - not for iteration or drafts"],
  },
};

const FREE_MODEL_KEYS = Object.keys(MODEL_CATALOG).filter((k) => MODEL_CATALOG[k].tier === "free");
const CHEAPEST_MODEL_KEY = "klein4b"; // 0 measured neurons; schnell (19.2) is the fallback if klein4b is unavailable/blocked

class CfImageError extends Error {}

function slugify(text, maxLen = 40) {
  const slug = text
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (slug || "image").slice(0, maxLen);
}

function cfImageHome() {
  return process.env.CF_IMAGE_HOME || path.join(os.homedir(), ".cf-image");
}

function defaultOutputDir() {
  return path.join(cfImageHome(), "output");
}

function presetsDir() {
  return path.join(cfImageHome(), "presets");
}

function accountAndToken() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) {
    throw new CfImageError("CF_ACCOUNT_ID / CF_API_TOKEN environment variables are not set.");
  }
  return { accountId, token };
}

function getModel(key) {
  const entry = MODEL_CATALOG[key];
  if (!entry) {
    const valid = Object.keys(MODEL_CATALOG).sort().join(", ");
    throw new CfImageError(`Unknown model key '${key}'. Valid keys: ${valid}`);
  }
  return { ...entry, key };
}

function checkBudgetGate(entry, allowExpensive) {
  if (entry.tier === "free") return;
  if (allowExpensive) return;
  throw new CfImageError(
    `Model '${entry.key}' (${entry.id}) is tier '${entry.tier}' and costs ~${entry.neuronsPer1024} neurons/image ` +
      `(free daily budget is 10,000 total). Pass --allow-expensive to opt in, or use a free model: ${FREE_MODEL_KEYS.join(", ")}.`
  );
}

async function generateImage({ modelKey, prompt, width = 1024, height = 1024, outFile = null, allowExpensive = false }) {
  const entry = getModel(modelKey);
  checkBudgetGate(entry, allowExpensive);
  const { accountId, token } = accountAndToken();

  const url = `${API_BASE}/accounts/${accountId}/ai/run/${entry.id}`;
  let body;
  const headers = { Authorization: `Bearer ${token}` };

  if (entry.requestFormat === "multipart") {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", String(width));
    form.append("height", String(height));
    body = form; // fetch sets Content-Type + boundary automatically for FormData
  } else {
    body = JSON.stringify({ prompt, width, height });
    headers["Content-Type"] = "application/json";
  }

  const resp = await fetch(url, { method: "POST", headers, body });
  const contentType = resp.headers.get("content-type") || "";
  const neuronsHeader = resp.headers.get("cf-ai-neurons");
  const buf = Buffer.from(await resp.arrayBuffer());

  if (!resp.ok) {
    const errText = buf.toString("utf-8");
    if (errText.includes('"code":4006') || errText.includes("daily free allocation")) {
      throw new CfImageError(
        "Daily free allocation (10,000 neurons) is used up for ALL models on this account. " +
          "Workers Free plan hard-blocks further requests until reset (00:00 UTC); it does NOT bill " +
          `overage automatically. Raw error: ${errText}`
      );
    }
    throw new CfImageError(`Cloudflare API error (${resp.status}) for model ${entry.id}: ${errText}`);
  }

  let neurons = null;
  if (neuronsHeader) {
    const n = parseFloat(neuronsHeader);
    if (!Number.isNaN(n)) neurons = n;
  }

  let imageBytes;
  if (entry.responseFormat === "raw_binary" || contentType.startsWith("image/")) {
    imageBytes = buf;
  } else {
    const parsed = JSON.parse(buf.toString("utf-8"));
    if (!parsed.success && parsed.errors) {
      throw new CfImageError(`Cloudflare API error for model ${entry.id}: ${JSON.stringify(parsed.errors)}`);
    }
    imageBytes = Buffer.from(parsed.result.image, "base64");
  }

  if (outFile) {
    const outDir = path.dirname(outFile);
    if (outDir) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, imageBytes);
  }

  return {
    model: modelKey,
    modelId: entry.id,
    tier: entry.tier,
    prompt,
    outFile,
    bytes: imageBytes.length,
    neurons,
  };
}

async function getUsageToday(date) {
  const { accountId, token } = accountAndToken();
  const day = date || new Date().toISOString().slice(0, 10);

  const query =
    "query GetUsage($accountTag: String!, $date: Date!) { " +
    "viewer { accounts(filter: {accountTag: $accountTag}) { " +
    "aiInferenceAdaptiveGroups(limit: 100, filter: {date: $date}) { " +
    "dimensions { modelId } sum { totalNeurons } } } } }";

  const resp = await fetch(`${API_BASE}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { accountTag: accountId, date: day } }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new CfImageError(`GraphQL request failed (${resp.status}): ${text}`);
  }
  const parsed = JSON.parse(text);
  if (parsed.errors) {
    throw new CfImageError(`GraphQL error: ${JSON.stringify(parsed.errors)}`);
  }

  const groups = parsed.data.viewer.accounts[0].aiInferenceAdaptiveGroups;
  let total = 0;
  const byModel = groups.map((g) => {
    const n = g.sum.totalNeurons;
    total += n;
    return { modelId: g.dimensions.modelId, neurons: Math.round(n * 100) / 100 };
  });
  byModel.sort((a, b) => b.neurons - a.neurons);

  return {
    date: day,
    byModel,
    totalNeurons: Math.round(total * 100) / 100,
    freeTierLimit: FREE_DAILY_NEURONS,
    remaining: Math.round((FREE_DAILY_NEURONS - total) * 100) / 100,
    overBudget: total > FREE_DAILY_NEURONS,
  };
}

function hoursUntilReset() {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return (reset.getTime() - now.getTime()) / 1000 / 3600;
}

async function verifyToken() {
  // Deliberately hits the Workers AI models endpoint (needs only "Workers AI:
  // Run") rather than the general /accounts/{id} endpoint, which needs
  // broader account-read permission a narrowly-scoped token won't have.
  const { accountId, token } = accountAndToken();
  const resp = await fetch(`${API_BASE}/accounts/${accountId}/ai/models/search?per_page=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new CfImageError(`Token/account check failed (${resp.status}): ${text}`);
  }
  const parsed = JSON.parse(text);
  if (!parsed.success) {
    throw new CfImageError(`Token/account check failed: ${JSON.stringify(parsed.errors)}`);
  }
  return { accountId };
}

// ---------------------------------------------------------------------------
// Presets: named brand/style defaults, stored as one JSON file per preset
// under ~/.cf-image/presets/. Schema and merge behavior adapted from the
// banana-claude plugin's preset system (see NOTICE.md for attribution).
// ---------------------------------------------------------------------------

const PRESET_FIELDS = ["description", "colors", "style", "typography", "lighting", "mood", "defaultModel"];

function sanitizePresetName(name) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new CfImageError(`Invalid preset name '${name}' - use letters, numbers, - and _ only.`);
  return safe;
}

function presetPath(name) {
  return path.join(presetsDir(), sanitizePresetName(name) + ".json");
}

function listPresets() {
  const d = presetsDir();
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

function getPreset(name) {
  const p = presetPath(name);
  if (!fs.existsSync(p)) {
    const known = listPresets();
    throw new CfImageError(`No preset named '${name}'. Known presets: ${known.length ? known.join(", ") : "(none)"}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function savePreset(name, data, overwrite = false) {
  fs.mkdirSync(presetsDir(), { recursive: true });
  const p = presetPath(name);
  if (fs.existsSync(p) && !overwrite) {
    throw new CfImageError(`Preset '${name}' already exists. Delete it first or pass overwrite.`);
  }
  const payload = { name: sanitizePresetName(name) };
  for (const field of PRESET_FIELDS) {
    if (data[field] !== undefined && data[field] !== null) payload[field] = data[field];
  }
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
  return payload;
}

function deletePreset(name) {
  const p = presetPath(name);
  if (!fs.existsSync(p)) throw new CfImageError(`No preset named '${name}'.`);
  fs.unlinkSync(p);
}

function applyPreset(prompt, preset) {
  // User's explicit prompt text always comes first and is never overridden -
  // preset fields are appended as additional style guidance.
  const extras = [];
  if (preset.style) extras.push(preset.style);
  if (preset.colors && preset.colors.length) extras.push("color palette: " + preset.colors.join(", "));
  if (preset.lighting) extras.push(preset.lighting);
  if (preset.typography) extras.push(preset.typography);
  if (preset.mood) extras.push(preset.mood + " mood");
  if (!extras.length) return prompt;
  return prompt.replace(/[.\s]+$/, "") + ", " + extras.join(", ");
}

module.exports = {
  API_BASE,
  FREE_DAILY_NEURONS,
  OVERAGE_RATE_PER_1000,
  MODEL_CATALOG,
  FREE_MODEL_KEYS,
  CHEAPEST_MODEL_KEY,
  CfImageError,
  slugify,
  cfImageHome,
  defaultOutputDir,
  presetsDir,
  getModel,
  checkBudgetGate,
  generateImage,
  getUsageToday,
  hoursUntilReset,
  verifyToken,
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  applyPreset,
};
