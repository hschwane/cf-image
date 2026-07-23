> Load this on-demand: when a new session's `validate.js` check fails, when
> the user asks to set up cf-image, or when they ask about the Cloudflare
> account/API token.

## 1. Cloudflare account + API token

1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up if you
   don't have one (the free tier is enough to get started).
2. Find your **Account ID**: in the dashboard, select any domain/zone, or go
   to **Workers & Pages** — it's shown in the right sidebar (also in the URL:
   `dash.cloudflare.com/<account-id>/...`).
3. Create an API token at https://dash.cloudflare.com/profile/api-tokens →
   **Create Token** → **Create Custom Token**, with:
   - Permission: **Workers AI → Run** (required — generates images)
   - Permission: **Account → Account Analytics → Read** (optional but
     recommended — needed for `cost.js`/budget checks)
   - Account resource: scope it to your account.

## 2. Set `CF_ACCOUNT_ID` and `CF_API_TOKEN`

Two ways to do this — pick whichever fits:

**Option A — Claude Code's own settings** (recommended if cf-image is only
used inside Claude Code): add an `env` block to `.claude/settings.json` (or
`.claude/settings.local.json` to keep it out of git) in the project:

```json
{
  "env": {
    "CF_ACCOUNT_ID": "<your-account-id>",
    "CF_API_TOKEN": "<your-token>"
  }
}
```

Claude Code writes these into the process environment its tool calls run
in, live — no restart needed, and it overrides an OS-level variable of the
same name if both are set. This only applies within Claude Code (CLI and
desktop app); it does not apply to claude.ai's web app, which has no local
settings.json.

**Option B — OS-level environment variables** (works everywhere, including
outside Claude Code):

Windows (PowerShell):
```powershell
[System.Environment]::SetEnvironmentVariable("CF_ACCOUNT_ID", "<your-account-id>", "User")
[System.Environment]::SetEnvironmentVariable("CF_API_TOKEN", "<your-token>", "User")
```
Restart your terminal / Claude Code session afterward.

macOS/Linux (bash/zsh) — add to `~/.bashrc`, `~/.zshrc`, or `~/.profile`:
```bash
export CF_ACCOUNT_ID="<your-account-id>"
export CF_API_TOKEN="<your-token>"
```
Then `source` that file or open a new terminal.

Cloud/CI environments: set them as secrets/environment variables in
whatever mechanism that environment provides.

## 3. Verify

```bash
node scripts/validate.js
```

Checks both env vars are set, that the token can reach the Cloudflare API
(`Workers AI: Run`), that `Account Analytics: Read` works if granted, and
that the output directory is writable. Reports which check failed if
something's wrong.

**At the start of every new session**, run `validate.js` before generating
anything. If it fails, walk the user through this file rather than guessing
at the problem.
