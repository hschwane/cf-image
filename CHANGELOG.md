# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 0.9.2 — 2026-07-24

- **Renaming is now presented before zipping.** Giving the file a non-image
  extension (`photo.jpg` → `photo.bin`) needs no tool at all, so it's the
  lower-effort option for most people; zipping stays documented as the
  robust choice and the natural one for several images at once.
- **Clearer wording for which surface is which.** "Web / mobile browser"
  became "using Claude in the web or in the app", and the local case is
  described as a session running on the user's own machine, rather than by
  naming clients — the session's location is what actually decides it.

## 0.9.1 — 2026-07-24

Closes the discoverability gap in 0.9.0: the mechanics worked, but a user
had no way of learning them mid-task — nobody reads a plugin README while
working, and the rules lived only in `SKILL.md`, which only Claude reads.

- SKILL.md now prescribes **what to say to the user, when**: a two-line,
  jargon-free message with the one concrete fix that fits their surface,
  delivered the moment a pasted image can't be used — not an explanation of
  attachment routing. Also: be proactive when someone announces they want to
  use their own photo, and offer a described-only generation as a stopgap so
  they aren't blocked while re-attaching.
- Claude is told to **determine the surface itself** (`/root/.claude/uploads/`
  present → cloud session; a local-style home path → local) instead of
  asking the user which client they're on.
- README gained a prominent user-facing section, "Giving cf-image one of
  your own images", placed before Install rather than buried in Known
  limitations, with a per-surface table.

## 0.9.0 — 2026-07-24

Reference images now work in cloud sessions too.

The key fact, established by testing in a real cloud session: **attachments
are routed by file extension, not by content.** Image extensions arrive
embedded in the message with no path and no bytes; every other extension
arrives as a real file with a readable path (under
`/root/.claude/uploads/<session-id>/<uuid>-<name>` in the cloud). So an
image only has to *not look like* an image on the way in.

- **New `scripts/import-reference.js`**: turns whatever arrived back into a
  real image file in `.cf-image/input/`, then prints ready-made
  `--reference-image` arguments.
  - Extracts every image from an attached `.zip` (hand-rolled ZIP reader
    walking the central directory; STORED and DEFLATE via built-in `zlib` —
    still zero dependencies).
  - Detects an image whose extension was changed (`photo.jpg` → `photo.bin`)
    by its magic bytes and restores the correct suffix.
  - Rejects non-images with a clear message instead of writing junk.
  - Verified: ZIP-extracted image is **bit-identical** to the original
    (md5 match), renamed `.jpgc`/`.bin` files are recovered correctly,
    JPEG/PNG/GIF/WebP detection all confirmed, and the extracted image was
    used end to end as a reference for a real generation.
- SKILL.md's reference-image section rewritten around the extension rule,
  with the zip/rename route as the preferred, surface-independent option and
  `@`/URL/describe as the remaining ladder.
- Corrected an overstatement from 0.8.0: reference images from chat were
  described as impossible in cloud sessions. They aren't — they just need
  the file to arrive under a non-image extension.

## 0.8.0 — 2026-07-24

Replaces 0.7.0's clipboard approach, which was wrong on three counts: it
touched the user's clipboard (which can hold passwords and is none of this
tool's business), it only worked on the local desktop, and it didn't even
cover the file-picker case, since attaching a file doesn't populate the
clipboard.

- **Removed `scripts/clipboard.js`.** The user's clipboard is off limits;
  SKILL.md now says so explicitly so the idea doesn't get reinvented.
- **Established the actual constraint.** Checked the Claude Code docs: image
  attachments are handed to the model as visual content and are **never**
  written to the filesystem — on any surface (CLI, desktop, web, mobile).
  There is no path, no cached copy, no API for their bytes. So "paste an
  image and use it as a reference" is not achievable, and the skill now
  states that plainly instead of implying a workaround exists.
- **`--reference-image` now accepts an `http(s)` URL**, downloading it to
  `.cf-image/input/` before generating. This is the one reference route that
  behaves identically on desktop, web and mobile, because the download
  happens wherever the script runs. Verified end to end, including a
  non-image URL being rejected with a clear message, and a missing local
  file producing a readable error instead of a raw ENOENT. Sends an explicit
  User-Agent — several hosts (Wikimedia among them) answer HTTP 400 without
  one.
- Documented the fallback ladder in SKILL.md and the README: direct URL →
  local file path → describe the attached image and generate without a
  reference, stating honestly that the last one preserves the look but not
  the exact identity.
- Security note in both the code and the skill: only ever fetch a URL the
  user supplied directly in chat, never one discovered in a web page, file,
  or other tool output.

## 0.7.0 — 2026-07-24

Reference images can now come straight from the chat.

- **New `scripts/clipboard.js`**: saves the image currently on the system
  clipboard to `.cf-image/input/` and prints its path, ready to hand to
  `generate.js --reference-image`. An image pasted or attached in chat is
  visible to Claude but has no path on disk, which is why it previously had
  to be saved manually first — if the user pasted it, the same image is
  still on their clipboard, so this picks it up from there.
  Windows (PowerShell/System.Windows.Forms) is **tested end to end**,
  including the full clipboard → reference → generation chain. The macOS
  (`osascript`) and Linux (`wl-paste`/`xclip`) paths are implemented but
  untested. Zero dependencies, as everywhere else in this toolkit.
- SKILL.md gained a "Reference image pasted or attached in chat" workflow
  with an explicit fallback ladder: grab from clipboard → ask the user to
  copy it or give a path → last resort, describe the image (Claude can see
  it) and generate without a reference, saying plainly that this preserves
  the look but not the exact identity.
- Investigated and ruled out reading chat attachments from disk — the
  desktop app doesn't cache them anywhere findable (checked).

## 0.6.0 — 2026-07-24

Fixes the "I generated it but you never saw it" problem, reported from a
real session where images were only ever posted as paths.

**Images now save into the working directory**
- Output moved from `~/.cf-image/output/` to `.cf-image/output/` **inside
  the current working directory**. Chat clients only render and link paths
  that are relative to the working directory, so an image saved outside it
  can never be shown or clicked — this was the root cause. No manual env var
  needed. Override with the new `--out-dir` flag or `CF_IMAGE_OUTPUT_DIR`.
- Presets deliberately stay **global** (`~/.cf-image/presets/`) — one brand
  definition should be reusable across projects.
- The output dir is created with a **self-ignoring `.gitignore`**, so
  generated images never pollute the user's git history.
- `generate.js` now prints the working-directory-relative path on its own
  labeled line, so the link in chat can be built from it verbatim.
- Added a guard: `generate.js` warns if the resolved output directory is
  inside the skill's own folder — the failure mode you get by `cd`-ing into
  the skill directory before running it. SKILL.md now documents invoking the
  script by full path from the project directory instead.

**Display instructions are now based on live testing, not assumption**
Tested all candidate methods in a real session and wrote the results into
SKILL.md:
- Read tool on the saved file → renders inline at a sensible size. **Default.**
- Markdown link with a working-dir-relative path → clickable. **Always include.**
- Markdown image embed `![](path)` → renders, but **very large** with no way
  to size it. Documented as the fallback when tool results aren't visible.
- HTML `<img width=...>` → **not rendered at all**, appears as raw text.
  Previously a plausible-looking option; now explicitly ruled out.
- Gallery Artifact threshold raised from >4 to **>6 images** — the user
  asked for inline by default and the gallery only for genuinely large
  batches. Either way, one of the two must always happen.

**Also fixed**
- The post-processing pre-flight check was wrong on Windows: `which convert`
  always succeeds there because `C:\Windows\System32\convert.exe` is
  Microsoft's FAT→NTFS filesystem tool, not ImageMagick. Both SKILL.md and
  `references/post-processing.md` now check `magick` first and require
  verifying `convert -version` actually reports ImageMagick.

## 0.5.0 — 2026-07-23

Skill-usability pass driven by a live test session (gray cat vs. quail).

- **Mandatory inline image display.** In testing, Claude reported only a
  path and the user had to ask "show me the image" every time. SKILL.md now
  opens with a loud MANDATORY rule: after every generation, display the
  image inline via the Read tool, automatically, without being asked.
- **Removed the separate "chat" capability.** Multi-turn refinement is just
  the Interactive flow continuing across turns (last image becomes the next
  reference), so it no longer needs its own command/section. Dropped from the
  Quick Reference table, `argument-hint`, and the description; added a
  "Refining across turns" note instead.
- **Stopped presenting fake clickable file links.** Absolute paths under
  `~/.cf-image/output` don't render as clickable markdown links; the
  Answering rules now show the image inline and give the path as plain code.
- **Shorter output filenames** — the prompt slug in the default filename
  dropped from 40 to 20 characters.
- **Post-processing is now documented in SKILL.md** (a workflow section and
  a Quick Reference row), not only in `references/post-processing.md`.
- **Fleshed-out creative-director workflow** — the terse 7-step list became
  a proper numbered pipeline (analyze intent → preset → domain lens + prompt
  with explicit CRITICAL RULES → model/resolution/framing → generate →
  handle response → show & report), modeled on banana-claude's pipeline.
- **Expanded `references/prompting.md`** — a full worked terse-ask→prompt
  example, a rough attention-budget guide, a "key tactics" list, an
  anti-patterns list, five reusable prompt templates, a Midjourney/DALL-E →
  cf-image adaptation table, and a "keeping a subject consistent across
  images" section.

## 0.4.0 — 2026-07-23

Full restructuring of the skill/reference/script layer, informed by the
live testing session in 0.3.1/0.3.2 and a direct structural comparison
against banana-claude's own skill files.

**Removed**
- `scripts/batch.js` — running an identical prompt N times produced
  near-identical variations in testing. Variations are now Claude calling
  `generate.js` several times with genuinely different prompts.
- `scripts/models.js` — was a pure re-formatting of static catalog data;
  duplicated `references/models.md`. Model guidance is now read directly
  from that file, not run as a script.
- `MODEL_CATALOG`'s `notes`/`bestFor`/`weakerFor` fields in `core.js` — that
  prose now lives once, in `references/models.md`, instead of twice.
- SKILL.md's "Not implemented" / banana-claude-comparison framing, and all
  "confirmed/unconfirmed" hedging on reference-image support — it's
  documented as a plain model capability now.

**Added**
- Three new on-demand reference files: `references/setup.md` (moved out of
  SKILL.md/README, plus a documented option to set `CF_ACCOUNT_ID`/
  `CF_API_TOKEN` via Claude Code's own `settings.json` `env` block instead
  of OS-level env vars), `references/post-processing.md` (ImageMagick/
  FFmpeg shell-out recipes, including a green-screen-prompt + chroma-key
  pipeline for real transparent PNG output), and `references/presets.md`
  (moved out of scattered mentions in `prompting.md`/SKILL.md).
- `references/prompting.md`: expanded domain-lens vocabulary, a Good/Bad
  contrastive table for the 5-component formula, a prompt-length guide, a
  measured finding on negative prompts (only `phoenix` has a real
  `negative_prompt` API parameter — every other model needs positive
  rephrasing instead), and a new "editing via reference images" section
  distilled from this session's iteration (small/targeted edits work well;
  large changes need very explicit spatial language and often cost less as
  a fresh generation than as many reference-image rounds).
- `references/models.md`: corrected resolution-cost finding — `klein4b`
  bills 0 neurons up to 1024x1024 output, then scales *linearly with excess
  pixels* beyond that (not a tile-bucket jump); input-tile and
  output-resolution costs are independent and additive.
- SKILL.md: full rewrite — an explicit always-read-vs-on-demand file list,
  a Quick Reference table (Interactive/Generate/Edit/Chat/Batch/Setup/
  Preset/Cost, described without script names), explicit answering rules
  (always show the image, state path/prompt/settings/cost, keep a running
  session cost total, periodically recheck real usage, build an Artifact
  mini-portfolio instead of dumping more than ~4 images inline).
- A documented "chat" (multi-turn refinement) workflow: no new
  infrastructure needed — the conversation itself is the session, and the
  most recently generated image becomes the next reference image.

**Also, from a systematic comparison against banana-claude's actual skill
files** (see "Why" below): `core.js` now retries transient errors (429s
that aren't the daily-quota block, and 5xx) with short backoff instead of
failing immediately; presets gained a `defaultAspectRatio` field; and
`references/prompting.md` gained an aspect-ratio-by-use-case table, two
more domain lenses (Infographic, Abstract), in-image text quoting/length/
placement guidance, a common-edit-phrasing cheat sheet, multi-reference-
image guidance, an expanded safety-filter rephrase-strategy table, and a
couple of common-mistakes entries. SKILL.md's error-handling table gained a row for "generation succeeded but
the user doesn't like the result," plus a "fallback model also blocked"
clause folded into the existing safety-filter row, and its Answering rules
gained an optional refinement-suggestion step. Also fixed from this same
review pass: `core.js` had leftover "experimental/untested" hedging on
reference-image support that contradicted the plainly-documented capability
in `references/models.md`; `presets.js create` now validates
`--default-model`/`--default-aspect-ratio` at creation time instead of
failing silently until first use; `generate.js` no longer risks overwriting
a same-second, same-prompt-prefix output file (adds a `-2`/`-3` suffix on
collision).

**Why**: a systematic comparison against banana-claude's actual skill files
found our SKILL.md was long but unspecific, had real data duplication
between `core.js` and `references/models.md`, and was missing several
things banana-claude does well (a proper prompting guide, on-demand setup/
post-processing/preset references, explicit answering-format rules). This
release addresses those gaps directly rather than incrementally.

## 0.3.2 — 2026-07-23

Live creative-iteration session (octopus vs. kung-fu cat): full-HD render,
reference-image editing across several rounds, and a 5-image anime-style
batch — all cheap-tier, well within the daily budget.

- Added `--reference-image` support to `batch.js` (previously `generate.js`
  only) — confirmed working across a 5-image batch, one reference image
  applied to every variation.
- **Measured: reference-image edit cost scales sharply with output
  resolution.** ~5.37 neurons at the default 1024x1024, but ~107.2 neurons
  at 1920x1080 (~20x, well beyond the ~2x pixel-count increase alone) — see
  `references/models.md` for the full note.
- Fixed the same output-filename trailing-`.` bug in `batch.js`'s timestamp
  slice that 0.3.1 fixed in `generate.js`.

## 0.3.1 — 2026-07-23

First live end-to-end test run of the plugin (via the actual skill, loaded
through a local directory junction) after the daily quota reset. All cheap-
tier, total spend ~178 neurons.

- **Fixed `schnell`'s documented pricing**: measured 172.8 neurons on a
  clean single-call header reading (fresh day, first call), not the 19.2
  this doc/catalog previously listed — that figure was calculated from
  Cloudflare's published per-tile rate rather than directly measured, same
  category of error already caught for `lucid-origin`. Still cheap-tier,
  just not as negligible as previously documented.
- **Confirmed reference-image conditioning works on `klein4b`**: gave it an
  existing image plus an edit instruction, got back a faithful edit (same
  subject/style, new requested background) — genuine compositing, not just
  inspiration. Costs ~5.37 neurons per input image (matches Cloudflare's
  documented input-tile rate) - NOT covered by klein4b's usual 0-neuron
  plain-generation cost. `klein9b`/`dev` remain unconfirmed.
- Confirmed the full generate → save → report round trip works end-to-end
  through the actual scripts (previously only verified up to the request/
  error-handling layer, blocked by an exhausted quota).
- Fixed a cosmetic bug: output filenames had a stray trailing `.` from an
  off-by-one in the timestamp slice.

## 0.3.0 — 2026-07-23

- Added `cost.js estimate --model <key> --count <n>`: quotes a generation's
  cost before spending anything (no API call), adapted from banana-claude's
  `/banana cost estimate` mode. `cost.js` (bare/`today`) still works as
  before.
- Added `--aspect-ratio W:H` shorthand on `generate.js`/`batch.js` (e.g.
  `16:9`, `9:16`), computed client-side against the 1024x1024 default pixel
  budget; mutually exclusive with `--width`/`--height`. Untested beyond
  square resolutions - flagged as such in the docs.
- Added a post-generation budget warning: `generate.js`/`batch.js` now warn
  automatically once usage crosses 60% of the daily allocation, right after
  a successful generation, not just when separately running `cost.js`.
- README: added a Quickstart section (adapted from banana-claude's README
  structure) and a command-reference comparison table against banana-claude
  in `SKILL.md`; removed a private project name from an example prompt.
- Local dev-only symlink support documented for testing the skill without
  going through the marketplace install flow (`.claude/` is gitignored, not
  part of the shipped plugin).

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
