# Model reference

The single reference for pricing, capabilities, and per-model characteristics.
`scripts/core.js`'s `MODEL_CATALOG` holds only the technical fields (id,
tier, request/response format, price, reference-image support) needed by
code — everything else lives here.

## Free tier mechanics

- 10,000 neurons/day, shared across **all** models on the account, resets
  00:00 UTC. One account-wide pool, not per-model.
- This account is on the **Workers Free** plan: hitting the cap returns
  HTTP 429, error code 4006, and hard-blocks further requests until reset.
  It does **not** bill overage — that only applies on Workers Paid.
- Check usage with `node scripts/cost.js` (needs an API token with
  `Account Analytics: Read`; analytics lag real-time usage by a few
  minutes). Warns automatically once usage crosses 60% of the daily
  allocation.
- `tier` below is *relative cost within Workers AI*, not free-vs-paid-plan —
  every model draws from the same free daily pool. A "costly" model is
  still free-tier-eligible, it just spends the shared budget faster.

## Model catalog

| Key | Model ID | Tier | Neurons / 1024×1024 image | Request | Response | Reference images |
|---|---|---|---|---|---|---|
| `schnell` | `@cf/black-forest-labs/flux-1-schnell` | cheap | 172.8 | JSON | JSON base64 | no |
| `klein4b` | `@cf/black-forest-labs/flux-2-klein-4b` | cheap | 0 up to 1024×1024 (see "Resolution and cost" below) | multipart | JSON base64 | yes |
| `klein9b` | `@cf/black-forest-labs/flux-2-klein-9b` | costly | 1,363.64 | multipart | JSON base64 | yes |
| `phoenix` | `@cf/leonardo/phoenix-1.0` | costly | 3,120 | JSON | raw binary (`image/jpeg`, no wrapper, no `cf-ai-neurons` header — cost only visible via `cost.js`) | no |
| `lucid` | `@cf/leonardo/lucid-origin` | costly | 3,904.69 | JSON | JSON base64 | no |
| `dev` | `@cf/black-forest-labs/flux-2-dev` | costly | 7,500 (billed per step — this is the default step count) | multipart | JSON base64 | yes |

USD equivalents (Workers Paid overage rate, $0.011/1,000 neurons): schnell
≈ $0.0019, klein9b ≈ $0.0150, phoenix ≈ $0.0343, lucid ≈ $0.0430, dev ≈
$0.0825 per image. `dev` alone is ~75% of the entire daily free allocation.

Pricing is measured against a live account, not copied from Cloudflare's
published per-tile rates, which didn't always match reality (`schnell` and
`lucid` both had to be corrected after direct measurement). `klein4b`'s
0-neuron plain-generation cost may change without notice — re-check
`node scripts/cost.js` periodically; if it ever bills nonzero, switch
`CHEAPEST_MODEL_KEY` in `core.js` to `schnell`.

## Resolution and cost (`klein4b`, measured)

`klein4b` bills **0 neurons for output at or below 1024×1024** (~1.05MP).
Beyond that, cost scales **linearly with excess pixels**, not as a
tile-bucket jump:

| Resolution | Excess pixels over 1024×1024 | Neurons |
|---|---|---|
| 1024×1024 | 0 | 0 |
| 1024×1088 | 65,536 | 6.51 |
| 1024×1152 | 131,072 | 13.03 |
| 1920×1080 | 1,025,024 | 101.86 |

Rate: ~0.0000993 neurons per excess pixel. A reference image adds a flat
~5.37 neurons per input image, independent of and additive with the output
cost above (measured: 5.37 @ 1024×1024, ~107.2 @ 1920×1080 = 5.37 + 101.86).
This scaling has only been measured on `klein4b`; treat other models'
above-default-resolution cost as unmeasured until checked with `cost.js`.

## Per-model notes

- **`schnell`**: plain JSON, no quirks. Good fallback when `klein4b`'s
  safety filter blocks a prompt. Best for rapid drafts, thumbnails,
  high-volume low-stakes images. Weaker at legible text, fine detail,
  close-range photorealism.
- **`klein4b`**: multipart only — a JSON body returns HTTP 400. Safety
  filter can false-positive on ambiguous action verbs (error 3030, e.g.
  "training kung fu" was flagged, "practicing kung fu martial arts moves"
  was not) — reword rather than retry identically. Best for fast iteration,
  interactive drafts. Weaker at legible text and fine texture than `klein9b`.
- **`klein9b`**: same multipart requirement as `klein4b`, flat per-megapixel
  rate. Sharper/more coherent than `klein4b`. Best near-production value —
  the model to reach for when the cheap tier isn't good enough but `dev`
  isn't justified. Weaker at legible text than `dev`.
- **`phoenix`**: the only model in this catalog with a real `negative_prompt`
  request parameter (also takes `guidance`, `seed`, `num_steps`). Strong
  prompt adherence on complex multi-element compositions and legible
  text/typography (logos, labels, posters, UI mockups). Can "correct"
  deliberately unusual/fantastical prompts instead of rendering them
  literally. Weaker at close-range photorealism than `lucid`.
- **`lucid`**: no `negative_prompt` parameter. Leonardo's photorealism
  specialist — strongest skin/hair/material rendering, good default when
  unsure which Leonardo model fits. Favors quality over speed.
- **`dev`**: full non-distilled Flux.2. Best legible in-image text/typography
  in the catalog (confirmed: rendered "Kung Fu Master" cleanly on a belt,
  including a mirrored reflection, when every cheaper model garbled it) and
  strongest photorealism/prompt fidelity. Billed per step — cost scales if
  step count is ever changed. Reserve for final production assets, not
  iteration.

## Reference-image conditioning

`input_image_0`..`input_image_3` (multipart fields, up to 4 images) let a
generation call condition on existing images — this is how both "edit this
image" and "give me variations of this image" requests work; there's no
separate edit endpoint. Supported by `klein4b`, `klein9b`, `dev` (the
multipart-format models); `phoenix`/`lucid`/`schnell` reject it client-side.

Not free even on `klein4b` — see "Resolution and cost" above. The model
preserves the reference's subject/style closely by default; getting a
meaningfully different result (new pose, new interaction, different
composition) takes explicit, spatially specific prompt language, not a
short instruction — see `references/prompting.md`.

## Sources

Pricing, quirks, and reference-image behavior above are measured directly
against a live Cloudflare account. Strengths/weaknesses are drawn from
Black Forest Labs' and Leonardo.Ai's own model announcements and
Cloudflare's model docs — treat specific benchmark numbers as vendor
claims, not independently reproduced results.

## Not covered by this toolkit

- `google/nano-banana-2-lite` — routed through Cloudflare's AI Gateway, not
  the Workers AI neuron system (separate USD billing, gateway balance or
  BYOK). Out of scope.
- `stable-diffusion-xl-base-1.0`, `stable-diffusion-xl-lightning`,
  `dreamshaper-8-lcm` — present in the account but not priced or tested.
