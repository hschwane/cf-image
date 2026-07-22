# cf-image

A cost-aware "creative director" plugin for generating images with
Cloudflare Workers AI (Flux/Leonardo models), for Claude Code.

> **Heavily inspired by [banana-claude](https://github.com/AgriciDaniel/banana-claude)**
> by [AgriciDaniel](https://github.com/AgriciDaniel) — same "creative
> director" pipeline shape and preset-system design, adapted here to target
> Cloudflare Workers AI instead of Google Gemini, on zero-dependency Node.js.
> **Full attribution: [NOTICE.md](NOTICE.md).**

Built around one hard rule: **always use the cheapest model that will do the
job, and proactively recommend — never silently switch to — a pricier one
when a task genuinely needs it** (e.g. legible in-image text, photorealism).

## Install

As a Claude Code plugin, from within Claude Code:

```
/plugin marketplace add hschwane/cf-image
/plugin install cf-image@cf-image-marketplace
```

Or clone the repo directly and point Claude Code at `skills/cf-image`.

## Setup: Cloudflare account & API token

You need a Cloudflare account with Workers AI access (the free tier is
enough to get started).

1. **Create a Cloudflare account** at https://dash.cloudflare.com/sign-up if
   you don't have one.
2. **Find your Account ID**: in the dashboard, select any domain/zone, or go
   to **Workers & Pages** — the Account ID is shown in the right sidebar (or
   in the URL: `dash.cloudflare.com/<account-id>/...`).
3. **Create an API token** at https://dash.cloudflare.com/profile/api-tokens
   → **Create Token** → **Create Custom Token**, with:
   - Permission: **Workers AI → Run** (required, generates images)
   - Permission: **Account → Account Analytics → Read** (optional but
     recommended, needed for `cost.js`/budget checks)
   - Account resource: scope it to your account.
4. **Set the environment variables** so the plugin's scripts can find them:

   **Windows (PowerShell)**:
   ```powershell
   [System.Environment]::SetEnvironmentVariable("CF_ACCOUNT_ID", "<your-account-id>", "User")
   [System.Environment]::SetEnvironmentVariable("CF_API_TOKEN", "<your-token>", "User")
   ```
   (restart your terminal / Claude Code session afterward so the new
   variables are picked up)

   **macOS / Linux (bash/zsh)** — add to `~/.bashrc`, `~/.zshrc`, or
   `~/.profile`:
   ```bash
   export CF_ACCOUNT_ID="<your-account-id>"
   export CF_API_TOKEN="<your-token>"
   ```
   then `source` that file or open a new terminal.

   **Cloud/CI environments**: set them as secrets/environment variables in
   whatever mechanism that environment provides (they just need to be
   present in the process environment Claude Code runs in).

5. **Verify it worked**:
   ```bash
   node skills/cf-image/scripts/validate.js
   ```
   This checks both env vars are set and that the token can actually reach
   the Cloudflare API, and reports which permissions are missing if any
   check fails.

## Using the skill

This plugin is meant to be used through its **Claude Code skill**, not by
running the Node scripts yourself — just ask Claude for an image and it
handles prompt crafting, model selection, and cost tracking for you:

> "generate a logo for my app called Octofood, a food/recipe/grocery
> planner, featuring a cute octopus"
>
> "give me a few variations of a rocket ship icon"
>
> "make this a photorealistic product shot" *(the skill will suggest a
> pricier, better-suited model here rather than defaulting silently)*

What the skill does on every request:

1. **Understands the intent** — logo vs. draft vs. final production asset —
   and asks only if genuinely ambiguous.
2. **Crafts a proper prompt** from a terse request, using a domain lens
   (Logo/Icon, Product/UI, Illustration, Photoreal/Cinematic, Landscape) to
   steer vocabulary and composition.
3. **Picks the cheapest model that will work** — currently `klein4b`,
   falling back to `schnell` if needed — and only recommends a pricier model
   when the task has a real need the cheap models are known to be weak at
   (legible text, close-range photorealism, complex composition). It always
   asks before spending on anything beyond the cheap tier.
4. **Generates** a single image or a batch of variations to choose from.
5. **Reports back** the file path, the actual prompt used, the model, and
   the real cost in neurons.

It also knows how to:
- **Reuse saved brand/style presets** (colors, typography, mood) so you
  don't have to redescribe your brand every time — just ask it to save one
  ("remember these brand colors as 'acme'") and reference it later.
- **Check today's free-tier budget** before spending on a pricier model, and
  warn if you're getting close to the daily cap.

Full behavioral details (the exact workflow, budget policy, and known
model quirks) live in [`skills/cf-image/SKILL.md`](skills/cf-image/SKILL.md)
and [`skills/cf-image/references/`](skills/cf-image/references/) — worth a
read if you want to understand *why* it makes the choices it does, or if
you're extending the plugin.

## Model tiers

`tier` is **relative cost within Workers AI**, not a free-plan-vs-paid-plan
distinction — every model draws from the same shared account-wide free daily
allocation (10,000 neurons/day, resets 00:00 UTC).

| Tier | Models | Behavior |
|---|---|---|
| Cheap | `klein4b` (default), `schnell` | Used automatically, no confirmation |
| Costly | `klein9b`, `phoenix`, `lucid`, `dev` | Requires explicit opt-in (the skill asks first; `dev` alone is ~75% of the daily allocation per image) |

Full pricing detail, measured quirks (multipart requirements, a raw-binary
response format, a safety-filter false positive on `klein4b`, and why its
0-cost is flagged as a likely pricing bug rather than a real free model),
researched strengths/weaknesses per model, and prompting guidance live in
[`skills/cf-image/references/`](skills/cf-image/references/).

## Scripts (for reference — the skill drives these for you)

| Script | Purpose |
|---|---|
| `validate.js` | Check env vars + API access work in this environment |
| `generate.js` | Generate one image |
| `batch.js` | Generate N variations of one prompt |
| `models.js` | List models, tiers, pricing, strengths/weaknesses |
| `cost.js` | Today's neuron usage, remaining free budget, 60%-used warning |
| `presets.js` | Manage saved brand/style presets |

All zero-dependency Node.js (built-ins only — `fetch`, `FormData`, `fs`,
`path`, `os`; no `npm install` step). Full usage/flags for each are
documented in [`SKILL.md`](skills/cf-image/SKILL.md).

## Known limitations

- The daily free-tier cap was hit during development, so a full
  generate-and-save round trip hasn't been re-verified end-to-end after a
  quota reset yet — everything up to that point (both request formats,
  budget-gate blocking, error handling, the specific "daily allocation
  exhausted" error) has been live-tested against the real API and works.
  Re-testing is planned once quota allows.
- **Reference-image conditioning** (`--reference-image`, for
  `klein4b`/`klein9b`/`dev`) is implemented but has never been exercised
  against the live API — treat it as experimental until confirmed. See
  `skills/cf-image/references/models.md`.
- `google/nano-banana-2-lite` (Google, via AI Gateway) is documented but not
  wired up — it's a separate billing system (gateway balance/BYOK) outside
  Workers AI neurons.
- No multi-turn "chat" sessions or a bundled prompt-idea database — see
  `SKILL.md`'s "Not implemented" section for why.

## License

MIT, see [LICENSE](LICENSE). See [NOTICE.md](NOTICE.md) for full attribution
to banana-claude, which this project is heavily inspired by.
