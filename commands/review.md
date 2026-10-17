---
description: Run automated 18-frame visual audit, freeze detection, and quality scoring on a rendered MP4. Target 8+/10 before ship.
argument-hint: "<video-path-or-project-dir> [--manifest <manifest-path>] [--strict]"
allowed-tools: Bash, Read
---

# /video-factory:review

Automated post-render quality gate — converts the rendered video into an 18-still contact sheet,
measures hook energy, readability, motion continuity (detects freezes >2.5s), and variety,
verifying semantic duration fidelity against `manifest.json`.

## Steps
1. Resolve the video path (either an `.mp4` file or `<project-dir>/output/*.mp4`).
2. Run the review tool:
   ```bash
   node scripts/review-video.mjs <video-path> --manifest <manifest-path>
   ```
3. Inspect the scores:
   - **Hook (0-3s)**: Opening frame cannot be empty or static; text/action must land immediately.
   - **Readability**: Resolution must be 1080p+, contrast clear, no text collision.
   - **Motion**: No static holds >2.5s without intentional framing.
   - **Variety**: Shot transitions paced to narrative arc.
4. **Target**: $\ge 8.0/10$ across all categories before declaring ship-ready. If defects are
   reported, fix the scene's composition or timing in `manifest.json` and re-render.
