# Roadmap: phased and deferred features

Phases are shippable increments. Each is usable on its own; later phases deepen quality and
expand production reach. "Deferred" means intentionally not now, with the reason.

Legend: ✅ done · 🟡 in progress · ⬜ planned · 🔭 deferred

---

## Phase 0.1: Zero-key core + voice
**Goal:** render a real video end-to-end with no paid keys; voice is the first paid tier.

- ✅ Plugin scaffold: commands, role-agents, providers registry, contracts
- ✅ Manifest schema + lifecycle + human-gate flow
- ✅ Remotion compositor (code scenes, multi-format, captions, graceful degrade)
- ✅ Encoded quality rules + adversarial Editor review
- ✅ `finish` core looks (cinematic / warm-doc / punchy-social / noir, ffmpeg)
- ✅ Zero-key TTS adapter (`say`)
- ✅ ElevenLabs TTS adapter (word timings -> animated captions)
- ✅ `:setup` config mechanism (key + default voice; gitignored config verified)
- ✅ Golden render verified (16:9 + 9:16, brand font, ffprobe)

## Phase 0.2: Generative video, stills & sound
**Goal:** real footage + score, with reference-frame discipline that controls cost and drift.

- ✅ `image` adapters: Gemini 3.1 Flash Lite Image, Nano Banana Pro (`gemini-3-pro-image`, 2K,
  opt-in), OpenAI `gpt-image-2.6-sunburst`, and MiniMax H3 Image (`MiniMax-H3-Image`) with
  multi-reference support (`refs: true`)
- ✅ identity sheets: `scripts/identity-sheet.mjs` builds a 20-shot reference set from one photo
  (`skills/identity-sheet`), for multi-shot face consistency without a trained identity model
- ✅ cinematic craft slots on the build prompt: `--lighting --composition --depth --colour`
- ✅ `clip` adapters: **MiniMax H3 (`MiniMax-H3`, default)** with first/last-frame transitions,
  reference image/audio/video mode, 768P -> 2K regeneration, and pre-call gates; Gemini Omni 1.2
  Flash; OpenRouter async video (`alibaba/wan-2.7`); Kling direct
- ✅ `music` + `sfx` adapters (ElevenLabs) + music-bed **ducking** in the compositor
- ✅ `stt` adapters: ElevenLabs Scribe (`scribe_v3`, default) and OpenAI Whisper (`whisper-1`)
  with word-level timestamps for caption recovery
- ✅ **Real-voice voiceover:** scene `voiceover:` uses a speaker's actual voice (not TTS);
  `scripts/extract-voice.mjs` forced-aligns named quotes out of a recording -> normalized clip +
  `word_timings`. Blends with TTS narration.
- ✅ **Ken-Burns on stills:** `image` scenes move by `shot.motion`; `objectPosition` biases the
  crop for off-centre subjects in 9:16; `fit:"contain"` for poster/cover art
- ✅ **`event-recap` template + editorial method** (quality-rules section 9): ground in real
  transcript/deck/recording, verbatim gold quotes on cards, real-voice apex lines, team-credit
  fidelity, real photos + slides over generation
- 🟡 Editor agent defined; auto-regenerate-on-fail loop not yet wired into production

## Phase 0.25: Grid, graphics & look lock
**Goal:** the craft layer that makes a code-drawn video read as designed, at no extra spend.

- ✅ Manifest audit with negative-control tests (`scripts/validate-manifest.mjs`, `tests/`)
- ✅ Word-anchored explaining graphics (12 kinds) + the through-line device in the compositor
- ✅ Beat map of the music bed + cut snapping (`scripts/beat-map.mjs`, `scripts/snap-grid.mjs`)
- ✅ Approval bound to a hash of the plan; spend cap, stop switch, and ledger in the producer
- ✅ Look lock: `brand.style_suffix`, palette score, plate size, and near-duplicate checks
- ✅ Sourced list-price estimates (`est_usd`, `est_source`, `est_as_of`) in `providers.json`
  verified by automated test
- ✅ `look_ref` and scene `continuity_refs` sent to image adapters as real reference images
- ⬜ Graphics + through-line in the HyperFrames compositor (Remotion only today)

## Phase 0.3: Song-led music videos, cinematography & telemetry *(current)*
**Goal:** end-to-end production for music videos and narrative AI films, proven on full-length
music-video episodes.

- ✅ Song-led `mode: "music"` pipeline (`/video-factory:music-video`, Phases 0 to 13): story,
  lyric form lint, song auditions, master-audio EDL tiling, early rough cuts, beat maps
- ✅ MiniMax H3 production stack: default clip adapter (`providers/clip/minimax.mjs`),
  first/last-frame transitions, `.wav` vocal-stem lip-sync, 768P -> 2K regeneration, reference
  videos, `MiniMax-H3-Image` adapter (`providers/image/minimax.mjs`), pre-call validation gates
- ✅ 3D geometry blockout route (`docs/blockout-set-route.md`), character sheets, and per-take
  seed + continuity records (`scripts/take-record.mjs`)
- ✅ 46-move camera cinematography library (`skills/camera-movements/`), 5-slot prompt builder
  (`scripts/camera-move.mjs`), and portable `/video` skill (`skills/video/SKILL.md`)
- ✅ QA and delivery suite: lip-sync correlation (`scripts/lipsync-check.py`), stray-frame
  detection (`scripts/stray_frame_check.py`), rough-cut review & align tools, chunked resumable
  render, bit-identical audio mux, YouTube private-first upload & captions
- ✅ Deterministic per-project telemetry (`scripts/telemetry.mjs`, `docs/telemetry.md`)

## Phase 0.35: Avatar + reframe
**Goal:** your-own-avatar talking head where wanted; clean multi-aspect.

- ⬜ `avatar` adapters: HeyGen (your avatar clone) + Sync.so (lip-sync on real footage of you)
- ⬜ `reframe`: native per-aspect generation default; Reap API for post-hoc subject-tracked reframe
- ⬜ `talking-head` + `faceless-story` + `reel` + `product-demo` templates

## Phase 0.4: Semantic b-roll engine
**Goal:** solve the field's #1 unsolved problem: b-roll that *matches meaning*, not keywords.

- 🔭 Embed each `tts_script` segment; vector-search a clip/asset library (not keyword search)
- 🔭 Claude-as-art-director `visual_brief` -> per-segment clip scoring before commit
- 🔭 `continuity_refs` carried across scenes for character/look consistency
- 🔭 Asset library service (R2 + embeddings) replacing `public/` staging at scale

## Phase 0.5: Premium finishing (DaVinci)
**Goal:** broadcast-grade last 10% for a premium product tier.

- 🔭 `davinci` finish adapter: Resolve API applies a saved PowerGrade per look to one clean
  master on a dedicated Studio box
- 🔭 AI ops: Super Scale upscale, Magic Mask relight, noise reduction, HDR delivery
- 🔭 External watchdog (modal-dialog hang detection)
- 🔭 Remotion -> ProRes/EDL export handoff

## Phase 1.0: Hosting & scale
**Goal:** turn the engine into a hosted experience. (Commercial/productization specifics are
tracked separately, outside this repo.)

- 🔭 Web UI: brief -> reviewable manifest -> produced video (the human gate as the UX)
- 🔭 Multi-tenant render scaling (Remotion Lambda / VPS pool)
- 🔭 Brand kits (per-project palette/LUT/voice), asset library
- 🔭 Publish/schedule (YouTube/TikTok/Reels) + auto multi-format

## Deferred / maybe (not committed)
- 🔭 HyperFrames (HeyGen, Apache-2.0) as an alternative overlay layer
- 🔭 Local-LLM script authoring for fully-offline operation
- 🔭 Batch "series" generation (niche lanes, scheduled cadence)
- 🔭 Marketplace publish of the open-source plugin (after dogfooding hardens it)

## Sequencing logic
Ship the zero-key core + voice first (provable value, no spend). Add generative video/stills and
sound (0.2) plus grid/look craft rules (0.25). Harden the full song-led music-video and MiniMax H3
cinematography stack on real episodes (0.3). Avatar/reframe (0.35) adds breadth, semantic b-roll
(0.4) deepens narration, and finishing/hosting (0.5 / 1.0) scale output quality and reach.
