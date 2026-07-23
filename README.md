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

## Quickstart

Once installed (see "Install" below) and your Cloudflare token is set up
(see "Setup"), just ask — the skill handles prompt crafting, model choice,
and cost tracking for you:

```
"generate a logo for my app, a weather widget, featuring a friendly cloud mascot"
"give me 4 variations of a rocket ship icon"
"save these brand colors as 'acme': #FF6B00 and #111111"
"now make a hero banner using the acme preset, 16:9"
"how much of today's free budget have I used?"
```

No raw script commands to memorize — this is what talking to the skill
actually looks like. The scripts underneath are documented in "Scripts"
below for anyone extending the plugin, but you shouldn't need them directly.

## Commands

The skill triggers automatically on any image request — no exact syntax
required — but here's every capability with a natural way to ask for it.
An explicit `/cf-image <request>` also works if you'd rather be direct
about it.

| Want to... | Say something like... |
|---|---|
| Generate one image | "generate a logo for my app, featuring..." |
| Get several options to pick from | "give me 4 variations of a rocket ship icon" |
| Control framing | "...in 16:9" / "a square icon" / "portrait/mobile format" |
| Use a specific or higher-quality model | "use flux-2-dev for this" / "I want the best quality" — otherwise the skill recommends one and asks first, it never switches silently |
| Check cost before generating | "how much would 3 images with the best model cost?" |
| Check today's remaining budget | "how much of today's free budget have I used?" |
| Save a brand/style preset | "save these brand colors and style as 'acme'" |
| Reuse a saved preset | "generate a banner using the acme preset" |
| List / inspect / delete presets | "what presets do I have saved?" / "delete the acme preset" |
| Attach a reference image *(experimental)* | "using this image at `<path>` as reference, generate..." — untested against the live API, the skill will flag this when used |

Each of these is backed by one of the scripts in `skills/cf-image/scripts/`
(see "Scripts" below) — and for anyone coming from banana-claude, `SKILL.md`
has an exact `/banana` → cf-image command-mapping table.

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
running the Node scripts yourself — see "Commands" above for everything it
can do. What it does on every request:

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
| `generate.js` | Generate one image (supports `--aspect-ratio`, `--preset`, experimental `--reference-image`) |
| `batch.js` | Generate N variations of one prompt |
| `models.js` | List models, tiers, pricing, strengths/weaknesses |
| `cost.js` | `today` (default): usage + remaining budget, warns at 60% used. `estimate --model <key> --count <n>`: cost of a planned generation, no API call |
| `presets.js` | Manage saved brand/style presets (`list`/`show`/`create`/`delete`) |

All zero-dependency Node.js (built-ins only — `fetch`, `FormData`, `fs`,
`path`, `os`; no `npm install` step). Full usage/flags for each are
documented in [`SKILL.md`](skills/cf-image/SKILL.md).

## Known limitations

- **Reference-image conditioning** (`--reference-image`) is confirmed
  working on `klein4b` (genuine image editing/compositing, not just
  inspiration — see `skills/cf-image/references/models.md`), but note it's
  **not free**: unlike plain `klein4b` generation it bills per input tile.
  `klein9b`/`dev` support is still unconfirmed (assumed by family
  similarity only).
- `google/nano-banana-2-lite` (Google, via AI Gateway) is documented but not
  wired up — it's a separate billing system (gateway balance/BYOK) outside
  Workers AI neurons.
- No multi-turn "chat" sessions or a bundled prompt-idea database — see
  `SKILL.md`'s "Not implemented" section for why.
- Aspect ratios other than the 1024x1024 square default are implemented
  (`--aspect-ratio`) but not yet exercised against the live API — treat
  non-square output as unverified until confirmed.

## License

MIT, see [LICENSE](LICENSE). See [NOTICE.md](NOTICE.md) for full attribution
to banana-claude, which this project is heavily inspired by.
