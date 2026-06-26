---
description: Adversarially review one scene's produced asset against its visual_brief and quality gates. Score, verdict, and a regeneration brief if it fails.
argument-hint: "<project-dir> <scene-id>"
allowed-tools: Bash, Read
---

# /video-factory:scene-review

The quality gate that no open-source pipeline does well: **Claude as art-director reviewer.**

## Steps
1. Load the scene from the project's `manifest.json` and its produced `asset`.
2. **Inspect the actual asset**, don't trust the filename:
   - Image/clip: extract a frame or two (`ffmpeg -ss ... -vframes 1`) and Read them.
   - Audio: `ffprobe` for duration, leading/trailing silence, and compute words-per-minute
     from the `tts_script` word count ÷ duration.
3. Score against the scene's `quality_gate` and the `skills/quality-rules`:
   - **Semantic match** (0-1): does the asset depict the `visual_brief`, or a generic stand-in?
     (The "neurons firing" vs "stock brain scan" test.)
   - **Technical**: silence ≤ `silence_max_ms`; WPM within `speaking_rate_wpm`; no morph/identity
     drift vs `continuity_refs`; composition has motivated framing, not default center-medium.
4. **Verdict**: `pass` or `regenerate`. If regenerate, output a concrete, improved brief
   (what was wrong + the specific change), not just "try again". Default to skeptical — a
   plausible-but-generic asset is a fail.
5. Write the verdict + score into `project.json` for the scene.
