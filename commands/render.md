---
description: Compose the produced manifest into final MP4s via the Remotion compositor — one per format. Works zero-key for code-animated scenes.
argument-hint: "[project-dir] [format]   (default: all formats in the manifest)"
allowed-tools: Bash, Read
---

# /video-factory:render

Run the `compositor` adapter (Remotion) over the project's `manifest.json`.

## Steps
1. Resolve the project dir and the format(s) (from `$ARGUMENTS`, else every entry in the
   manifest's `format`).
2. Ensure Remotion deps are installed (`cd remotion && npm install` once).
3. For each format, call the compositor adapter:
   ```bash
   echo '{"manifest_path":"<proj>/manifest.json","format":"16:9","out_path":"<proj>/output/video-16x9.mp4"}' \
     | providers/compositor/remotion.mjs
   ```
   The compositor times each scene from the **measured** `duration_ms` (falls back to
   `duration_estimate_s` for un-produced/zero-key scenes), layers audio + word-timed captions,
   and renders at the format's native resolution (16:9→1920×1080, 9:16→1080×1920, 1:1→1080×1080).
4. Report each output path and its duration. If a scene's asset is missing, render its
   code/title-card fallback and warn (don't abort the whole video).
