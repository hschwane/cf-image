# Attribution

This project, **cf-image**, is heavily inspired by
[**banana-claude**](https://github.com/AgriciDaniel/banana-claude) by
[AgriciDaniel](https://github.com/AgriciDaniel) (Agrici Daniel), a Claude
Code plugin that wraps Google Gemini's image generation API in a "Creative
Director" pipeline. banana-claude is MIT licensed, copyright (c) 2026
AgriciDaniel.

cf-image is an independent project targeting a different backend (Cloudflare
Workers AI's Flux/Leonardo models instead of Google Gemini) and a different
runtime approach (zero-dependency Node.js instead of Python), but the
following ideas were directly adapted from banana-claude's design:

- **The overall "creative director" pipeline shape** — analyze intent,
  select a domain/lens, construct a structured prompt, call the model, report
  back file path/prompt/cost. banana-claude's `skills/banana/SKILL.md`
  documents this as a "5-component formula" (Subject/Action/Location/
  Composition/Style) against Google's official Gemini prompting guidance;
  cf-image adapts a similar shape for Flux/Leonardo prompting.
- **The named brand/style preset system** — `presets.py`/`presets.json`
  schema (colors, style, typography, lighting, mood, a default model) and
  the merge behavior (user's prompt text first, preset fields appended,
  user intent always wins on conflict) is closely adapted from
  banana-claude's `presets.py` and `references/presets.md`.
- **The plugin/marketplace packaging convention** — the
  `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` structure,
  and the `skills/<name>/{SKILL.md,references/,scripts/}` layout, follow the
  same convention banana-claude uses.
- **The zero-dependency-scripts philosophy** — banana-claude's Python scripts
  are deliberately stdlib-only (no `pip install` step required). cf-image
  applies the same principle to its Node.js scripts (only built-ins: `fetch`,
  `FormData`, `fs`, `path`, `os` — no `npm install` step).
- **A local `validate`-style setup-check script** — inspired by
  banana-claude's `validate_setup.py`, adapted here to check Cloudflare
  credentials/permissions instead of an MCP server configuration.
- **A cost `estimate` mode** — banana-claude's README documents
  `/banana cost [summary|today|estimate]`; cf-image's `cost.js estimate
  --model <key> --count <n>` adapts the "estimate before you spend" idea
  (computed locally from measured pricing, no API call) as a `today`/
  `estimate` subcommand split. The `summary` (multi-day history) mode was
  not adapted — cf-image relies on Cloudflare's own GraphQL Analytics for
  ground truth rather than a local usage ledger.
- **`--aspect-ratio` shorthand** — banana-claude's README advertises "14
  aspect ratio options"; cf-image adapts the convenience (a ratio string
  instead of raw pixel dimensions) generically via `core.parseAspectRatio`
  rather than a fixed list, computed client-side and untested beyond the
  1024x1024 default — see `skills/cf-image/SKILL.md`.
- **README Quickstart style** — the fenced-code-block "install then try
  these commands" format in this README's Quickstart section follows
  banana-claude's README structure.

What's original to cf-image, not adapted from banana-claude:

- All Cloudflare Workers AI integration, including hand-discovered per-model
  request/response quirks (multipart requirements, a raw-binary response
  format on `phoenix-1.0`, a safety-filter false positive on `klein4b`) and
  real measured neuron pricing (Cloudflare's published rates didn't always
  match live behavior).
- The cheapest-model-by-default budget-gate policy and the free-tier
  hard-block-vs-billed-overage distinction (Workers Free vs Workers Paid).
- The Node.js implementation itself.
- banana-claude's `edit`/`chat`/`inspire` modes and self-promotional
  "community footer" were deliberately **not** ported — see
  `skills/cf-image/SKILL.md`'s "Not implemented" section for why.

If you maintain banana-claude and would like anything here credited
differently, or want a change to how this notice describes the relationship,
please open an issue.
