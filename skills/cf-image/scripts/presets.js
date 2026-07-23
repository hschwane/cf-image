#!/usr/bin/env node
"use strict";
/**
 * Manage named brand/style presets, merged into prompts via --preset on
 * generate.js. Stored as one JSON file per preset under
 * ~/.cf-image/presets/ (override with CF_IMAGE_HOME).
 *
 * Design adapted from the banana-claude plugin's preset system - see NOTICE.md.
 *
 * Examples:
 *   node presets.js list
 *   node presets.js show tech-saas
 *   node presets.js create tech-saas --style "clean minimal tech illustration, flat vectors, soft shadows" \
 *     --colors "#2563EB,#1E40AF,#F8FAFC" --typography "bold geometric sans-serif" \
 *     --lighting "bright diffused studio, no harsh shadows" --mood "professional, trustworthy, modern" \
 *     --description "Clean tech SaaS brand"
 *   node presets.js delete tech-saas --confirm
 */
const core = require("./core");
const { parseFlags } = require("./cli-args");

function cmdList() {
  const names = core.listPresets();
  if (!names.length) {
    console.log('No presets saved yet. Create one with: node presets.js create <name> --style "..."');
    return;
  }
  for (const name of names) {
    try {
      const p = core.getPreset(name);
      console.log(p.description ? `${name} - ${p.description}` : name);
    } catch (e) {
      console.log(`${name} (unreadable)`);
    }
  }
}

function cmdShow(name) {
  const p = core.getPreset(name);
  for (const field of ["description", "colors", "style", "typography", "lighting", "mood", "defaultModel", "defaultAspectRatio"]) {
    if (p[field] !== undefined) console.log(`${field}: ${Array.isArray(p[field]) ? p[field].join(", ") : p[field]}`);
  }
}

function cmdCreate(name, args) {
  if (args["default-model"]) core.getModel(args["default-model"]); // throws on an unknown key
  if (args["default-aspect-ratio"]) core.parseAspectRatio(args["default-aspect-ratio"]); // throws on a malformed ratio

  const data = {
    description: args.description,
    colors: args.colors ? args.colors.split(",").map((c) => c.trim()) : undefined,
    style: args.style,
    typography: args.typography,
    lighting: args.lighting,
    mood: args.mood,
    defaultModel: args["default-model"],
    defaultAspectRatio: args["default-aspect-ratio"],
  };
  const saved = core.savePreset(name, data, !!args.force);
  console.log(`Saved preset '${name}':`);
  for (const [k, v] of Object.entries(saved)) {
    if (k !== "name") console.log(`  ${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  }
}

function cmdDelete(name, args) {
  if (!args.confirm) {
    throw new core.CfImageError("Refusing to delete without --confirm.");
  }
  core.deletePreset(name);
  console.log(`Deleted preset '${name}'.`);
}

function main() {
  const [command, name, ...rest] = process.argv.slice(2);
  const args = parseFlags(rest, ["force", "confirm"]);

  try {
    if (command === "list") {
      cmdList();
    } else if (command === "show") {
      if (!name) throw new core.CfImageError("Usage: presets.js show <name>");
      cmdShow(name);
    } else if (command === "create") {
      if (!name) throw new core.CfImageError("Usage: presets.js create <name> [--style ...] [--colors ...] ...");
      cmdCreate(name, args);
    } else if (command === "delete") {
      if (!name) throw new core.CfImageError("Usage: presets.js delete <name> --confirm");
      cmdDelete(name, args);
    } else {
      throw new core.CfImageError("Usage: presets.js <list|show|create|delete> [name] [flags]");
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
