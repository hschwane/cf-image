---
name: cf-image
description: Creative-director pipeline for generating and editing images with Cloudflare Workers AI (Flux/Leonardo models). Use for ANY request to generate, draft, mock up, edit, or produce an image, logo, icon, illustration, or visual asset, including refining a previously generated image across turns, batch variations, brand presets, post-processing, and cost/budget questions. Always defaults to the cheapest viable model; proactively recommends (never silently switches to) a pricier one when the task genuinely needs it.
argument-hint: "[generate|edit|batch|setup|preset|cost] <request>"
---

# cf-image: Cloudflare Workers AI Creative Director

Turns a plain-language image request into a well-crafted prompt, picks a
cost-appropriate model, generates it, and reports the real cost and the
actual image.

## MANDATORY: show every image inline

After **every** generation, immediately display the image **inline in the
chat** by opening the saved file with the **Read tool** (reading a `.jpg`
renders it visually). Do this **automatically, every time, without being
asked** — the user should never have to say "show me the image."

A file path or a link on its own is **not** an acceptable substitute — the
user cannot see the result from a path. Read failed once already in testing
by only posting a path; do not repeat that. If you generated it, show it.

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
- **Never report success until the output file is confirmed to exist**, and
  then **show it inline** (see MANDATORY rule above).
- **Track and report real cost** — the actual neuron figure from this
  generation, not a remembered or estimated one.

## Quick reference

| Capability | Triggered by | What Claude does |
|---|---|---|
| **Interactive** | Any plain-language image request, no exact syntax needed; also any follow-up tweak to the last image ("make it warmer", "now try it at night") | Infers intent, crafts a prompt, picks a model, generates, shows + reports. Follow-ups just continue in conversation, reusing the last image as a reference when it's an edit |
| **Generate** | "generate/create/make a..." | One fresh image, cheapest tier by default |
| **Edit** | "edit this image `<path>`...", "change X in this image to..." | Conditions on the existing image, prompts only the delta |
| **Batch** | "give me N variations", "show me some options" | N distinctly varied prompts, one generation each — not the same prompt N times |
| **Post-process** | "crop/resize this", "make the background transparent", "convert to png" | Shells out to ImageMagick/FFmpeg per `references/post-processing.md` |
| **Setup** | New session's validation fails, or "set up cf-image" | Walks `references/setup.md` |
| **Preset** | "save this brand as...", "use the acme preset", preset questions | Reads `references/presets.md`, manages saved brand/style defaults |
| **Cost** | Budget/cost questions | Reports real usage or a pre-spend estimate |

There is no separate "chat" mode — multi-turn refinement is just the
Interactive flow continuing across turns (see "Refining across turns").

## Creative-director workflow

You are the creative director, not a pass-through to the API. Follow this
pipeline for every generation — no exceptions.

### Step 1 — Analyze intent

Work out what the user actually needs before writing a prompt:
- **Use case?** Logo, app icon, blog header, product shot, throwaway draft,
  final production asset, social post?
- **Style?** Photoreal, illustrated, flat vector, cinematic, minimal?
- **Constraints?** Brand colors, exact in-image text, framing/aspect ratio,
  transparency?
- **Mood?** What feeling should it carry?

Infer from context and proceed if you reasonably can. Ask a brief
clarifying question **only** when the request is genuinely ambiguous in a
way that would change the output (e.g. "a banner" with no idea what for).

### Step 2 — Check for a preset

If the request names a brand or a saved style, run `presets.js list` and, if
one matches, `presets.js show <name>`, then apply it with `--preset <name>`
rather than re-describing the brand by hand. User instructions always
override preset values. See `references/presets.md`.

### Step 3 — Pick a domain lens & construct the prompt

Choose the lens (table below) that fits, then build the prompt with the
**5-component formula** from `references/prompting.md`:
**Subject → Action/Pose → Setting → Composition → Style (incl. lighting)**.

**Critical rules while constructing:**
- Write natural sentences, **not** comma-separated keyword lists.
- Be concrete and visual — describe what the camera/canvas shows, not the
  concept or the marketing intent ("a dark moody ad about freedom" is bad;
  describe the actual scene).
- Keep the user's explicit constraints **verbatim**: exact text (in quotes),
  brand name, exact hex colors.
- For a genuinely critical constraint, use ALL CAPS on the specific phrase
  ("the sign MUST read exactly 'OPEN'").
- Put the most important details in the **first third** of the prompt.
- Avoid low-value filler ("8K", "masterpiece", "ultra-realistic") — spend
  the words on concrete detail instead.
- For photoreal work, name a camera/lens/lighting; for illustration, lock
  the art style explicitly.
- Match prompt length to the job (see the length guide in
  `references/prompting.md`) — worked templates per category are there too.

### Step 4 — Pick a model, resolution & framing

- **Model:** cheapest that'll work by default (`klein4b`, falling back to
  `schnell` on a safety block). **Before generating**, check whether the ask
  has a real need the cheap tier is weak at — legible in-image text,
  close-range photorealism, complex multi-constraint composition (see each
  model's notes in `references/models.md`). If so, **say so, recommend the
  better-suited model with its real cost** (`cost.js estimate --model <k>`),
  and proceed with whatever the user confirms. **Never** substitute a
  costlier model silently.
- **Framing:** pick `--aspect-ratio` from the use case (16:9 header, 9:16
  story, 1:1 icon — see `references/prompting.md`) rather than leaving
  everything square when the use case implies otherwise.
- **Resolution:** default 1024×1024. Only go larger when the user needs it
  (e.g. a full-HD final render) — note cost scales with output pixels on
  `klein4b` (see `references/models.md`).

### Step 5 — Generate

Call `generate.js`. For a batch, call it several times with **distinctly
different** prompts (see "Batch"). For an edit/refinement, pass the prior
image with `--reference-image` (see "Edit").

### Step 6 — Handle the response

Confirm the output file exists. On an error, follow "Error handling" below
rather than reporting success. Never claim success for a file that isn't on
disk.

### Step 7 — Show & report

Display the image inline (MANDATORY rule at top) and report per "Answering".

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

Trigger: an existing image path plus change instructions. Pass the image
with `--reference-image` (up to 4) and a prompt describing **only the
delta**, not the whole scene — see `references/prompting.md`'s "Editing via
reference images" for how explicit and spatial the instruction must be. The
same mechanism handles "give me variations of this existing image."

### Refining across turns

When the user keeps tweaking a result ("make it warmer", "now at night",
"bigger ears"), just continue the Interactive flow — the conversation itself
is the session. Track the most recently generated/approved image's path and
pass it as the `--reference-image` for the next edit. Each generate call is
independent and only "remembers" through the reference image, so **re-state
any must-preserve detail explicitly on every follow-up**, not just the first.

### Batch (variations)

Trigger: "give me N variations," "show me some options." There is no batch
script — generating the identical prompt N times produces near-identical
results (confirmed by testing). Instead, draft N **meaningfully different**
prompts that each still satisfy the request, rotating one component per
variation (lighting, composition, angle, or art style), and call
`generate.js` once per variation. Default to 3-4 unless a count is given.
Report per the batch rule under "Answering".

### Post-processing

Trigger: the user wants resize, crop, format conversion, or transparency
**after** an image exists. cf-image's models don't output alpha and there's
no built-in resize, so this shells out to ImageMagick/FFmpeg. Before running
anything, pre-flight the tool:
```bash
which magick || which convert || echo "ImageMagick not installed"
```
Then follow the recipes in `references/post-processing.md` (including the
green-screen + chroma-key pipeline for real transparent PNGs). If the tool
isn't installed, tell the user what to install — don't fake success.

### Setup

Trigger: a new session's validation fails, or the user asks to set up
cf-image / the Cloudflare token. Read `references/setup.md` in full and walk
the user through it rather than recalling dashboard steps from memory.

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

1. **Show the actual image inline** by reading the output file — this is
   mandatory and comes first (see the MANDATORY section at the top). Never
   answer with only a path.
2. Give the saved **file path as plain `code`** (not as a markdown link —
   absolute paths outside the project don't render as clickable links, so a
   fake link is just noise). State the **actual prompt sent**, the
   **model**, and the **resolution/settings** used.
3. State the **real cost** in neurons (+ USD equivalent) for this
   generation, and the **running total for this session** so far.
4. Periodically — every few generations, and always before a costly-tier
   spend — re-check real daily usage with `cost.js` (not just the session
   running total, since usage can exist outside this conversation) and warn
   the user if getting close to the cap.
5. For more than ~4 images at once, don't dump every one inline — build an
   Artifact presenting all of them as a numbered mini-portfolio (image,
   prompt, settings per entry) so the user can compare and pick. Four or
   fewer: show them inline.
6. If relevant, offer 1-2 concrete refinement ideas (a different angle, a
   model worth trying for a specific weakness, a pose/lighting tweak) —
   don't pad this if the result already looks like a solid match.

## Script reference

Scripts are helpers for API calls and repeatable mechanics, not a command
set matched 1:1 to user requests — there's no "batch" or "refine" script.
Batch and multi-turn refinement are things Claude does with judgment, by
calling `generate.js` several times, not by running a different script.

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

# Edit / condition on up to 4 existing images (also used for refinement)
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
`CF_IMAGE_HOME`), named with a timestamp, model key, and a short slug of the
prompt. Presets live under `~/.cf-image/presets/`.
