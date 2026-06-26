---
name: remotion-compose
description: How the Remotion compositor turns a manifest into MP4s — the zero-key core. Scene mapping, per-format dimensions, audio sync, and word-timed captions.
allowed-tools: Read, Bash
metadata:
  author: Emmanuel Prouvèze
---

# Remotion compositor (the zero-key core)

Remotion is the headless compositor: code-defined, deterministic, runs without a GUI or any
API key. It renders the manifest into one MP4 per `format`. Code lives in `remotion/`.

## Mapping
- One composition, `Video`, receives the manifest as `inputProps`.
- `calculateMetadata` computes total duration: sum of each scene's **measured** `duration_ms`
  (fallback `duration_estimate_s × fps`). Dimensions from `format`:
  16:9→1920×1080, 9:16→1080×1920, 1:1→1080×1080.
- Each scene → a `<Series.Sequence>` of its frame length. Inside:
  - `visual.source = code` → render `<{visual.component}>` (registry in `src/components/`)
    with `visual.props`. **This is the zero-key path** — title cards, stat cards, before/after.
  - `image` → `<Img src={asset}>`; `clip`/`avatar`/`screen_rec` → `<OffthreadVideo src={asset}>`.
  - `<Audio src={tts asset}>` for narration; music bed as a lower-volume track with ducking.
  - `captions = auto` → `<Captions>` reads `word_timings`, highlighting the active word.

## Run
```bash
cd remotion && npm install        # once
echo '{"manifest_path":"../projects/<p>/manifest.json","format":"16:9","out_path":"../projects/<p>/output/video-16x9.mp4"}' \
  | node ../providers/compositor/remotion.mjs
# or preview: npx remotion studio
```

## Degrade gracefully
A scene with no produced `asset` renders its `code` fallback (a title card from `tts_script`/
`title`) and the render warns — it never aborts the whole video. So the zero-key core always
produces *something* watchable before any paid tier is wired.

For deeper Remotion patterns (springs, fonts, captions), the community
`remotion-best-practices` skill / `npx skills add remotion-dev/skills` complements this.
