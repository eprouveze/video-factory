---
name: video
description: Orchestrate AI video production end-to-end with video-factory (/video and /music-video) — human-gated manifest, TTS/audio spine, 46 camera movement prompts, reference-frame lock, Remotion/HyperFrames composition, and QA gates.
allowed-tools: Bash, Read, Write, Edit, Task
metadata:
  author: Emmanuel Prouvèze
---

# Video Factory (`/video` & `/music-video`)

Portable skill entry point for **Video Factory** — the declarative, human-gated AI video and music-video production pipeline.

Whether invoked in Claude Code (`/video-factory:video`, `/video-factory:music-video`), Antigravity (`/video`), or Codex, the core doctrine is identical:

> **All creative & cheap work and a human approval gate come BEFORE any expensive generation call.** If an output is wrong, fix `manifest.json` (or `edl.json`), not the code.

---

## 1. Core Pipeline Entry Points

| Workflow | Command Spec | Temporal Spine | Primary Use |
|---|---|---|---|
| **Explainer / Launch / Event Recap / Narrative** | [`commands/video.md`](../../commands/video.md) | **TTS-first** (`mode: "narration"`): real measured audio duration drives scene timing | Product films, explainers, keynote recaps, social cuts (`16:9`, `9:16`, `1:1`) |
| **Song-Led Music Video** | [`commands/music-video.md`](../../commands/music-video.md) | **Master-audio-first** (`mode: "music"`): shots tile `[0, audio_master_duration_ms]` on the beat map | Full music videos with lyrics, auditions, stems, animatic, i2v takes, and lip-sync QC |

Companion skills in this plugin:
- [`skills/manifest/SKILL.md`](../manifest/SKILL.md) — `manifest.json` lifecycle, schema (`skills/manifest/schema/manifest.schema.json`), approval hash, and ear-vs-eye phonetic decoupling (`tts_phonetic`).
- [`skills/quality-rules/SKILL.md`](../quality-rules/SKILL.md) — The 13 encodable rules that separate incredible video from AI slop (hook, pacing, semantic b-roll, sound design, captions, LUT/palette lock, shot variety, one graphic per sentence, through-line device, beat grid).
- [`skills/camera-movements/SKILL.md`](../camera-movements/SKILL.md) — 46-move AI cinematography library (`moves.json`) + 5-slot camera prompt grammar (`Camera / Movement / Speed / Framing / End`) + first-frame reference lock assembly.
- [`skills/remotion-compose/SKILL.md`](../remotion-compose/SKILL.md) — Remotion & HyperFrames composition and rendering.

---

## 2. Storyboard Restraint & Cinematic Impact (46 Camera Movements)

During **storyboard and cut-list creation** (Phase A of `/video`, Phase 3 of `/music-video`, and inside `agents/director.md`), evaluate the 46 camera movements in `skills/camera-movements` for **any and all shots**, choosing movements for deliberate cinematic impact:

1. **Consider camera movement on every shot — but never overdo it.** Camera motion must be motivated by the story beat, vocal phrasing, or reveal. If every shot swoops or zooms, the viewer becomes fatigued and no move lands.
2. **Anchor the cut with stillness and subtle parallax.** Use `static-shot` (`01`), `slider-right`/`slider-left` (`12`/`12B`), or gentle `slow-zoom-in` (`05`) on grounded dialogue and verse setups so the performance or explaining graphic holds center stage.
3. **Deploy signature moves where they deliver maximum emotional payoff:**
   - **Earned intimacy or dread:** `dolly-in` (`08`) (true 3D parallax approaching the subject) or `slow-zoom-in` (`05`) (optical compression).
   - **Abandonment, isolation, or chapter close:** `dolly-out` (`09`), `crane-up` (`25`), or `drone-pull-back` (`26B`).
   - **Shock, realization, or hard beat drop:** `crash-zoom-in` (`07A`), `crash-zoom-out` (`07B`), or `whip-pan-right`/`left` (`03`/`03B`).
   - **Journey & momentum:** `tracking-shot` (`16`), `follow-shot` (`17`), `reverse-tracking` (`18`), `side-tracking` (`19`), `low-tracking` (`20`), `vehicle-tracking` (`21`), or `chase-shot` (`22`).
   - **Spatial depth & discovery:** `push-past` (`13`), `truck-right`/`left` (`10`/`10B`), `pedestal-up`/`down` (`11A`/`11B`), `arc-right`/`left` (`14`/`14B`), or `orbit-clockwise`/`counterclockwise` (`15`/`15B`).
   - **Raw human tension or vertigo:** `handheld-shot` (`23`) or `snorricam` (`24`).
   - **Surreal or scale transitions:** `fpv` (`S1`), `tilt-shift` (`S2`), `infinite-zoom` (`S3`), `earth-zoom-out` (`S4`), `time-lapse` (`S5`), or `pass-through` (`S6`).
4. **Separate start-still composition from clip camera motion.** When using reference-frame lock (`ref_lock: true` or Phase 5 start stills), keep the image generation prompt static and clean; apply the 5-slot camera prompt (`visual.shot.move` / `node scripts/camera-move.mjs build`) only to the video clip generation call.

---

## 3. Quick-Reference CLI Commands

Run from the `video-factory` repository root (or point to a project directory):

```bash
# 1. Inspect or build camera movement prompts (46 moves across 7 categories)
node scripts/camera-move.mjs list
node scripts/camera-move.mjs list --category "Dolly/Track"
node scripts/camera-move.mjs get low-tracking
node scripts/camera-move.mjs build \
  --move dolly-in \
  --brief "A craftsman at a lit workbench inspecting a brass gear" \
  --ref-context "Locked medium start frame, warm tungsten key light" \
  --style "35mm anamorphic lens, shallow depth of field, fine film grain" \
  --no-text-guard

# 2. Validate & audit a manifest before showing the storyboard to a human
node scripts/validate-manifest.mjs <project-dir>

# 3. Record human approval (ONLY after the human explicitly approves the storyboard)
node scripts/approve.mjs <project-dir> --by "<approver-name>"

# 4. Run production (TTS -> ref-frame lock -> clip with 5-slot camera move -> beat grid)
node scripts/produce.mjs <project-dir>

# 5. Music-video helpers (beat map, EDL -> manifest, take records, lip-sync, QC)
node scripts/beat-map.mjs <audio-master.wav> --out <project-dir>/timing/beats.json
node scripts/music-manifest.mjs <project-dir>/edl.json --out <project-dir>/manifest.json
node scripts/take-record.mjs list --dir <project-dir>/takes
node scripts/review-video.mjs <project-dir>/output/film.mp4 --manifest <project-dir>/manifest.json
```
