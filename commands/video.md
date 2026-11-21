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
   Apply `skills/quality-rules` and `skills/camera-movements` — hook in first 3s, motivated
   b-roll, pacing, shot variety, and deliberate camera movement selection (`visual.shot.move`
   from the 46-move library: consider camera movements for any and all shots during storyboard
   creation for cinematic impact, without overdoing motion), plus a **`/deslop` pass** on all
   narration + on-screen text (strip AI-writing tells before the manifest is locked — §8).
2. Validate the manifest against `skills/manifest/schema/manifest.schema.json`, then run the
   audit: `node scripts/validate-manifest.mjs <project>`. Fix every error (hook, a graphic per
   sentence, the through-line, pacing, budget) before going on.

## Phase B — HUMAN GATE (the reversibility checkpoint)
3. Show the user the manifest as a readable storyboard (scene list: narration + visual brief
   + which provider each scene will use + a rough cost estimate from `providers.json` tiers).
   **Ask for approval. Make no paid call until they approve.** They can edit any scene first.
   When they say yes, record it: `node scripts/approve.mjs <project> --by "<their name>"`.
   The producer checks that approval against a hash of the plan and refuses to spend if the
   plan changed afterwards. Silence is never approval, and you never approve on their behalf.

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
   fixes composition/look (keep the still brief free of camera-motion words), passed as
   `ref_frame` to the clip step. (40%→80%+ first-try.)
6. **Visual**: `clip` / `image` / `avatar` adapter per `visual.source`, seeded by the brief
   (+ `continuity_refs` from prior scenes). When `visual.shot.move` is set on a `clip` scene,
   `scripts/produce.mjs` resolves the 5-slot camera prompt (`Camera / Movement / Speed / Framing / End`
   from `skills/camera-movements`, or via `node scripts/camera-move.mjs build`) and prepends it
   with the first-frame preservation note.
7. **Per-scene review** (editor agent / `:scene-review`): score the asset against
   `visual_brief`. Below `min_semantic_score` → regenerate, don't continue silently.
8. **Captions**: if `word_timings` empty, recover via `stt`. **Music/SFX** per scene.
   Update `project.json` after each scene (resume-safe).

8b. **Grid**: once the music bed exists the producer measures its beats and holds each scene so
   its cut lands on one (`scripts/snap-grid.mjs`). If it reports the bed has no reliable pulse,
   ask for a bed with a clear kick and re-run.
8c. **Audit again**: `node scripts/validate-manifest.mjs <project>` now also checks the cuts
   against the beats and every generated still against the palette.

## Phase D — Compose
9. `/video-factory:render` for each `format` → `output/`. Report paths + total cost.

Throughout: read provider choices from `providers.json` (per-scene overrides win). If a
required tier isn't configured, say so and offer the core fallback (e.g. `say` TTS,
code-animated visuals) rather than failing.

Telemetry: after the human gate and at the end, run `node scripts/telemetry.mjs run --project <project>`;
record an approval, rejection or correction with `node scripts/telemetry.mjs event add --project <project> --kind <kind> --note "<their words>"`,
and ask for one quality tap at the gate (`--kind quality --artifact <id> --score <1-5> --gate <label>`).
See `docs/telemetry.md`.
