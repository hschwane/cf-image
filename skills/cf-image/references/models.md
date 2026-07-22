# Cloudflare Workers AI image models — measured reference

All figures below were measured by hand this session (2026-07-22) against a
live account, not just copied from docs — Cloudflare's published per-tile
rates didn't always match reality (see `flux-2-klein-4b` and `lucid-origin`).
Treat this file as the source of truth over the public pricing page for these
specific models.

## Free tier mechanics

- 10,000 neurons/day shared across **all** Workers AI models on the account,
  resets 00:00 UTC.
- This account is on the **Workers Free plan**. Confirmed by hitting the cap
  live: further requests return **HTTP 429, error code 4006**
  ("you have used up your daily free allocation... please upgrade to
  Cloudflare's Workers Paid plan"). This is a **hard block, not billed
  overage** — the commonly-cited "$0.011/1,000 neurons overage" rate only
  applies once upgraded to Workers Paid.
- Check current usage with `node scripts/cost.js` — it queries the
  `aiInferenceAdaptiveGroups` GraphQL Analytics dataset, which needs an API
  token with `Account Analytics: Read`. Analytics lags real-time usage by a
  few minutes.

## Model catalog

| Key | Model ID | Tier | Neurons / 1024px image (measured) | Request format | Response format |
|---|---|---|---|---|---|
| `schnell` | `@cf/black-forest-labs/flux-1-schnell` | Free | 19.2 | JSON body | JSON, base64 `result.image` |
| `klein4b` | `@cf/black-forest-labs/flux-2-klein-4b` | Free | **0** | multipart/form-data | JSON, base64 |
| `klein9b` | `@cf/black-forest-labs/flux-2-klein-9b` | Paid | 1,363.64 | multipart/form-data | JSON, base64 |
| `phoenix` | `@cf/leonardo/phoenix-1.0` | Paid | 3,120 | JSON body | **raw binary** (`Content-Type: image/jpeg`), no JSON wrapper |
| `lucid` | `@cf/leonardo/lucid-origin` | Paid | 3,904.69 | JSON body | JSON, base64 |
| `dev` | `@cf/black-forest-labs/flux-2-dev` | Expensive | 7,500 | multipart/form-data | JSON, base64 |

USD equivalents (Workers Paid plan overage rate, $0.011/1,000 neurons):
schnell ≈ $0.0002, klein9b ≈ $0.0150, phoenix ≈ $0.0343, lucid ≈ $0.0430,
dev ≈ $0.0825 per image.

## Per-model quirks discovered by testing

- **`schnell`**: plain JSON POST, no surprises. Good default.
- **`klein4b`**: a JSON body request returns HTTP 400
  `"required properties at '/' are 'multipart'"` — it *only* accepts
  multipart/form-data (fields: `prompt`, `width`, `height`, and optionally
  `input_image_0`..`input_image_3` for reference images, per Cloudflare
  changelog — untested here). Its safety filter also false-positived on the
  literal phrase "training kung fu" (error code 3030, "output has been
  flagged") while "practicing kung fu martial arts moves" for the same
  subject passed fine. Reword rather than retry identically on a 3030.
  Its neuron cost measured 0 across multiple separate calls, both via the
  per-request `cf-ai-neurons` header and via GraphQL analytics the next day
  — consistent enough to treat as free-tier, but this looks like a
  promotional/launch rate for a new model, not a permanent guarantee. If it
  starts reporting nonzero neurons, move it to the Paid tier in the catalog.
- **`klein9b`**: same multipart requirement as klein4b. Pricing is a flat
  per-megapixel rate (not per-tile), confirmed via header
  (`cf-ai-neurons: 1363.64`, exactly matching Cloudflare's documented
  "1363.64 per first MP" rate).
- **`phoenix-1.0`**: the odd one out — returns the JPEG bytes directly as the
  HTTP response body (`Content-Type: image/jpeg`), not JSON+base64 like every
  other model here. It also **doesn't send a `cf-ai-neurons` header at all**,
  so its cost is invisible until you query `node scripts/cost.js` afterward
  (analytics lag applies). Measured at 3,120 neurons for a 1024x1024 image.
- **`lucid-origin`**: JSON in, JSON+base64 out, header present. Measured
  3,904.69 neurons — notably higher than the ~2,544 a naive
  4-tiles-×-636-neurons calculation from Cloudflare's docs would suggest,
  implying the actual default render resolution or step count differs from
  what the flat per-tile rate assumes. Trust the measured figure.
- **`flux-2-dev`**: multipart, billed **per step** (input tile × step +
  output tile × step), not a flat per-image rate — the 7,500-neuron figure
  here is for Cloudflare's default step count at 1024x1024. Changing step
  count (if exposed) would change the price. By far the most expensive
  model tested — almost 6x `lucid-origin` and ~390x `schnell`.

## Researched characteristics (strengths / weaknesses / use cases)

Unlike the pricing/quirks above, this section is **not** measured by us —
it's synthesized from published benchmarks, vendor docs, and third-party
comparisons (sources at the end). Use it to decide which model actually
fits a task, not just which is cheapest.

- **`schnell`** (FLUX.1 [schnell], 12B rectified-flow transformer, distilled
  to 1-4 steps from FLUX.1 [dev]): the speed/cost floor of the whole
  lineup — ~7x faster than a full non-distilled Flux. Solid baseline
  anatomy and prompt adherence for a distilled model, but text rendering,
  overlapping fingers, and fine shadow/detail work are the first things to
  degrade. Best for: rapid drafts, thumbnails, high-volume low-stakes
  content, anything where speed matters more than fidelity.
- **`klein4b`** (FLUX.2 [klein] 4B, Apache-2.0, ~4B transformer + Qwen3-4B
  text encoder, fixed 4-step inference): the FLUX.2-generation equivalent of
  schnell — cheapest/fastest FLUX.2 tier, unifies text-to-image and
  image-editing/multi-reference in one model (editing not wired up in this
  toolkit yet — see "Not implemented" in SKILL.md). Visibly softer fine
  detail and less reliable text than `klein9b`. Best for: real-time/
  interactive iteration, drafts, sub-second turnaround.
- **`klein9b`** (FLUX.2 [klein] 9B, 9B transformer + Qwen3-8B text encoder,
  step-distilled to 4 steps): the standout value tier — blind-preference ELO
  testing puts it only ~9 points behind full FLUX.2 [dev] (1134 vs 1143),
  i.e. "matches or exceeds models 5x its size" per Black Forest Labs, at
  ~6% less cost per megapixel than `dev`. Its one real gap vs `dev` is
  in-image text legibility. Best for: near-production quality on a budget —
  the model to reach for when `schnell`/`klein4b` aren't good enough but
  `dev`'s cost isn't justified.
- **`dev`** (FLUX.2 [dev], full non-distilled ~32B-class model, ~28+ step
  diffusion, up to 10 reference images): the quality ceiling of the Flux
  family. Best-in-catalog legible in-image text/typography (confirmed in our
  own testing — it rendered "Kung Fu Master" cleanly on a belt, including a
  mirror reflection, when every cheaper model garbled or omitted text),
  strongest photorealism, highest prompt fidelity, reliable multi-reference
  brand/character consistency. No speed advantage — billed per step, so cost
  scales with resolution/step count, not a flat per-image rate. Reserve for
  final production assets, not iteration.
- **`phoenix`** (Leonardo Phoenix 1.0, Leonardo's first fully in-house
  foundation model): the prompt-adherence and typography specialist —
  reported ~95% adherence on long/multi-constraint/multi-subject prompts
  (vs. ~70-80% typical), and among the best of this catalog at legible
  in-image text for logos/labels/posters/UI mockups. Trade-off: less
  photorealistic than `lucid` at close range, and can be "logically rigid" —
  it may silently "correct" deliberately unusual/fantastical prompt
  instructions instead of rendering them literally. Best for: complex
  multi-element compositions, prompt-precise illustration, text-heavy
  graphic work.
- **`lucid`** (Leonardo Lucid Origin, Leonardo's newest/most versatile
  foundation model): the photorealism specialist — strong skin/hair/material
  rendering, suited to portraits, product visualization, and architectural/
  environmental photography, plus similarly strong (~95%) prompt adherence
  and a wide stylistic range. Favors quality over speed. Best for:
  photorealistic final assets, or as a general default when unsure which
  Leonardo model fits — it's the more versatile of the two.

**Quick decision guide**: need legible text in the final image? → `dev` (or
`phoenix` if budget-conscious). Need photorealistic people/products/
architecture? → `lucid`. Need a complex composition followed precisely? →
`phoenix`. Otherwise, iterate with `klein4b`/`schnell` and only spend on a
paid model once the concept is locked.

Sources: Black Forest Labs FLUX.2 blog posts (bfl.ai/blog), Cloudflare
Workers AI model docs and pricing page, SiliconFlow/MimicPC/ImageGPT/
LocalAIMaster model comparison writeups, WaveSpeedAI and Leonardo.Ai's own
Phoenix/Lucid Origin announcement posts, and third-party reviews
(NeonLights, toolkitbyai.com). Cross-check before relying on a specific
numeric claim (e.g. the 95% prompt-adherence figures) — some of this is
vendor marketing copy, not independently reproduced benchmarks.

## Not covered by the toolkit

- `google/nano-banana-2-lite` — this is Google's Gemini 3.1 Flash Lite Image
  model, reachable through Cloudflare's **AI Gateway** at a different
  endpoint shape (`POST /ai/run` with `{"model": "google/...", "input": {...}}`
  in the body, vs. the per-model path used above). It is **not** part of the
  Workers AI neuron/free-tier system — it's billed in USD via AI Gateway
  balance or BYOK (bring-your-own Google API key). Tried live on this
  account: HTTP 402 `"Insufficient balance; add money to your gateway or use
  BYOK"`. Google's list price is roughly $0.034/image. Out of scope for this
  toolkit unless the user sets up gateway billing separately.
- `stable-diffusion-xl-base-1.0`, `stable-diffusion-xl-lightning`,
  `dreamshaper-8-lcm` — present in the account's model catalog but not
  priced or request-tested this session. Don't assume their request/response
  shape matches any of the models above without testing first.
- **Image editing / img2img / multi-reference.** Cloudflare's changelog
  documents `input_image_0` through `input_image_3` multipart fields for
  `klein4b`/`klein9b`/`dev` (reference-image conditioning), but this hasn't
  been exercised against the live API by us — don't implement or claim
  support for it without testing the actual request/response shape first.
- **Multi-turn "chat" sessions** and a large "inspire" prompt-idea database
  — both present in banana-claude (the plugin this toolkit is modeled on,
  see NOTICE.md) but deliberately not ported. Cloudflare Workers AI has no
  session/conversation concept for image models to build a "chat" mode on,
  and banana-claude's own "2,500+ curated prompts" claim turned out (on
  inspection of its source) to not actually be bundled in that repo either —
  not worth replicating an unverified claim.
