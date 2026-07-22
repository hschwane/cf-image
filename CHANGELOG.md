# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 0.2.0 — 2026-07-22

- Renamed model cost tiers from "free/paid/expensive" to "cheap/costly" —
  the old naming implied only some models were free-tier-eligible, when in
  fact all models share the same account-wide free daily allocation.
- Documented `klein4b`'s 0-neuron cost as a suspected pricing bug or
  promotional rate rather than an intentional permanent free model; kept it
  as the default but strengthened fallback-to-`schnell` guidance.
- Added a 60%-of-daily-allocation usage warning to `cost.js`.
- Added experimental, untested reference-image support
  (`--reference-image`, repeatable up to 4x, maps to Cloudflare's
  `input_image_0`..`input_image_3` multipart fields) for `klein4b`,
  `klein9b`, and `dev`.
- Rewrote the README: full Cloudflare account/API token setup walkthrough,
  prominent banana-claude credit at the top, skill-first documentation
  (the plugin is meant to be used through its Claude Code skill, not by
  calling the Node scripts directly), and removed any personal
  account-usage figures from the public document.

## 0.1.0 — 2026-07-22

Initial release.

- Cloudflare Workers AI text-to-image support for six models
  (`schnell`, `klein4b`, `klein9b`, `phoenix`, `lucid`, `dev`), with
  request/response handling for each model's actual quirks (multipart vs
  JSON requests, a raw-binary response format on `phoenix`).
- Real measured neuron pricing per model (Cloudflare's published per-tile
  rates didn't always match live behavior).
- Researched strengths/weaknesses/use-case guidance per model.
- Cheapest-model-by-default budget policy, with a hard gate on paid/expensive
  models requiring explicit opt-in.
- Live neuron usage + free-tier budget tracking via Cloudflare's GraphQL
  Analytics API, including correct handling of the Workers Free plan's
  hard-block-at-cap behavior (vs. Workers Paid's billed overage).
- Named brand/style presets (`presets.js`), adapted from banana-claude's
  preset system.
- `validate.js` environment/credential checker.
- Zero-dependency Node.js implementation (only built-ins: `fetch`,
  `FormData`, `fs`, `path`, `os`) - no `npm install` step required.
- Packaged as an installable Claude Code plugin/marketplace entry.
