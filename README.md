# Video Factory

> Agent-driven video production that isn't slop. Claude writes a **reviewable plan**, then
> assembles every layer — voice, b-roll, music, captions, finish — from **swappable
> components**, with Remotion as the headless compositor.

Most AI video tools generate slop: flat pacing, generic b-roll, robotic delivery, static
captions. Video Factory is the **quality layer** — a manifest you approve before any spend,
semantic (not keyword) b-roll, encoded craft rules, and an adversarial quality gate.

**The zero-key core renders a real video with no API keys.** Add keys to light up voice,
b-roll, music, avatar, and a finishing pass — one tier at a time.

> ⚠️ Early (v0.1) — a working tool with rough edges, used on real projects. See
> [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works

```
brief
  → Director + Screenwriter   → manifest.json   (the plan: hook, script, art direction)
  → HUMAN REVIEW              (approve/edit BEFORE any paid API call)
  → Producer + Editor         (TTS-first timing · reference-frame lock · review vs brief)
  → Remotion compositor       → MP4 per format (16:9 / 9:16 / 1:1)
  → finish (optional)         → a "look" (cinematic / warm-doc / punchy / noir)
```

The `manifest.json` is the source of truth. If the output is wrong, you fix the manifest —
not the code. Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quickstart

```bash
# In Claude Code:
/plugin marketplace add eprouveze/video-factory
/plugin install video-factory

/video-factory:setup            # configure providers (skippable for the zero-key core)
/video-factory:new explainer    # scaffold a project from a template
/video-factory:video            # author → review → produce → compose
```

Or go straight to a zero-key render of the demo:
```bash
cd remotion && npm install
echo '{"manifest_path":"../examples/manifest.example.json","format":"16:9","out_path":"../examples/out/demo-16x9.mp4"}' \
  | node ../providers/compositor/remotion.mjs
```

## What each tier needs

| Tier | Unlocks | Needs |
| --- | --- | --- |
| **Core** | code-animated scenes, multi-format render, looks (ffmpeg), `say` voice | ✅ just Node + ffmpeg |
| Voice | natural narration + word-timed captions | `ELEVENLABS_API_KEY` |
| B-roll + images | generative clips & stills, reference-frame lock | `FAL_KEY` |
| Captions (precise) | best word timings | `DEEPGRAM_API_KEY` (or local WhisperX) |
| Music + SFX | score + sound design | `ELEVENLABS_API_KEY` |
| Avatar | your-own-avatar talking head | `HEYGEN_API_KEY`+`HEYGEN_AVATAR_ID`, or `SYNC_API_KEY` |
| Premium finish | DaVinci grade / HDR / upscale | Resolve Studio box (deferred) |

Secrets live only in the gitignored `.video-factory/config.json` or your shell env — never in
the repo.

## Swapping a provider

Every provider is an adapter: JSON on stdin → JSON on stdout (see
[providers/CONTRACTS.md](providers/CONTRACTS.md)). To swap ElevenLabs for another TTS, write an
adapter that honors the `tts` contract and point `providers/providers.json` at it. Nothing
upstream changes.

## Docs
- [Architecture](docs/ARCHITECTURE.md) · [Roadmap & deferred features](docs/ROADMAP.md) ·
  [Component contracts](providers/CONTRACTS.md)

## Credits & license

MIT (see [LICENSE](LICENSE)). Patterns vendored with thanks from the MIT
[claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) and
ideas from [OpenMontage](https://github.com/calesthio/OpenMontage) (AGPL — ideas only, no
code). Composition by [Remotion](https://remotion.dev) (separate license — free for
individuals; paid above a company threshold).
