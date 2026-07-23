> Load this on-demand when the user mentions a brand/style by name, asks
> about presets, or asks to save one.

Presets save a recurring brand/style (colors, typography, mood) once so it
doesn't need re-describing on every request. Stored as one JSON file per
preset under `~/.cf-image/presets/` (override with `CF_IMAGE_HOME`).

## Schema

```json
{
  "name": "acme",
  "description": "Acme Corp brand style",
  "colors": ["#FF6B00", "#111111"],
  "style": "flat vector illustration, minimalist",
  "typography": "bold geometric sans-serif",
  "lighting": "bright, even, high-key",
  "mood": "energetic, friendly",
  "defaultModel": "klein9b",
  "defaultAspectRatio": "16:9"
}
```

All fields except `name` are optional — set only what's actually part of
the brand. `defaultModel`, if set, becomes the default when `--preset` is
used without an explicit `--model`. `defaultAspectRatio` likewise becomes
the default framing when `--preset` is used without an explicit
`--width`/`--height`/`--aspect-ratio`.

## Example presets

**tech-saas** — `colors: ["#2563EB", "#F8FAFC"]`, `style: "clean flat
vector, generous whitespace"`, `mood: "professional, trustworthy"`.

**editorial-magazine** — `colors: ["#000000", "#FFFFFF", "#C41E3A"]`,
`style: "high-contrast photography, bold typographic layout"`,
`mood: "sophisticated, editorial"`.

**playful-mascot** — `colors: ["#FFB800", "#4ADE80"]`, `style: "rounded
cartoon illustration, thick outlines"`, `mood: "friendly, energetic"`.

## How presets merge into a prompt

The user's own prompt text always comes first and is **never** overridden —
preset fields are appended as additional style guidance. If a user says
"make it dark" but the preset's `lighting` is "bright, high-key," follow
the user's instruction; the preset fills in what the user didn't specify,
it doesn't override what they did.

## Managing presets

```bash
node scripts/presets.js list
node scripts/presets.js show acme
node scripts/presets.js create acme --description "Acme Corp brand style" \
  --colors "#FF6B00,#111111" --style "flat vector illustration, minimalist" \
  --mood "energetic, friendly" --default-model klein9b --default-aspect-ratio 16:9
node scripts/presets.js delete acme --confirm
```

## Using a preset

```bash
node scripts/generate.js --prompt "a hero banner for the homepage" --preset acme
```
