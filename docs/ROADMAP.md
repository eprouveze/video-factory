# Roadmap — phased & deferred features

Phases are shippable increments. Each is usable on its own; later phases deepen quality and
unlock the product. "Deferred" = intentionally not now, with the reason.

Legend: ✅ done · 🟡 in progress · ⬜ planned · 🔭 deferred

---

## Phase 0.1 — Zero-key core + voice  *(MVP — current)*
**Goal:** render a real video end-to-end with no paid keys; voice is the first paid tier.

- ✅ Plugin scaffold: commands, role-agents, providers registry, contracts
- ✅ Manifest schema + lifecycle + human-gate flow
- ✅ Remotion compositor (code scenes, multi-format, captions, graceful degrade)
- ✅ Encoded quality rules + adversarial Editor review
- ✅ `finish` core looks (cinematic / warm-doc / punchy-social / noir, ffmpeg)
- ✅ Zero-key TTS adapter (`say`)
- ✅ ElevenLabs TTS adapter (word timings → animated captions)
- ✅ `:setup` config mechanism (key + default voice; gitignored config verified)
- ✅ Golden render verified (16:9 + 9:16, brand font, ffprobe)

## Phase 0.2 — Generative b-roll + sound
**Goal:** real footage + score, with the reference-frame discipline that controls cost/drift.

- ✅ `image` adapter (Imagen + gpt-image-2, **direct keys** — no fal markup) + reference-frame locking
- ✅ `clip` adapters — Veo 3.1 fast (direct, Gemini API) ✅; Kling (direct, single-key) ✅ *(needs account credits to produce)*
- ✅ `music` + `sfx` adapters (ElevenLabs) + music-bed **ducking** in the compositor
- 🔭 `stt` adapter (Deepgram / WhisperX) for captions when TTS lacks timings — deferred
- 🟡 Editor agent defined; auto-regenerate-on-fail loop not yet wired into production

## Phase 0.3 — Avatar + reframe
**Goal:** your-own-avatar talking head where wanted; clean multi-aspect.

- ⬜ `avatar` adapters: HeyGen (your avatar clone) + Sync.so (lip-sync on real footage of you)
- ⬜ `reframe`: native per-aspect generation default; Reap API for post-hoc subject-tracked reframe
- ⬜ `talking-head` + `faceless-story` + `reel` + `product-demo` templates

## Phase 0.4 — Semantic b-roll engine  *(the moat)*
**Goal:** solve the field's #1 unsolved problem — b-roll that *matches meaning*, not keywords.

- 🔭 Embed each `tts_script` segment; vector-search a clip/asset library (not keyword search)
- 🔭 Claude-as-art-director `visual_brief` → per-segment clip scoring before commit
- 🔭 `continuity_refs` carried across scenes for character/look consistency
- 🔭 Asset library service (R2 + embeddings) replacing `public/` staging at scale

## Phase 0.5 — Premium finishing (DaVinci)
**Goal:** broadcast-grade last 10% for a premium product tier.

- 🔭 `davinci` finish adapter: Resolve API applies a saved PowerGrade per look to one clean
  master on a dedicated Studio box (Emmanuel's license)
- 🔭 AI ops: Super Scale upscale, Magic Mask relight, noise reduction, HDR delivery
- 🔭 External watchdog (modal-dialog hang detection; the box monitored from M4, not itself)
- 🔭 Remotion → ProRes/EDL export handoff

## Phase 1.0 — Hosting & scale
**Goal:** turn the engine into a hosted experience. (Commercial/productization specifics are
tracked separately, outside this repo.)

- 🔭 Web UI: brief → reviewable manifest → produced video (the human gate as the UX)
- 🔭 Multi-tenant render scaling (Remotion Lambda / VPS pool)
- 🔭 Brand kits (per-project palette/LUT/voice), asset library
- 🔭 Publish/schedule (YouTube/TikTok/Reels) + auto multi-format

## Deferred / maybe (not committed)
- 🔭 HyperFrames (HeyGen, Apache-2.0) as an alternative overlay layer
- 🔭 Local-LLM script authoring for fully-offline operation
- 🔭 Batch "series" generation (niche lanes, scheduled cadence)
- 🔭 Marketplace publish of the open-source plugin (after dogfooding hardens it)

## Sequencing logic
Ship the zero-key core + voice first (provable value, no spend). Add b-roll/sound (0.2) since
that's where "slop vs incredible" is won. Avatar/reframe (0.3) is breadth. The **semantic
b-roll engine (0.4) is the hard differentiator** — the part most worth getting right.
Finishing (0.5) and hosting (1.0) deepen quality and reach.
