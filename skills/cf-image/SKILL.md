---
name: cf-image
description: Creative-director pipeline for generating images with Cloudflare Workers AI (Flux/Leonardo models). Use when the user asks to generate, draft, mock up, or produce an image, logo, icon, illustration, or visual asset, or explicitly invokes /cf-image. Always defaults to the cheapest viable model; proactively recommends (never silently switches to) a pricier model when the task genuinely needs it.
---

# cf-image: Cloudflare Workers AI Creative Director

Turns a plain-language image request into a well-crafted prompt, picks a
cost-appropriate model, generates it, and reports the real cost. Heavily
inspired by [banana-claude](https://github.com/AgriciDaniel/banana-claude)'s
"creative director" pattern (intent → domain → structured prompt → generate
→ report) — adapted to target Cloudflare's Flux/Leonardo models instead of
Gemini, built on Node.js instead of Python (Claude Code itself runs on Node,
so it's guaranteed present everywhere this skill runs), and built around a
hard policy: **always pick the cheapest model that will work, recommend
rather than silently upgrade.** See `NOTICE.md` at the plugin root for the
full attribution.

Read `references/models.md` and `references/prompting.md` before crafting a
prompt if this is the first `cf-image` use in the session — they contain
measured pricing/quirks (multipart requirements, a raw-binary response
format, a safety-filter false positive) AND researched strengths/weaknesses
per model (what each is actually good/bad at), not obvious from Cloudflare's
docs alone.

## Prerequisites

`CF_ACCOUNT_ID` and `CF_API_TOKEN` env vars must be set (the token needs
`Workers AI: Run`, and `Account Analytics: Read` for cost checks). Run
`node scripts/validate.js` in a new environment to confirm both are working
before generating anything. All script paths below are relative to this
skill's own directory (`skills/cf-image/`).

## Core workflow

1. **Understand intent.** What's this actually for — a logo, an app icon, a
   blog header, a product shot, a throwaway draft? Ask only if genuinely
   ambiguous; otherwise infer from context and proceed.
2. **Pick a domain lens** (optional but improves output — see below) to steer
   composition and vocabulary.
3. **Construct the prompt.** Don't pass the user's raw phrasing straight
   through if it's terse — expand it using the Subject / Action / Setting /
   Composition / Style shape (details in `references/prompting.md`). Keep the
   user's actual intent and any explicit constraints (brand name, colors,
   exact text) verbatim and unambiguous. If a saved preset applies
   (`presets.js list`), mention it and use `--preset <name>` rather than
   re-describing the brand by hand.
4. **Pick a model — cheapest by default, recommend rather than silently
   upgrade.**
   - Default: `klein4b` (currently billing 0 neurons — the literal cheapest
     option). If it safety-filters a prompt (error 3030) or its output looks
     wrong for the ask, fall back to `schnell` (also free, ~19 neurons)
     rather than jumping straight to a paid model.
   - **Before generating**, check whether the ask has a real need a cheap
     model is known to be weak at (see each model's `best_for`/`weaker_for`
     in `references/models.md` — e.g. legible in-image text, close-range
     photorealism, complex multi-constraint composition). If so, **say so and
     recommend the better-suited model with its cost**, e.g. "klein4b/schnell
     tend to garble in-image text — flux-2-dev (~$0.08/image) renders it
     properly, want me to use that instead?" Then proceed with whatever the
     user confirms. Never silently substitute a paid model for what was
     asked.
   - If the user already named a paid model or said "best quality" /
     "final" / "production-ready" explicitly, that counts as opt-in — no
     need to ask again, just confirm cost before spending if it's the
     expensive tier (`dev`).
5. **Generate.** Call `generate.js` (single image) or `batch.js` (multiple
   variations — default to this when the user wants options/choices).
6. **Handle safety-filter blocks (error code 3030).** `klein4b` in particular
   can false-positive on innocuous prompts. Don't just retry identically —
   reword the prompt (soften action verbs, remove ambiguous phrasing) and
   retry once, or fall back to `schnell`. If it blocks again, tell the user
   and suggest they adjust the ask.
7. **Report back.** Always state: the file path saved, the actual prompt
   sent (if you expanded it), the model used, and the neuron cost (or "cost
   pending — analytics lags a few minutes" if the model doesn't report a
   per-request figure, i.e. `phoenix`).

## Domain lenses

Use these to steer vocabulary and composition:

- **Logo/Icon** — flat vector, centered subject, simple solid-color
  background (see "Transparency" in `references/prompting.md` — none of
  these models confirmed to output alpha), legible at small sizes.
- **Product/UI** — clean background, soft studio lighting, precise framing.
- **Illustration/Character** — describe pose, expression, art style
  explicitly (e.g. "flat vector illustration," "cartoon," "storybook").
- **Photoreal/Cinematic** — name a camera/lens feel, lighting direction, film
  stock or photographic reference if it helps ("shot on 35mm," "golden
  hour"). Recommend `lucid` for this lens if the free-tier draft isn't
  convincing enough.
- **Landscape/Environment** — establish scale, time of day, weather/mood.

## Budget policy (hard rule)

- Free models (`klein4b`, `schnell`) run without asking.
- Paid models (`klein9b`, `phoenix`, `lucid`) and the expensive model (`dev`,
  ~75% of the *entire* daily free budget per image) require the user to
  opt in for that specific generation — either by naming the model/quality
  bar explicitly, or by confirming after you recommend one per the workflow
  above.
- Before spending on a paid model, run `node scripts/cost.js` to check
  remaining daily budget, especially later in a session. This account is on
  the **Workers Free plan**: exceeding 10,000 neurons/day doesn't bill
  overage, it **hard-blocks all further Workers AI requests** (HTTP 429,
  code 4006) until reset at 00:00 UTC. If that happens, tell the user
  plainly and give the reset time — don't retry in a loop.
- Good pattern: iterate cheaply with `klein4b`/`schnell` via `batch.js`
  until the user likes a direction, *then* offer to regenerate that one
  winning prompt on a paid model for the final asset.

## Script reference

```bash
# One-time: confirm env vars + API access work in this environment
node scripts/validate.js

# List all models with tier, measured neuron cost, and researched strengths/weaknesses
node scripts/models.js

# Single image, cheapest tier by default
node scripts/generate.js --prompt "..."

# Single image, paid model (only after user opts in)
node scripts/generate.js --prompt "..." --model lucid --allow-expensive

# N variations for the user to pick from (defaults to the cheapest model)
node scripts/batch.js --prompt "..." --count 4

# Apply a saved brand/style preset
node scripts/generate.js --prompt "a rocket icon" --preset tech-saas

# Manage presets
node scripts/presets.js list
node scripts/presets.js create tech-saas --style "..." --colors "#2563EB,#F8FAFC" --mood "professional"

# Today's real neuron usage + remaining free budget
node scripts/cost.js
```

All generated images are saved under `~/.cf-image/output/` (override with
`CF_IMAGE_HOME`) with a timestamp, model key, and a slug of the prompt in the
filename — not inside the plugin's own installed directory, so it behaves
correctly whether this was cloned locally or installed via a marketplace.
Presets live under `~/.cf-image/presets/`.

## Not implemented (by design, not oversight)

- **Image editing / img2img / reference-image workflows.** Cloudflare's
  changelog documents `input_image_0`..`input_image_3` multipart fields for
  `klein4b`/`klein9b`/`dev`, but this hasn't been tested against the live
  API — don't claim it works. If a user asks for image editing, say it's not
  wired up yet rather than improvising an untested request shape.
- **Multi-turn "chat" sessions.** banana-claude has one, but it's a thin
  wrapper with no unique logic of its own (pure delegation to an external
  MCP server's session state) — Cloudflare Workers AI has no equivalent
  session concept for image models to build on.
- **A large "inspire" prompt-idea database.** banana-claude advertises
  "2,500+ curated prompts" but doesn't actually bundle that data in its own
  repo (confirmed by inspection) — not worth replicating an unverified
  claim. Use the domain lenses above and `references/prompting.md` instead.
- **`google/nano-banana-2-lite`** (routed through AI Gateway, not the
  Workers AI neuron system). It returned HTTP 402 "insufficient balance" on
  this account and needs either gateway balance or BYOK — out of scope for
  this toolkit. See `references/models.md` for details if the user asks
  about it specifically.
- **Legacy SDXL/DreamShaper models** exist on the account but weren't priced
  or tested this session — not in the catalog.
