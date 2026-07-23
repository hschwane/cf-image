> Load this on-demand when the user needs image manipulation after
> generation (resize, crop, format conversion, transparency, compositing).

No model in this toolkit outputs alpha transparency, and there's no
built-in resize/crop/compositing beyond what generation itself produces.
Post-processing here means shelling out to ImageMagick/FFmpeg via `Bash` —
not an npm dependency, so it doesn't affect the zero-install philosophy of
the Node scripts, but it does require these tools to be installed.

## Prerequisites

```bash
which magick || which convert || echo "ImageMagick not installed - install with: sudo apt install imagemagick (Linux), brew install imagemagick (macOS), or winget install ImageMagick.ImageMagick (Windows)"
which ffmpeg || echo "FFmpeg not installed - only needed for GIF/video output"
```

Use `magick` (ImageMagick 7) if present; fall back to `convert` (v6) if not.
If neither exists, tell the user rather than guessing at a command.

## Resize / crop

```bash
# Resize to fit within bounds, preserving aspect ratio
magick input.jpg -resize 1200x630 output.jpg

# Resize + crop to an exact size (e.g. a platform banner)
magick input.jpg -resize 1200x630^ -gravity center -extent 1200x630 output.jpg

# Crop to a specific aspect ratio without resizing
magick input.jpg -gravity center -crop 16:9 +repage output.jpg
```

## Format conversion

```bash
magick input.jpg output.png
magick input.png -quality 90 output.jpg
magick input.png output.webp
```

## Color / basic adjustments

```bash
magick input.jpg -brightness-contrast 10x5 output.jpg
magick input.jpg -modulate 100,120,100 output.jpg   # saturation +20%
```

## Batch processing

```bash
for f in *.jpg; do
  magick "$f" -resize 800x800 "resized-${f}"
done
```

## Transparent PNG output (green-screen pipeline)

Since no model here outputs alpha, get real transparency by generating
against a solid chroma-key background, then keying it out:

1. **Generate with a chroma-key background.** Add to the prompt: "on a
   solid flat #00FF00 green background, no shadows, no gradient, evenly
   lit." Avoid green in the actual subject or it'll get keyed out too.
2. **Remove the green screen:**
   ```bash
   magick input.jpg -fuzz 10% -transparent "#00FF00" output.png
   ```
   Increase `-fuzz` (e.g. `15%`) if fringing remains; decrease it if the
   subject itself starts losing pixels.
3. **Clean up edges:**
   ```bash
   magick output.png -alpha extract -blur 0x1 -level 20%,80% output-mask.png
   magick output.png output-mask.png -alpha off -compose CopyOpacity -composite output-clean.png
   ```
4. **Trim to content bounds:**
   ```bash
   magick output-clean.png -trim +repage output-final.png
   ```

## Compositing onto a new background

```bash
magick background.jpg subject.png -gravity center -composite output.jpg
```

## Verify before reporting success

Check the output file actually exists and has nonzero size before telling
the user post-processing succeeded:

```bash
test -s output.png && echo ok || echo "post-processing failed - output missing or empty"
```
