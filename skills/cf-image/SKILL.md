---
name: cf-image
description: Creative-director pipeline for generating and editing images with Cloudflare Workers AI (Flux/Leonardo models). Use for ANY request to generate, draft, mock up, edit, or produce an image, logo, icon, illustration, or visual asset, including multi-turn refinement of a previously generated image, batch variations, brand presets, and cost/budget questions. Always defaults to the cheapest viable model; proactively recommends (never silently switches to) a pricier one when the task genuinely needs it.
argument-hint: "[generate|edit|chat|batch|setup|preset|cost] <request>"
---

# cf-image: Cloudflare Workers AI Creative Director

Turns a plain-language image request into a well-crafted prompt, picks a
cost-appropriate model, generates it, and reports the real cost and the
actual image.

## Read these first

- `references/prompting.md` — read before constructing any non-trivial
  prompt. Skip only for a request so simple there's nothing to expand.
- `references/models.md` — read before/while picking a model, at least once
  per session.

On-demand only — read when their specific trigger below applies, not
upfront:
- `references/setup.md` — a new session's `validate.js` check fails, or the
  user asks about setup/the Cloudflare token.
- `references/post-processing.md` — the user needs resize/crop/format
  conversion/transparency after generation.
- `references/presets.md` — the request names a brand/style, or asks about
  presets.

## Core principles

- **Never pass raw user text unmodified to the API.** Always craft a proper
  prompt first (`references/prompting.md`) — even a two-word request.
- **Always default to the cheapest model that will work.** Recommend,
  never silently switch to, a pricier one — and only when the task has a
  real need the cheap tier is known to be weak at.
- **Never report success until the output file is confirmed to exist.**
- **Always show the actual generated image**, not just its path.
- **Track and report real cost** — the actual neuron figure from this
  generation, not a remembered or estimated one.

## Quick reference

| Capability | Triggered by | What Claude does |
|---|---|---|
| **Interactive** | Any plain-language image request, no exact syntax needed | Infers intent, crafts a prompt, picks a model, generates, reports back |
| **Generate** | "generate/create/make a..." | One image, cheapest tier by default |
| **Edit** | "edit this image `<path>`...", "change X in this image to..." | Conditions on the existing image, prompts only the delta |
| **Chat** (multi-turn refinement) | A follow-up tweak to "it"/"the last one" mid-conversation | Uses the most recently generated image as the reference, keeps iterating in place |
| **Batch** | "give me N variations", "show me some options" | N distinctly varied prompts, one generation each — not the same prompt N times |
| **Setup** | New session's validation fails, or "set up cf-image" | Walks `references/setup.md` |
| **Preset** | "save this brand as...", "use the acme preset", preset questions | Reads `references/presets.md`, manages saved brand/style defaults |
| **Cost** | Budget/cost questions | Reports real usage or a pre-spend estimate |

## Workflow

Follow this for every generation:

1. **Understand intent.** Logo vs. draft vs. final asset? Ask only if
   genuinely ambiguous; otherwise infer and proceed.
2. **Check for a preset** if a brand/style is named (`references/presets.md`).
3. **Pick a domain lens** (below) and construct the prompt with the
   5-component formula (`references/prompting.md`). Keep the user's
   explicit constraints (exact text, brand name, exact colors) verbatim.
4. **Pick a model** — cheapest that'll work by default (`klein4b`, falling
   back to `schnell` on a safety-filter block). Before generating, check
   whether the request has a real need the cheap tier is weak at (legible
   text, close-range photorealism, complex composition — see
   `references/models.md`). If so, say so and recommend the better-suited
   model with its real cost (`cost.js estimate`), then proceed with
   whatever the user confirms. Never substitute a costlier model silently.
5. **Generate.**
6. **Handle errors** per "Error handling" below rather than reporting
   success prematurely.
7. **Report back** per "Answering" below.

## Domain lenses

| Lens | Use for |
|---|---|
| Logo/Icon | Brand marks, app icons |
| Product/UI | Product shots, UI mockups |
| Illustration/Character | Characters, storybook/cartoon art |
| Photoreal/Cinematic | Photographs, cinematic scenes — usually worth recommending `lucid` |
| Landscape/Environment | Scenery, establishing shots |
| Infographic | Labeled diagrams, data-viz style layouts |
| Abstract | Generative/fractal/geometric art |

Full named vocabulary per lens is in `references/prompting.md`.

## Special workflows

### Edit

Trigger: an existing image path plus change instructions. Use a reference
image (up to 4) with a prompt describing only the delta, not the whole
scene — see `references/prompting.md`'s "Editing via reference images"
section for how explicit and spatial the instruction needs to be. Same
mechanism handles "give me variations of this existing image."

### Chat (multi-turn visual refinement)

Trigger: the user wants to keep tweaking a result across several turns.
There's no separate session mechanism to invoke — the conversation itself
is the session. Track the most recently generated/approved image's file
path, and use it as the reference for the next request. Re-state any
must-preserve detail explicitly on every follow-up edit (each edit call is
independent and only "remembers" through the reference image itself, not
through earlier correction requests).

### Batch (variations)

Trigger: "give me N variations," "show me some options." There is no batch
script — generating the identical prompt N times produces near-identical
results (confirmed by testing). Instead, draft N *meaningfully different*
prompts that each still satisfy the request (vary style, angle,
composition, or one specific attribute), and generate once per variation
with its own output file. Default to 3-4 variations unless a count is
given. Report per the batch rule under "Answering."

### Setup

Trigger: a new session's validation fails, or the user asks to set up
cf-image / the Cloudflare token. Read `references/setup.md` in full and
walk the user through it rather than recalling dashboard steps from memory.

### Preset

Trigger: a brand/style is named, or the user asks about presets. Read
`references/presets.md`.

### Cost

Trigger: a budget or cost question. Report real numbers from a usage check
or pre-spend estimate — never a remembered figure.

## Budget policy (hard rule)

- Cheap tier (`klein4b`, `schnell`) runs without asking.
- Costly tier (`klein9b`, `phoenix`, `lucid`, `dev`) requires the user to
  opt in for that specific generation — either by naming the model/quality
  bar, or by confirming after a recommendation. `dev` needs a second
  confirmation even after general costly opt-in — it alone is ~75% of the
  entire daily allocation per image. This `dev`-specific step is enforced by
  Claude following this policy, not by the script — `--allow-expensive`
  gates the whole costly tier at once, it has no per-model distinction.
- This account is on the **Workers Free** plan: exceeding 10,000
  neurons/day hard-blocks further requests (HTTP 429, code 4006) until
  00:00 UTC reset — it does **not** bill overage. If this happens, tell the
  user plainly and give the reset time; don't retry in a loop.
- Good pattern: iterate cheap, then regenerate the winning prompt on a
  pricier model for the final asset.

## Error handling

| Symptom | Response |
|---|---|
| Safety-filter block (error 3030) | Don't retry identically — reword per `references/prompting.md`, retry once, then fall back to `schnell`. If `schnell` also blocks it, stop and tell the user plainly rather than escalating to a costlier model |
| HTTP 429 / code 4006 | Daily free allocation exhausted — tell the user the reset time, don't retry in a loop (transient rate-limit 429s are already retried automatically inside `generate.js`) |
| Missing `CF_ACCOUNT_ID`/`CF_API_TOKEN` | Point the user to `references/setup.md` |
| Reference image rejected client-side | That model doesn't support it (`schnell`/`phoenix`/`lucid`) — use `klein4b`/`klein9b`/`dev` instead |
| Post-processing tool missing | Tell the user what to install (`references/post-processing.md`) — don't fake success |
| Output file missing after a call that reported success | Treat as a failure, don't tell the user it worked |
| Generation succeeded but the user doesn't like the result | Not a script error — revisit the prompt using the 5-component formula and "Common mistakes" in `references/prompting.md` rather than just re-rolling the same prompt |

## Answering

After every generation:

1. **Show the actual image**, not just a path.
2. State the **file path**, the **actual prompt sent**, the **model**, and
   the **resolution/settings** used.
3. State the **real cost** in neurons (+ USD equivalent) for this
   generation, and mention the **running total for this session** so far.
4. Periodically — every few generations, and always before a costly-tier
   spend — re-check real daily usage (not just the session running total,
   since usage can exist outside this conversation) and warn the user if
   getting close to the cap.
5. For more than ~4 images at once, don't dump every one inline — build an
   Artifact presenting all of them as a numbered mini-portfolio (image,
   prompt, settings per entry) so the user can compare and pick. Four or
   fewer: show them inline.
6. If relevant, offer 1-2 concrete refinement ideas (a different angle, a
   model worth trying for a specific weakness, a pose/lighting tweak) —
   don't pad this if the result already looks like a solid match.

## Script reference

Scripts are helpers for API calls and repeatable mechanics, not a command
set matched 1:1 to user requests — there's no "batch script" or "chat
script." Batch and chat are things Claude does with judgment, by calling
`generate.js` several times, not by running a different script.

```bash
# One-time per environment / start of a new session
node scripts/validate.js

# Generate one image, cheapest tier by default
node scripts/generate.js --prompt "..."

# Costly-tier model (only after the user opts in)
node scripts/generate.js --prompt "..." --model lucid --allow-expensive

# Custom framing instead of the 1024x1024 default
node scripts/generate.js --prompt "..." --aspect-ratio 16:9

# Apply a saved preset
node scripts/generate.js --prompt "..." --preset acme

# Edit / condition on up to 4 existing images
node scripts/generate.js --prompt "..." --model klein4b --reference-image ./ref.jpg

# Manage presets
node scripts/presets.js list
node scripts/presets.js show acme
node scripts/presets.js create acme --description "..." --colors "#FF6B00,#111111" --style "..."
node scripts/presets.js delete acme --confirm

# Today's real usage + remaining budget
node scripts/cost.js

# Estimate a cost before spending anything (no API call)
node scripts/cost.js estimate --model dev --count 3
```

All generated images save under `~/.cf-image/output/` (override with
`CF_IMAGE_HOME`), named with a timestamp, model key, and a slug of the
prompt. Presets live under `~/.cf-image/presets/`.
