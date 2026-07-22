# Prompting Flux / Leonardo models

Unlike Gemini's natural-language-first image models, the models here (Flux
family, Leonardo Phoenix/Lucid) respond well to natural sentences *and*
benefit from being explicit and concrete — vague prompts produce generic
results. There's no single "official formula" the way Google publishes one
for Gemini, but a consistent shape works well across all of them:

**Subject → Action/Pose → Setting → Composition/Framing → Style**

Example expansion (this session's actual test case):

- Raw ask: *"a cute cat training kung fu"*
- Expanded: *"an orange tabby cat wearing a white karate gi and black belt,
  practicing kung fu martial arts moves in a dojo, cartoon illustration
  style"*
- Why: names the subject concretely (breed/color), gives a specific pose
  instead of a vague activity, sets the scene, and locks the art style so
  results are consistent across models/variations.

## Things that reliably help

- **Name concrete visual details**: colors, materials, specific objects
  ("holding a whisk and a leafy vegetable" beat "cooking implements").
- **Lock the art style explicitly** if you want consistency across a batch
  or across models: "flat vector illustration," "cartoon style," "shot on
  35mm film," "flat design app icon." Without it, different models (or even
  different calls to the same model) will drift in style.
- **For logos/icons**: say "logo," "centered," "simple background," "flat
  vector" — otherwise you'll get a photographic scene instead of a mark.
- **For in-image text** (e.g. a wordmark): `flux-2-dev` renders legible text
  far better than the cheaper models (confirmed — it rendered "Kung Fu
  Master" cleanly on a belt in testing, including a mirrored reflection).
  Cheap models often garble text. If legible text matters, that's one of the
  few cases worth spending on `dev` or at least `klein9b`/`lucid`.

## Things to avoid

- **Ambiguous action verbs on `klein4b`.** It has a stricter/twitchier safety
  filter than the other models. "training kung fu" was flagged (error 3030);
  "practicing kung fu martial arts moves" for the identical subject was not.
  If a prompt gets flagged, don't retry verbatim — soften or rephrase the
  action, then retry once.
- **Don't pass raw terse user text unmodified** unless the user clearly wants
  exactly that literal phrase generated (e.g. they're testing something).
  Expanding a two-word request into a real scene consistently produces
  better results across every model tested here.
- **Banned/dead words**: superlative filler like "ultra-realistic,"
  "masterpiece," "8K" tends to do little for Flux-family models and can
  crowd out useful description — spend the words on concrete detail instead.

## Transparency / logo backgrounds

None of these models have been confirmed to output alpha transparency (they
return JPEG/PNG with an opaque background) — the same limitation
banana-claude's Gemini backend has, which it works around by prompting for a
solid `#00FF00` chroma-key background and stripping it afterward with
ImageMagick/FFmpeg. This toolkit doesn't automate that (would add a
dependency, breaking the zero-install philosophy), but the prompting trick
still helps: for a logo/icon that needs to end up on a transparent or
arbitrary background, ask for "simple solid white background" or "flat solid
color background" rather than a scene — much easier for the user to key out
afterward in any image editor than a background with gradients/texture.

## Presets

If the user has a recurring brand/style (colors, typography, mood), save it
once with `presets.js create` instead of re-describing it every time — see
SKILL.md and `presets.js --help` equivalent (its module docstring) for the
schema. `generate.js --preset <name>` and `batch.js --preset <name>` merge
the preset's style/color/lighting/typography/mood fields onto the end of
whatever prompt is given; the user's own prompt text always comes first and
is never overridden by preset values.

## Model-specific notes for prompting

- `schnell` is a 4-step distilled model — it's fast and good for exploring
  concepts/composition, but fine detail (hands, text, complex scenes) is
  noticeably softer than `klein9b`/`lucid`/`dev`. Use it to find the right
  *idea*, not the final polish.
- `phoenix-1.0` and `lucid-origin` (Leonardo) lean toward a more
  illustrative/stylized default look even with photographic prompts — good
  for concept art and product mockups, ask for "photograph," "photoreal," or
  name a camera explicitly if you need a literal photographic look.
- `flux-2-dev` is the only model in this set worth reaching for when in-image
  text or fine compositional detail (reflections, layered scenes) actually
  matters to the result — it's also the most expensive by a wide margin, so
  reserve it for a final pick rather than exploration.
