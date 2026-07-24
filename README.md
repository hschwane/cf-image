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
| Edit an existing image | "using this image at `<path>`, change the background to a beach" |
| Use one of your own images as reference | local session: reference it with `@` (path autocomplete). Cloud session: attach it zipped or with a renamed extension. Pasting an image does *not* work — see Known limitations |
| Use an online image as reference | "use `https://…/photo.jpg` as reference and put it on a beach" — URLs are downloaded automatically |
| Keep refining a result across turns | "make the cat look less cartoony" — right after a previous generation, no special syntax needed |
| Get several options to pick from | "give me 4 variations of a rocket ship icon" |
| Control framing | "...in 16:9" / "a square icon" / "portrait/mobile format" |
| Use a specific or higher-quality model | "use flux-2-dev for this" / "I want the best quality" — otherwise the skill recommends one and asks first, it never switches silently |
| Check cost before generating | "how much would 3 images with the best model cost?" |
| Check today's remaining budget | "how much of today's free budget have I used?" |
| Save a brand/style preset | "save these brand colors and style as 'acme'" |
| Reuse a saved preset | "generate a banner using the acme preset" |
| List / inspect / delete presets | "what presets do I have saved?" / "delete the acme preset" |
| Resize/crop/convert/make transparent | "crop this to a square" / "make the background transparent" |
| Set up cf-image | "set up cf-image" — or just ask for an image; a failed first-run check walks you through it |

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
4. **Set the environment variables** so the plugin's scripts can find them.
   Two options — pick whichever fits:

   **Claude Code's own settings** (recommended if cf-image is only used
   inside Claude Code): add an `env` block to `.claude/settings.json` (or
   `.claude/settings.local.json` to keep it out of git):
   ```json
   { "env": { "CF_ACCOUNT_ID": "<your-account-id>", "CF_API_TOKEN": "<your-token>" } }
   ```
   Applies live, no restart needed — but only within Claude Code (CLI and
   desktop app), not claude.ai's web app.

   **OS-level environment variables** (works everywhere):

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
4. **Generates** a single image, a batch of genuinely varied options, or an
   edit/refinement of an existing image (its own or one you provide) using
   reference-image conditioning.
5. **Reports back** the actual image, the file path, the prompt used, the
   model, and the real cost in neurons — with a running total for the
   session, and a budget warning if you're getting close to the daily cap.

**Where images land:** generated images are saved to `.cf-image/output/`
inside your current working directory — that keeps their paths relative to
the project, which is what makes them viewable and clickable in the chat.
The folder gets a self-ignoring `.gitignore` on creation, so generated
images never show up in your git status. Override with `--out-dir` or the
`CF_IMAGE_OUTPUT_DIR` environment variable. Saved presets are separate and
stay global, under `~/.cf-image/presets/`.

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

Full pricing detail (including how `klein4b`'s cost scales once output
exceeds 1024x1024), measured quirks (multipart requirements, a raw-binary
response format, a safety-filter false positive on `klein4b`), researched
strengths/weaknesses per model, and prompting guidance live in
[`skills/cf-image/references/`](skills/cf-image/references/).

## Scripts (for reference — the skill drives these for you)

| Script | Purpose |
|---|---|
| `validate.js` | Check env vars + API access work in this environment |
| `generate.js` | Generate one image (supports `--aspect-ratio`, `--preset`, `--reference-image` up to 4x) |
| `cost.js` | `today` (default): usage + remaining budget, warns at 60% used. `estimate --model <key> --count <n>`: cost of a planned generation, no API call |
| `presets.js` | Manage saved brand/style presets (`list`/`show`/`create`/`delete`) |
| `import-reference.js` | Turn an attached `.zip` or renamed image back into a real image file usable as a reference |

There's no batch script — the skill generates variations by calling
`generate.js` several times with genuinely different prompts (identical
prompts repeated N times produce near-identical results), and no separate
model-listing script — model pricing/strengths live in
[`skills/cf-image/references/models.md`](skills/cf-image/references/models.md)
for the skill to read directly. All zero-dependency Node.js (built-ins
only — `fetch`, `FormData`, `fs`, `path`, `os`; no `npm install` step). Full
usage/flags for each are documented in
[`SKILL.md`](skills/cf-image/SKILL.md).

## Known limitations

- Reference-image conditioning bills a per-input-tile cost even on
  `klein4b`, which is otherwise free at up to 1024x1024 output — see
  [`skills/cf-image/references/models.md`](skills/cf-image/references/models.md)
  for the full pricing breakdown, including how cost scales at higher
  output resolutions.
- `google/nano-banana-2-lite` (Google, via AI Gateway) is documented but not
  wired up — it's a separate billing system (gateway balance/BYOK) outside
  Workers AI neurons.
- **An image pasted or attached in the chat cannot be used as a reference
  image.** Claude Code passes attachments to the model as visual content
  only — they're never written to disk, so no script can read their bytes.
  Attachments are routed by **file extension**: image extensions arrive
  embedded (visible, but no file), every other extension arrives as a real
  file with a readable path. Ways around it:
  - **Zip the image, or rename its extension** (`photo.jpg` → `photo.bin`)
    before attaching, then let the skill run `import-reference.js` on it —
    that restores a bit-identical image file. Works in local *and* cloud
    sessions, and is the most reliable route.
  - **Local session** (terminal, desktop app): simply reference the file
    with `@` instead of pasting it — `@` passes the file's *path*.
  - **A direct image URL** works anywhere; it's downloaded automatically.

  Failing all of those, the skill can describe the attached image and
  generate without a reference, which reproduces the look but not the exact
  identity.
- No bundled prompt-idea database.
- Aspect ratios other than the 1024x1024 square default are computed
  client-side but not yet exercised against the live API — treat non-square
  output as unverified until confirmed.
- Post-processing (resize/crop/transparency) shells out to ImageMagick/
  FFmpeg, which must be installed separately — see
  [`skills/cf-image/references/post-processing.md`](skills/cf-image/references/post-processing.md).

## License

MIT, see [LICENSE](LICENSE). See [NOTICE.md](NOTICE.md) for full attribution
to banana-claude, which this project is heavily inspired by.
