# cf-image

A cost-aware "creative director" pipeline for generating images with
Cloudflare Workers AI (Flux/Leonardo models), packaged as a Claude Code
plugin. Heavily inspired by
[banana-claude](https://github.com/AgriciDaniel/banana-claude) — see
[NOTICE.md](NOTICE.md) for the full attribution — but targets Cloudflare's
Workers AI instead of Gemini, runs on zero-dependency Node.js (Claude Code
itself runs on Node, so it's guaranteed present anywhere this plugin runs),
and is built around a **cheapest-model-first** policy: always use the
cheapest model that will do the job, proactively recommend (never silently
switch to) a pricier one when the task genuinely needs it.

## Install

As a Claude Code plugin, from within Claude Code:

```
/plugin marketplace add hschwane/cf-image
/plugin install cf-image@cf-image-marketplace
```

Or clone it directly and point Claude Code at the `skills/cf-image` skill.

## Setup

Requires `CF_ACCOUNT_ID` and `CF_API_TOKEN` in the environment. The token
needs `Workers AI: Run` permission, and `Account Analytics: Read` if you
want `cost.js` to work. Get a token at
https://dash.cloudflare.com/profile/api-tokens.

Run the validator first in any new environment:

```bash
node skills/cf-image/scripts/validate.js
```

## Using it

Either invoke the `cf-image` skill from Claude Code (it reads `SKILL.md` and
the `references/` docs, and knows how to craft prompts, pick models, and
enforce the budget policy), or call the scripts directly:

```bash
# See all models, tiers, measured pricing, and researched strengths/weaknesses
node skills/cf-image/scripts/models.js

# Generate one image on the cheapest model (klein4b, currently 0 neurons)
node skills/cf-image/scripts/generate.js --prompt "a coral-colored octopus mascot logo"

# Generate a few variations to pick from (defaults to the cheapest model)
node skills/cf-image/scripts/batch.js --prompt "a coral-colored octopus mascot logo" --count 4

# Use a paid/expensive model - requires explicit opt-in
node skills/cf-image/scripts/generate.js --prompt "..." --model lucid --allow-expensive

# Save and reuse a brand/style preset
node skills/cf-image/scripts/presets.js create tech-saas --style "flat vector, soft shadows" --colors "#2563EB,#F8FAFC"
node skills/cf-image/scripts/generate.js --prompt "a rocket icon" --preset tech-saas

# Check today's actual neuron usage and remaining free budget
node skills/cf-image/scripts/cost.js
```

Generated images land in `~/.cf-image/output/` (override with
`CF_IMAGE_HOME`), named `<timestamp>-<model>-<prompt-slug>.jpg` — not inside
the plugin's own installed directory, so this works the same whether cloned
locally or installed via the marketplace. Presets live in
`~/.cf-image/presets/`.

## Model tiers

| Tier | Models | Behavior |
|---|---|---|
| Free | `klein4b` (default), `schnell` | Run with no confirmation |
| Paid | `klein9b`, `phoenix`, `lucid` | Blocked unless `--allow-expensive` is passed |
| Expensive | `dev` | Same gate; ~75% of the entire daily free budget per image |

Full pricing detail, measured quirks (multipart requirements, a raw-binary
response format, a safety-filter false positive on `klein4b`, etc.),
researched strengths/weaknesses per model, and prompting guidance live in
`skills/cf-image/references/`.

## Known limitations

- **The account this was built against is on the Workers Free plan.**
  Exceeding 10,000 neurons/day across ALL models hard-blocks further
  requests (HTTP 429) until 00:00 UTC reset — it does not bill overage.
  `cost.js` reports both what happens on Free vs. what it would cost on Paid.
- The daily quota was exhausted from earlier manual testing while this
  toolkit was built, so a full successful generate-and-save round trip
  through these exact scripts hasn't been re-verified after a quota reset —
  though every code path up to that point (both JSON and multipart request
  construction, budget-gate blocking, error parsing, the specific
  "daily allocation exhausted" error) has been live-tested against the real
  API and works correctly. Worth running one real test generation after
  reset to confirm the save-to-disk path too.
- No image editing / img2img / reference-image support yet (see
  `skills/cf-image/SKILL.md` for why — mainly: untested against the live
  API, so not worth shipping half baked).
- `google/nano-banana-2-lite` (Google, via AI Gateway) is documented but not
  wired up — it's a separate billing system (gateway balance/BYOK) outside
  Workers AI neurons, and this account doesn't have gateway balance set up.

## License

MIT, see [LICENSE](LICENSE). See [NOTICE.md](NOTICE.md) for attribution to
banana-claude, which this project is heavily inspired by.
