"use strict";
/**
 * cf-image core - shared logic for the Cloudflare Workers AI image generation toolkit.
 *
 * Zero dependencies - only Node.js built-ins (fetch, FormData, Blob, fs, path,
 * os), all stable since Node 18. No `npm install` step, so this works
 * anywhere Claude Code itself runs (Claude Code IS a Node app, so Node is
 * always present) - including offline/restricted cloud sandboxes.
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
const BUDGET_WARNING_FRACTION = 0.6; // warn once daily usage crosses 60% of the free allocation

// Model "tier" here means relative cost within Workers AI, NOT whether a
// model is part of a "free plan" - the whole account draws from the same
// shared 10,000 neurons/day free allocation regardless of which model is
// used (see FREE_DAILY_NEURONS / getUsageToday). Two tiers:
//   "cheap"  - negligible cost, runs without confirmation
//   "costly" - meaningful cost, requires --allow-expensive to opt in
// `dev` is a "costly" model but disproportionately more so than the other
// three (~75% of the whole daily allocation per image) - called out in its
// own notes rather than as a separate code-level tier.

// Pricing (neuronsPer1024) is MEASURED from real 1024x1024 generations
// against a live account on 2026-07-22 - see references/models.md for the
// full writeup of per-model quirks (multipart requirements, a raw-binary
// response format, a safety-filter false positive, etc).
//
// bestFor / weakerFor are distilled from published benchmarks, vendor docs,
// and third-party comparisons (see references/models.md "Researched
// characteristics" section for sources) - reputational, not measured by us.
//
// referenceImages: 'confirmed' means multi-reference conditioning
// (input_image_0..input_image_3 multipart fields) has been exercised
// against the live API and works. 'experimental' means Cloudflare's
// changelog documents the same field naming for this model, by family
// similarity to klein4b, but it hasn't been tested here yet - treat as
// unconfirmed. false means no documented support at all.
const MODEL_CATALOG = {
  schnell: {
    id: "@cf/black-forest-labs/flux-1-schnell",
    tier: "cheap",
    requestFormat: "json",
    responseFormat: "json_base64",
    neuronsPer1024: 172.8,
    referenceImages: false,
    notes:
      "Fastest, 4-step distilled Flux. Good fallback for drafts when klein4b's safety filter blocks a prompt. Cost corrected 2026-07-23: a clean single-call header reading on a fresh day measured 172.8 neurons, not the 19.2 previously listed here (that figure was calculated from Cloudflare's published per-tile rate, not directly measured - same mistake we'd already caught for lucid-origin, just hadn't happened to catch for schnell until now). Still far cheaper than any costly-tier model.",
    bestFor: ["rapid drafts", "exploring composition/ideas", "high-volume low-stakes images", "thumbnails"],
    weakerFor: ["legible in-image text", "fine detail/complex hands", "photorealism at close range"],
  },
  klein4b: {
    id: "@cf/black-forest-labs/flux-2-klein-4b",
    tier: "cheap",
    requestFormat: "multipart",
    responseFormat: "json_base64",
    neuronsPer1024: 0,
    referenceImages: "confirmed",
    notes:
      "Measured 0 neurons billed for plain text-to-image across every call so far (confirmed via header + GraphQL analytics), but this is SUSPECTED to be a pricing bug or promotional launch rate, not an intentionally permanent free model - a newer/better model than schnell being priced below it doesn't make architectural sense. Treat the 0 cost as fragile: re-check cost.js after using it, and if it ever reports nonzero neurons, move it out of the default slot (schnell is the natural fallback). Requires multipart/form-data. Safety filter can false-positive on innocuous prompts (error code 3030) - reword if blocked, or fall back to schnell. Reference-image conditioning CONFIRMED WORKING 2026-07-23 (see referenceImages) and is NOT free - billed 5.37 neurons for one input image, matching Cloudflare's documented input-tile rate exactly.",
    bestFor: ["rapid drafts", "interactive/real-time iteration", "sub-second turnaround"],
    weakerFor: ["legible in-image text (worse than klein9b)", "fine texture detail"],
  },
  klein9b: {
    id: "@cf/black-forest-labs/flux-2-klein-9b",
    tier: "costly",
    requestFormat: "multipart",
    responseFormat: "json_base64",
    neuronsPer1024: 1363.64,
    referenceImages: "experimental",
    notes: "Sharper/more coherent than klein-4b. ~13.6% of the daily free allocation per image.",
    bestFor: ["near-production quality on a budget", "sharper faces/textures than the cheap tier", "most jobs without a hard legible-text requirement"],
    weakerFor: ["legible in-image text (flux-2-dev is meaningfully better)"],
  },
  phoenix: {
    id: "@cf/leonardo/phoenix-1.0",
    tier: "costly",
    requestFormat: "json",
    responseFormat: "raw_binary",
    neuronsPer1024: 3120,
    referenceImages: false,
    notes:
      "Leonardo Phoenix. Returns RAW image bytes directly (Content-Type: image/jpeg, no JSON wrapper, no per-request neuron header) - actual cost only visible afterwards via cost.js.",
    bestFor: ["complex multi-element/multi-constraint compositions", "logos, labels, posters, UI mockups needing legible text", "strict prompt adherence"],
    weakerFor: ["close-range photorealism (weaker skin/material realism than lucid)", "deliberately unusual/impossible prompts (can 'correct' them)"],
  },
  lucid: {
    id: "@cf/leonardo/lucid-origin",
    tier: "costly",
    requestFormat: "json",
    responseFormat: "json_base64",
    neuronsPer1024: 3904.69,
    referenceImages: false,
    notes: "Leonardo flagship. Best prompt adherence/polish of the Cloudflare-native models.",
    bestFor: ["photorealistic portraits/products/architecture", "convincing skin/hair/material detail", "final production assets when unsure which model to pick"],
    weakerFor: ["fastest iteration (favors quality over speed)"],
  },
  dev: {
    id: "@cf/black-forest-labs/flux-2-dev",
    tier: "costly",
    requestFormat: "multipart",
    responseFormat: "json_base64",
    neuronsPer1024: 7500,
    referenceImages: "experimental",
    notes:
      "Full (non-distilled) Flux.2. Best raw quality/detail and in-image text rendering, but ~75% of the ENTIRE daily free allocation for one image - far pricier than the other 'costly' models. Billed per step - actual cost can exceed this figure at non-default step counts.",
    bestFor: ["legible in-image text/typography (best in the catalog)", "final production/marketing assets", "multi-reference brand/character consistency", "maximum photorealism"],
    weakerFor: ["speed/cost - not for iteration or drafts"],
  },
};

const CHEAP_MODEL_KEYS = Object.keys(MODEL_CATALOG).filter((k) => MODEL_CATALOG[k].tier === "cheap");
const CHEAPEST_MODEL_KEY = "klein4b"; // 0 measured neurons, but see the suspected-bug caveat in its notes above; schnell is the fallback

class CfImageError extends Error {}

function slugify(text, maxLen = 40) {
  const slug = text
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (slug || "image").slice(0, maxLen);
}

// Convenience shorthand for --aspect-ratio "W:H", e.g. "16:9" or "9:16".
// Targets roughly the same total pixel count as the 1024x1024 default
// (~1.05MP), rounded to multiples of 64 (the usual diffusion-model
// dimension constraint). NOTE: only 1024x1024 has actually been exercised
// against the live API this session - other resolutions/ratios are
// untested per-model, same caveat as reference images.
function parseAspectRatio(ratioStr) {
  const m = /^(\d+):(\d+)$/.exec(ratioStr);
  if (!m) throw new CfImageError(`Invalid --aspect-ratio '${ratioStr}' - expected format like '16:9'.`);
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (w <= 0 || h <= 0) throw new CfImageError(`Invalid --aspect-ratio '${ratioStr}' - both sides must be positive.`);

  const targetPixels = 1024 * 1024;
  const scale = Math.sqrt(targetPixels / (w * h));
  const round64 = (n) => Math.max(256, Math.round((n * scale) / 64) * 64);
  return { width: round64(w), height: round64(h) };
}

// Shared by generate.js/batch.js: explicit --width/--height wins if given,
// otherwise --aspect-ratio if given, otherwise the 1024x1024 default.
function resolveDimensions({ width, height, aspectRatio }) {
  if (aspectRatio && (width || height)) {
    throw new CfImageError("Pass either --aspect-ratio or --width/--height, not both.");
  }
  if (aspectRatio) return parseAspectRatio(aspectRatio);
  return {
    width: width ? parseInt(width, 10) : 1024,
    height: height ? parseInt(height, 10) : 1024,
  };
}

// Pure math, no API call - lets the skill quote a cost before spending.
// `dev` is billed per-step so this uses the same measured default-step
// figure as everywhere else in this file; actual cost may differ if a
// different step count is ever exposed.
function estimateCost(modelKey, count = 1) {
  const entry = getModel(modelKey);
  const neurons = entry.neuronsPer1024 * count;
  return {
    model: modelKey,
    modelId: entry.id,
    tier: entry.tier,
    count,
    neurons: Math.round(neurons * 100) / 100,
    usd: Math.round(((neurons / 1000) * OVERAGE_RATE_PER_1000) * 10000) / 10000,
    fractionOfDailyBudget: Math.round((neurons / FREE_DAILY_NEURONS) * 1000) / 1000,
  };
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
  if (entry.tier === "cheap") return;
  if (allowExpensive) return;
  throw new CfImageError(
    `Model '${entry.key}' (${entry.id}) is a costly-tier model and costs ~${entry.neuronsPer1024} neurons/image ` +
      `(the account-wide free daily allocation is 10,000 neurons total). Pass --allow-expensive to opt in, or use a ` +
      `cheap model: ${CHEAP_MODEL_KEYS.join(", ")}.`
  );
}

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

async function generateImage({
  modelKey,
  prompt,
  width = 1024,
  height = 1024,
  outFile = null,
  allowExpensive = false,
  referenceImagePaths = [],
}) {
  const entry = getModel(modelKey);

  if (referenceImagePaths.length) {
    // EXPERIMENTAL / UNTESTED - see MODEL_CATALOG[key].referenceImages and
    // references/models.md. Cloudflare's changelog documents this field
    // naming for klein4b; we're assuming the same shape works for the other
    // multipart models but have not confirmed it against the live API.
    // Checked before the budget gate: no --allow-expensive flag fixes an
    // unsupported-model request, so that's the more useful error to surface.
    if (entry.requestFormat !== "multipart" || !entry.referenceImages) {
      throw new CfImageError(
        `Model '${entry.key}' has no documented reference-image support. Known candidates (untested): ` +
          Object.keys(MODEL_CATALOG)
            .filter((k) => MODEL_CATALOG[k].referenceImages)
            .join(", ")
      );
    }
    if (referenceImagePaths.length > 4) {
      throw new CfImageError("At most 4 reference images are supported (input_image_0..input_image_3).");
    }
  }

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
    referenceImagePaths.forEach((filePath, i) => {
      const bytes = fs.readFileSync(filePath);
      const blob = new Blob([bytes], { type: guessMimeType(filePath) });
      form.append(`input_image_${i}`, blob, path.basename(filePath));
    });
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

  const fractionUsed = total / FREE_DAILY_NEURONS;

  return {
    date: day,
    byModel,
    totalNeurons: Math.round(total * 100) / 100,
    freeTierLimit: FREE_DAILY_NEURONS,
    remaining: Math.round((FREE_DAILY_NEURONS - total) * 100) / 100,
    fractionUsed: Math.round(fractionUsed * 1000) / 1000,
    nearLimit: fractionUsed >= BUDGET_WARNING_FRACTION && total <= FREE_DAILY_NEURONS,
    overBudget: total > FREE_DAILY_NEURONS,
  };
}

async function checkBudgetWarning() {
  // Best-effort post-generation budget check: swallow errors (e.g. the
  // token lacks Account Analytics: Read, or analytics is lagging) rather
  // than failing a generation that already succeeded. Returns a warning
  // string to print, or null if there's nothing to warn about / the check
  // itself failed.
  try {
    const usage = await getUsageToday();
    if (usage.overBudget) {
      return `Heads up: today's free allocation is exhausted (${usage.totalNeurons}/${usage.freeTierLimit} neurons) - further requests will hard-block until reset.`;
    }
    if (usage.nearLimit) {
      const pct = Math.round(usage.fractionUsed * 100);
      return `Heads up: ${pct}% of today's free allocation used (${usage.totalNeurons}/${usage.freeTierLimit} neurons).`;
    }
    return null;
  } catch (e) {
    return null;
  }
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
  BUDGET_WARNING_FRACTION,
  MODEL_CATALOG,
  CHEAP_MODEL_KEYS,
  CHEAPEST_MODEL_KEY,
  CfImageError,
  slugify,
  parseAspectRatio,
  resolveDimensions,
  estimateCost,
  cfImageHome,
  defaultOutputDir,
  presetsDir,
  getModel,
  checkBudgetGate,
  generateImage,
  getUsageToday,
  checkBudgetWarning,
  hoursUntilReset,
  verifyToken,
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  applyPreset,
};
