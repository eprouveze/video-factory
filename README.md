# Video Factory

> Agent-driven video and music-video production that is not slop. Claude writes a **reviewable
> plan**, then assembles every layer (primary video shots, lip-sync, voice, stills, music,
> captions, finish) from **swappable components**, with Remotion as the headless compositor.

Most AI video tools generate slop: flat pacing, drifting characters, generic b-roll, robotic
delivery, and static captions. Video Factory is the **quality layer**: a declarative manifest you
approve before any paid API call, encoded craft rules, pre-call provider validation gates, a
46-move cinematography library, and deterministic QA checks.

**The zero-key core renders a real video with no API keys.** Add keys to light up MiniMax H3
generative video and stills, voice, precise captions, music, and finishing, one tier at a time.

## How it works

```
brief (narration-led or song-led)
  -> Director + Screenwriter   -> manifest.json / edl.json (hook, script/cut list, camera moves)
  -> HUMAN REVIEW              (approve/edit BEFORE any paid API call; bound by plan hash)
  -> Producer + Editor         (TTS-first or audio-master-first, ref-frame lock, take records)
  -> Remotion compositor       -> MP4 per format (16:9 / 9:16 / 1:1, up to 4K)
  -> QA & finish               -> stray-frame + freeze + lip-sync checks, looks, YouTube delivery
```

What a narration plan has to carry before anyone sees it (checked by
`scripts/validate-manifest.mjs`, each gate backed by negative-control tests in `tests/`, run with
`npm test`):

- a hook readable inside the first second;
- **one explaining graphic per narrated sentence**, drawn in code and entering on the word
  that names it (12 kinds: counter, bar, gauge, tally, stamp, tag, label, terminal, chat,
  strike, checklist, timeline);
- a **through-line device**: one counter, clock, or tag carried in every frame that moves with
  the story;
- no shot under a second, no still move repeated, **every cut on a beat** of the music bed;
- an **approval bound to a hash of the plan** and a **spend cap enforced in the runner**;
- generated stills scored against the brand palette, with one style suffix on every brief.

The `manifest.json` is the source of truth. If the output is wrong, fix the manifest, not the
code. Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/ROADMAP.md](docs/ROADMAP.md).

## Quickstart

```bash
# In Claude Code:
/plugin marketplace add eprouveze/video-factory
/plugin install video-factory

/video-factory:setup             # configure providers (skippable for the zero-key core)
/video-factory:new explainer     # scaffold a narration project (or: music-video, event-recap)
/video-factory:video             # author -> review -> produce -> compose
/video-factory:music-video       # song-led music-video pipeline (Phases 0 to 13)
```

For harnesses that discover portable `SKILL.md` folders directly (such as Antigravity or Codex),
load [`skills/video/SKILL.md`](skills/video/SKILL.md).

Or go straight to a zero-key render of the demo:

```bash
cd remotion && npm install
echo '{"manifest_path":"../examples/manifest.example.json","format":"16:9","out_path":"../examples/out/demo-16x9.mp4"}' \
  | node ../providers/compositor/remotion.mjs
```

## MiniMax H3 integration (default video engine)

MiniMax H3 (`MiniMax-H3` and `MiniMax-H3-Image`) is the default generative video adapter in
`providers/providers.json`, proven on full-length AI music-video productions for primary narrative
shots, audio-conditioned lip-sync, and 2K finishing. Both adapters (`providers/clip/minimax.mjs`
and `providers/image/minimax.mjs`) encode hard-won production discipline:

- **First and last frame continuity:** lock a shot to a verified start still (`ref_frame` ->
  `first_frame`) or bridge two stills with `ref_frame` + `last_frame` transitions.
- **Audio-conditioned lip-sync and identity lock:** reference mode sends `ref_images[]` (start
  still + character/outfit sheet) alongside `ref_audio[]` (lead-vocal `.wav` slice) and optional
  `ref_videos[]` motion blueprints.
- **Two-stage 768P to 2K workflow:** iterate cheaply at `768P` (`$0.08/s`), pick winning takes by
  eye, then call `/v2/video_regeneration` via `source_task_id` (or `base_video` + `brief`) to
  upgrade only accepted takes to `2K` (`$0.13/s`).
- **Reference-guided 2K stills (`MiniMax-H3-Image`):** text-to-image via `/v1/images/generations`
  and multi-reference character/set repaints via `/v1/images/edits`, with token-accurate cost
  accounting from API `usage`.
- **Pre-call validation gates (zero wasted spend):** bad requests fail locally before leaving the
  machine: unfilled `[UPPER_CASE]` prompt placeholders, mixing first/last frame with reference
  inputs, reference image aspect ratio outside `[0.4, 2.5]`, non-`.wav` reference audio, reference
  video count/size/duration limits (max 3 `.mp4`/`.mov` files, 50 MB each, 2 to 15 s each, 15 s
  total), and concrete ratios for `MiniMax-H3-Lite`.
- **Transparent cost ledger:** every clip and image call reports `cost_usd` from billed seconds or
  usage tokens, feeding `budget.cap_usd` and per-project telemetry.

## 46 Camera Movements & 5-Slot Prompt Grammar

Generative video models drift when camera motion and scene action are mixed in one sentence.
[`skills/camera-movements/`](skills/camera-movements/SKILL.md) ships 46 camera movements across
7 categories (`Pan/Tilt`, `Zoom/Lens`, `Dolly/Track`, `Physical Moves`, `Human Camera`,
`Drone/Crane`, `Specials`) using a deterministic 5-slot prompt grammar
(`Camera / Movement / Speed / Framing / End`):

```bash
node scripts/camera-move.mjs list
node scripts/camera-move.mjs get dolly-in
node scripts/camera-move.mjs build \
  --move dolly-in \
  --brief "A craftsman at a lit workbench inspecting a brass gear" \
  --ref-context "Locked medium start frame, warm tungsten key light" \
  --style "35mm anamorphic lens, shallow depth of field" \
  --no-text-guard
```

During production (`scripts/produce.mjs`), start-still image generation stays clean and static
while the 5-slot camera prompt is attached only to the video clip call (`visual.shot.move`).

## Music videos (song-led, Phases 0 to 13)

A finished song (or a song created in Phase 0) can lead instead of a voiceover: the audio master
sets total duration, and every shot tiles `[0, duration]` on the beat map.

- **Phase 0 (optional):** story, lyric form rules (`scripts/song-style-lint.mjs`), and song
  auditions before locking the master.
- **Cut list and animatic:** `scripts/beat-map.mjs` extracts tempo, beats, and downbeats;
  `scripts/music-manifest.mjs <edl.json>` validates exact shot tiling, asset paths, and sections
  into a `mode: "music"` manifest; early rough cuts preview pacing on the real audio before any
  paid generation.
- **3D blockout stills:** for shots sharing one physical set, build a simple 3D set as geometry
  authority, render each camera, and repaint with an image model before generating video
  ([docs/blockout-set-route.md](docs/blockout-set-route.md)).
- **Controlled takes and lip-sync QC:** prompts are saved before generation, take records enforce
  a max of 3 takes per shot with seed and continuity tracking (`scripts/take-record.mjs`), clip
  containers are gated (`scripts/accept-clip.mjs`), and singing shots are measured against the
  isolated lead-vocal stem (`scripts/lipsync-check.py`).
- **Build, QA, telemetry, and delivery:** resumable chunked renders (`scripts/render-chunks.sh`),
  bit-identical master audio mux (`scripts/mux-original-audio.sh`), 1-to-2-frame join detection
  (`scripts/stray_frame_check.py`), contact sheets (`scripts/contact-sheet.sh`), rough-cut review
  strips (`scripts/roughcut_review.py`, `scripts/roughcut_align.py`), YouTube private-first upload
  and timed captions (`scripts/srt_to_srv3.py`, `scripts/make_fr_captions.py`,
  `scripts/yt_auth.py`, `scripts/yt_upload.py`), and deterministic per-project telemetry
  (`scripts/telemetry.mjs`).

## What each tier needs

| Tier | Unlocks | Needs |
| --- | --- | --- |
| **Core** | code-animated scenes, multi-format render, looks (ffmpeg), `say` voice | just Node + ffmpeg |
| Voice | natural narration + word-timed captions | `ELEVENLABS_API_KEY` |
| Images | generative stills, reference-frame lock, 2K repaints, identity sheets | `OPENAI_API_KEY` (default: gpt-image-2.6-sunburst), `GEMINI_API_KEY` (`nano-banana-pro` for the 2K tier), or `MINIMAX_API_KEY` (MiniMax H3 Image) |
| Video clips (primary shots, lip-sync & b-roll) | primary narrative shots, audio-driven lip-sync, first/last-frame transitions, 2K regen, b-roll | `MINIMAX_API_KEY` (default, MiniMax H3), `GEMINI_API_KEY` (Omni), `OPENROUTER_API_KEY`, or `KLING_API_KEY` |
| Captions (precise) | word-level timestamps | `ELEVENLABS_API_KEY` (Scribe, default) or `OPENAI_API_KEY` (whisper-1) |
| Music + SFX | score + sound design | `ELEVENLABS_API_KEY` |
| Avatar | your-own-avatar talking head | planned (adapters not yet written) |
| Premium finish | DaVinci grade / HDR / upscale | Resolve Studio box (deferred) |

The manifest's `compositor` field picks the renderer (`remotion`, the default, or `hyperframes`).
`providers/compositor/hyperframes.mjs` is marked experimental in `providers/providers.json`
(HTML5 + GSAP, needs `npx hyperframes`); it lays out title cards, stills, captions, and audio and
has no code for the 12 graphic kinds, so keep Remotion for plans that rely on them.

Secrets live only in the gitignored `.video-factory/config.json` or your shell env, never in the
repo.

## Swapping a provider

Every provider is an adapter: JSON on stdin -> JSON on stdout (see
[providers/CONTRACTS.md](providers/CONTRACTS.md)). To swap any provider (for example MiniMax H3
for Omni, or ElevenLabs for another TTS), write an adapter that honors the contract and point
`providers/providers.json` (or per-scene `provider_assignments`) at it. Nothing upstream changes.

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Roadmap & deferred features](docs/ROADMAP.md) ·
  [Component contracts](providers/CONTRACTS.md)
- [Camera movements library (46 moves)](skills/camera-movements/SKILL.md) ·
  [Portable `/video` skill](skills/video/SKILL.md)
- [Geometry blockout (3D set) route for consistent stills](docs/blockout-set-route.md) ·
  [Rough-cut and render checks](docs/rough-cut-tools.md) ·
  [YouTube delivery](docs/youtube-delivery.md) ·
  [Project telemetry](docs/telemetry.md)

## Credits & license

MIT (see [LICENSE](LICENSE)). The grid, graphic-per-line, through-line, and audit rules are
adapted from the production notes published at [claudia.gallery](https://claudia.gallery/wiki/)
(Claudia is an open character by anabology). The 46-move camera taxonomy is inspired by Dan Kieft
([aicameramovements.com](https://aicameramovements.com/)). Patterns vendored with thanks from the
MIT [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) and
ideas from [OpenMontage](https://github.com/calesthio/OpenMontage) (AGPL; ideas only, no code).
Composition by [Remotion](https://remotion.dev) (separate license: free for individuals, paid
above a company threshold).
