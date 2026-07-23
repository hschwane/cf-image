> Load this on-demand when constructing a prompt or when the user asks about
> prompting technique. Not required for simple, already-detailed requests.

Flux (`schnell`/`klein4b`/`klein9b`/`dev`) and Leonardo (`phoenix`/`lucid`)
respond well to natural sentences, but vague prompts produce generic
results. Never pass the user's raw terse text straight to `generate.js` —
expand it first, unless the user clearly wants that literal phrase rendered.

## The 5-component formula

**Subject → Action/Pose → Setting → Composition/Framing → Style**

| Component | Bad | Good |
|---|---|---|
| Subject | "a cat" | "an orange tabby cat with a white chest patch" |
| Action/Pose | "fighting" | "mid-punch, fists raised in a fighting stance, weight on the back foot" |
| Setting | "somewhere cool" | "a dim warehouse, dust motes lit by a single overhead lamp" |
| Composition | (unstated) | "centered, three-quarter view, dynamic low angle" |
| Style | "cool art" | "cel-shaded anime style, bold linework, dramatic speed lines" |

Locking Style explicitly matters most for consistency across a batch or
across models — without it, results drift call to call.

## Domain lenses

Pick one to steer vocabulary; combine with the 5-component formula above.

- **Logo/Icon**: flat vector, centered subject, simple solid-color
  background, legible at small sizes. Vocabulary: "flat vector illustration,"
  "minimalist mark," "die-cut sticker style," "2-color palette," "app icon
  grid." Say "logo"/"icon" explicitly or you'll get a photographic scene.
- **Product/UI**: clean studio background, precise framing. Vocabulary:
  "softbox lighting," "on white seamless," "45-degree hero angle," "UI
  mockup," "flat lay."
- **Illustration/Character**: describe pose, expression, and art style
  explicitly. Vocabulary: "flat vector illustration," "storybook
  illustration," "cel-shaded anime," "cartoon style," "watercolor texture."
- **Photoreal/Cinematic**: name a camera/lens/lighting feel — Leonardo
  models default to a stylized look even on photographic prompts, so this
  matters more here than elsewhere. Vocabulary: "shot on 35mm film," "shot
  on a Sony A7III, 85mm f/1.4," "golden hour side lighting," "shallow depth
  of field," "documentary photograph." Recommend `lucid` for this lens if a
  cheap-tier draft isn't convincing.
- **Landscape/Environment**: establish scale, time of day, weather/mood.
  Vocabulary: "wide establishing shot," "overcast diffused light," "blue
  hour," "aerial view."
- **Infographic**: layout hierarchy matters more than art style. Vocabulary:
  "clean infographic layout," "labeled diagram," "icon-based data
  visualization," "bar/line/pie chart illustration," "numbered steps." Quote
  any exact labels/numbers verbatim (see "In-image text" below) — these
  models are not reliable at inventing correct data visualizations, so keep
  the request to layout/style, not to generating real data accurately.
- **Abstract**: Vocabulary: "generative art," "fractal pattern," "voronoi
  tessellation," "flowing gradient mesh," "geometric abstraction," "particle
  system," "fluid simulation aesthetic."

## In-image text

`dev` renders legible text far better than any other model here (confirmed:
rendered "Kung Fu Master" cleanly on a belt, including a mirrored
reflection, when every cheaper model garbled it). `phoenix` is the next best
option and meaningfully cheaper. If a request needs a real wordmark/label/
sign and the cheap tier's draft garbles it, recommend `dev` or `phoenix` —
don't just retry the cheap model hoping for a better roll.

When text matters, be precise about it (unverified against these models
specifically, but a reasonable transfer from general prompt-engineering
practice — treat as a starting point, adjust if results say otherwise):
- Quote the exact text in quotation marks: `the sign reads "OPEN 24 HOURS"`.
- Keep it short — one or two words/short phrases render far more reliably
  than a full sentence.
- State where it goes: "centered on the sign," "along the bottom third,"
  "on the character's jacket patch."

## Negative prompts

Only `phoenix` has a real `negative_prompt` API parameter. For every other
model (`schnell`, `klein4b`, `klein9b`, `lucid`, `dev`), there is no
negative-prompt mechanism — describe what you *want* instead of what to
exclude. "no text" or "without people" in the main prompt is unreliable on
these models; rephrase positively ("empty room," "blank background") instead.

## Banned / low-value words

Superlative filler ("ultra-realistic," "masterpiece," "8K," "award-winning")
does little for these models and crowds out real description. Spend the
words on concrete detail instead — a named camera, a specific material, an
exact pose.

## Prompt length guide

| Use case | Target length | Notes |
|---|---|---|
| Icon/logo | 15-30 words | Over-describing a simple mark adds noise |
| Product/UI shot | 30-60 words | Cover subject, lighting, framing |
| Illustration/character | 40-80 words | Pose and style carry the most weight |
| Photoreal/cinematic | 50-100 words | Camera/lens/lighting details earn their keep here |
| Reference-image edit | short, delta-only | Describe the change, not the whole scene — see below |

## Aspect ratio by use case

`--aspect-ratio` is client-side shorthand, computed against the same
~1MP pixel budget as the 1024×1024 default — not yet exercised against the
live API beyond square, so treat non-square output as unverified until
confirmed in practice.

| Use case | Ratio |
|---|---|
| Blog header / YouTube thumbnail | `16:9` |
| Story/Reel/mobile wallpaper | `9:16` |
| Icon, avatar, square social post | `1:1` (the default) |
| Print portrait / poster | `2:3` or `3:4` |
| Ultra-wide banner | `21:9` |

## Editing via reference images: when and how

Reference images (`--reference-image`) preserve the reference's subject and
style closely by default — that's the point for small, targeted edits, but
it means a short or vague edit instruction often comes back nearly
identical to the input. Two practical rules learned from testing:

1. **Match the edit's size to the tool.** Small, targeted changes (swap the
   background, change a color, apply a style filter, adjust one detail) work
   well and cheaply with a reference image. Large changes (a full pose
   change, a different interaction between subjects, turning a character to
   face the other direction) took several rounds of increasingly explicit
   prompting in testing — for a large change, consider whether a fresh,
   fully-described generation (no reference) reaches the goal faster and
   cheaper than iterating on a reference.
2. **Be explicit and spatial, every time.** "Make them face each other"
   under-specifies; "turn the character 180 degrees so their back faces the
   camera and they look toward the other subject" gets followed. Each edit
   call is independent — it does not remember earlier correction requests
   except through the reference image itself, so if something needs to stay
   true (e.g. "the tentacle stays attached to the octopus's body"),
   re-state it explicitly in every edit prompt, not just the first one.

Reference-image edits are not free even on `klein4b` — see
`references/models.md`'s "Resolution and cost" section before iterating
many times on one image.

**Common edit phrasing → crafted instruction:**

| Don't | Do |
|---|---|
| "remove the background" | "remove the existing background entirely, replace it with a plain solid white background, preserve all edges of the subject" |
| "make it warmer" | "shift the color grade warmer — more amber/orange in the highlights and midtones, keep the same composition and subject" |
| "add text" | `add the text "SALE" in bold sans-serif, centered near the top, white with a dark outline for contrast` |
| "make it pop" | "increase contrast and color saturation slightly, keep the composition and subject identical" |
| "extend it" / "make it wider" | Unverified whether reference-image conditioning actually outpaints beyond the original frame vs. just re-rendering within it — treat as untested, tell the user if the result doesn't actually extend the canvas |

**Multiple reference images** (up to 4 at once): give each one a distinct,
short label in the prompt so the model knows which reference maps to which
role — e.g. "combine the character from the first reference image with the
background style from the second reference image," rather than leaving it
to infer which reference means what.

## Common mistakes

1. Passing the user's raw two-word request unmodified — expand it first.
2. Leaving Style unstated, then being surprised results drift across calls.
3. Asking for legible text on a cheap-tier model instead of recommending `dev`/`phoenix`.
4. Using a negative-style instruction ("no X") on a model with no `negative_prompt` param instead of rephrasing positively.
5. Making one reference-image edit request that bundles several large changes at once — split into smaller, explicit steps.
6. Not re-stating a must-preserve detail on a follow-up reference-image edit, letting it silently drift.
7. Retrying an identical prompt after a safety-filter block instead of rewording.
8. Burying the most important detail at the end of a long prompt — put what matters most early.
9. Not using emphasis for a genuinely critical constraint (ALL CAPS on the specific word/phrase, e.g. "the sign MUST read exactly...") when a normal-weight instruction has already been ignored once.

## Safety filter (error 3030)

`klein4b`'s filter is the twitchiest in the catalog and can false-positive
on ambiguous action verbs. Measured example: "training kung fu" was
flagged; "practicing kung fu martial arts moves" for the identical subject
was not. On a 3030, don't retry verbatim — soften the action verb, remove
ambiguous phrasing, retry once. If the reworded prompt blocks again, fall
back to `schnell`. If `schnell` also blocks it, stop and tell the user
plainly rather than escalating to a costlier model or retrying further.

The table below generalizes beyond the one measured case, by analogy —
treat it as a starting point to try, not a measured result, until more
blocks are observed and confirmed:

| Trigger category | Rephrase approach |
|---|---|
| Ambiguous action verbs (e.g. "fighting," "training") | Swap for a more specific, clearly non-violent phrasing of the same pose/action |
| Violence/weapons | Reframe abstractly — describe the pose/composition, not the implied violence |
| Real public figures | Describe a generic/fictional person with similar visual traits instead of naming someone real |
| NSFW/suggestive | Remove the suggestive framing entirely, describe the scene neutrally |
| Medical/gore | Reframe clinically/artistically rather than graphically |

## Transparency / logo backgrounds

No model here is confirmed to output alpha transparency. For a mark that
needs to end up on an arbitrary background, either ask for a plain solid
color ("simple solid white background") so it's easy to key out in any
image editor, or use the green-screen + chroma-key pipeline in
`references/post-processing.md` for a real transparent PNG.

## Presets

If the request names a recurring brand/style, check for a saved preset
before hand-describing it again — see `references/presets.md`.
