---
description: Orchestrate a video end-to-end — author a reviewable manifest, get human approval BEFORE spending, then produce and compose. The main entry point.
argument-hint: "[project-dir]   (defaults to the most recent projects/* )"
allowed-tools: Bash, Read, Write, Edit, Task
---

# /video-factory:video

Drive the full pipeline. The order is deliberate: **all creative + cheap work and a human
gate come BEFORE any expensive generation call.**

## Phase A — Creative (cheap, no paid APIs)
1. Invoke the **director** and **screenwriter** agents (Task tool) on the project brief.
   They produce the manifest: `intent`, `hook` (must work muted), per-scene `tts_script`
   (exact narration) and `visual_brief` (semantic art direction, never a keyword).
   Apply `skills/quality-rules` — hook in first 3s, motivated b-roll, pacing, shot variety,
   and a **`/deslop` pass** on all narration + on-screen text (strip AI-writing tells before
   the manifest is locked — §8).
2. Validate the manifest against `skills/manifest/schema/manifest.schema.json`.

## Phase B — HUMAN GATE (the reversibility checkpoint)
3. Show the user the manifest as a readable storyboard (scene list: narration + visual brief
   + which provider each scene will use + a rough cost estimate from `providers.json` tiers).
   **Ask for approval. Make no paid call until they approve.** They can edit any scene first.

## Phase C — Production (paid; resumable via project.json)
Run the **producer** agent. Per scene, in this order:
4. **TTS first** (the temporal spine): `tts` adapter → audio + `word_timings`. Measure with
   `ffprobe`; write real `duration_ms` back into the manifest. Gate: silence + speaking-rate.
   - **Real voice over TTS** — a scene may set `voiceover: <path>` to use a speaker's ACTUAL
     voice instead of TTS (e.g. apex quotes pulled from a recording). Get the clips with
     `scripts/extract-voice.mjs <project> '<quote>' …` (forced-aligns via `stt` word timestamps,
     emits a normalized clip + `word_timings`). The producer measures duration and recovers
     captions automatically. Blends cleanly with TTS narration on the connective lines.
   - **Stills get motion** — `image` scenes Ken-Burns by `visual.shot.motion` (push/pan/handheld);
     `visual.objectPosition` biases the crop so an off-centre subject survives the 9:16 cut,
     and `visual.fit:"contain"` shows poster/cover art whole on the brand field.
5. **Reference-frame lock** (if `visual.source` is `clip`): `image` adapter → a still that
   fixes composition/look, passed as `ref_frame` to the clip step. (40%→80%+ first-try.)
6. **Visual**: `clip` / `image` / `avatar` adapter per `visual.source`, seeded by the brief
   (+ `continuity_refs` from prior scenes).
7. **Per-scene review** (editor agent / `:scene-review`): score the asset against
   `visual_brief`. Below `min_semantic_score` → regenerate, don't continue silently.
8. **Captions**: if `word_timings` empty, recover via `stt`. **Music/SFX** per scene.
   Update `project.json` after each scene (resume-safe).

## Phase D — Compose
9. `/video-factory:render` for each `format` → `output/`. Report paths + total cost.

Throughout: read provider choices from `providers.json` (per-scene overrides win). If a
required tier isn't configured, say so and offer the core fallback (e.g. `say` TTS,
code-animated visuals) rather than failing.
