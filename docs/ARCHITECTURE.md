# Architecture

Video Factory is an **agent-driven** video pipeline. Claude (via the plugin's commands and
role-agents) authors a human-reviewable plan, then assembles the video from swappable
provider components, with **Remotion** as the headless compositor.

## Design principles

1. **Manifest-as-spine.** One `manifest.json` is the source of truth for a video. Every stage
   reads from it. If output is wrong, fix the manifest, not the code.
2. **Creative first, then serialize.** The Director/Screenwriter do the creative work; the
   manifest is the *crystallization* of it (`tts_script` + `visual_brief` ARE creative
   outputs). It is not authored before creativity — it's the approved screenplay + shot list.
3. **TTS-first temporal spine.** Narration audio is generated first and measured; visuals are
   timed to the *real* audio duration, never estimated. This is what prevents A/V drift.
4. **Human gate before spend.** The manifest is surfaced for approval *before any paid API
   call*. Reversible, trustworthy, and cheap to iterate.
5. **Atomic, swappable primitives.** Tools enable capability; they don't encode decisions.
   Each provider is an adapter behind a fixed contract; the agent chooses providers per scene.
6. **Resumable.** `project.json` reconciles planned-vs-produced per scene, so a crash resumes
   instead of restarting.

## Repository layout

```
.claude-plugin/    plugin.json + marketplace.json
commands/          /video-factory:{setup,new,video,scene-review,render}
agents/            director, screenwriter, producer, editor (named roles)
skills/            manifest (+ schema), quality-rules, remotion-compose
providers/         providers.json (registry) + CONTRACTS.md + adapters/
templates/         project presets (explainer, reel, ...)
remotion/          the zero-key compositor (renders a manifest → MP4)
examples/          a runnable demo manifest
docs/              this file, ROADMAP.md, BUSINESS.md
projects/          per-video working dirs (created by :new; gitignored assets)
```

## The manifest

Schema: `skills/manifest/schema/manifest.schema.json`. Lifecycle:

```
Director + Screenwriter (creative)
  → manifest.json  → HUMAN REVIEW (before paid calls)
  → Producer + Editor (execution; update manifest + project.json in place)
  → compositor → finish
```

The manifest is **living**: measured `duration_ms` replaces estimates after TTS; produced
asset paths land in each scene; `project.json` tracks state.

## Adapter protocol (the swappability contract)

Every provider is a standalone executable: **JSON on stdin → JSON on stdout**, secrets from
env / gitignored config, exit 0/non-0. Full per-capability contracts in
`providers/CONTRACTS.md`. The orchestrator never calls a vendor directly — only the adapter
registered in `providers.json` for a capability. Swap a provider = new adapter + registry
change (or `/video-factory:setup`).

Capabilities: `tts · stt · image · clip · music · sfx · avatar · reframe · compositor · finish`.

## Pipeline phases

- **A — Creative (free):** director + screenwriter author the manifest; validate vs schema.
- **B — Human gate:** show storyboard + cost estimate; approve/edit. No paid call before this.
- **C — Production (paid, resumable):** per scene — TTS → ffprobe gate → reference-frame lock
  (for clips) → visual gen → **editor review vs `visual_brief`** (regenerate on fail) →
  captions (STT if needed) → music/sfx. Update `project.json` after each scene.
- **D — Compose:** Remotion renders one MP4 per `format` (16:9/9:16/1:1), native resolution.
- **E — Finish (optional):** apply a "look" via the `finish` capability (see below).

## The finishing tier (DaVinci question, answered)

"Looks" split into two adapters:
- **`ffmpeg-lut` (core, default):** pre-arranged looks — `cinematic`, `warm-doc`,
  `punchy-social`, `noir` — as ffmpeg filter chains / `.cube` LUTs. **Headless, no DaVinci,
  no license.** Covers ~80% of "make it look graded." Fully automatable anywhere.
- **`davinci` (premium, deferred — see ROADMAP):** for the operations only Resolve does —
  Super Scale (AI upscale), Magic Mask relight, noise reduction, HDR delivery. Scripts the
  Resolve API to apply a saved PowerGrade preset per look to **one clean ProRes master** on a
  dedicated Studio box (display/dummy-plug). **Semi-automated, NOT headless/cloud**, run under
  a watchdog — the modal-dialog hang risk is small here because the input is one clean master,
  not flaky AI media, but it is non-zero. This is why DaVinci is OUT of the autonomous loop and
  IN only as a premium finishing lane.

## Zero-key core (render path)

Scenes with `visual.source: "code"` render Remotion components (`TitleCard`, `StatCard`, …)
with no assets and no keys. A scene with no produced asset degrades to a title-card fallback
and warns — the core always produces something watchable before any paid tier is wired.
Asset-based scenes are staged into `remotion/public/` by the compositor adapter so
`staticFile()` resolves them.

## Secrets & safety

Secrets live only in the gitignored `.video-factory/config.json` or shell env — never in
`providers.json`, the manifest, or any tracked file. Adapters read keys from env; never accept
them as CLI args or in request JSON (would leak into logs/manifests). `:setup` validates each
key with a cheap ping before claiming a tier is ready.

## Dependency posture (maintainability)

Runtime depends only on **industrial-strength primitives**: Remotion (company-backed render
engine), ffmpeg, and the provider HTTP APIs. We **vendor patterns** (not runtime deps) from
MIT prior art. The volatile surface — provider churn (e.g. Sora API sunset) — is isolated
behind the adapter contracts, so a provider change is a one-file swap, on our timeline. This
keeps the maintenance surface small, owned, and bounded.

## Known limitations (v0.1)

- Asset-scene rendering stages files into `remotion/public/`; very large projects should move
  to an R2/HTTPS asset host (planned).
- No semantic b-roll *retrieval* yet (the embedding library) — `visual_brief` drives
  generation + review, not vector search over a clip library (Phase 0.4).
- `davinci` finishing adapter is a stub (Phase 0.5).
- Remotion's license requires a paid company seat above a revenue/headcount threshold — note
  it if you deploy commercially.
