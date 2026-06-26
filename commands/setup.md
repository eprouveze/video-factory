---
description: Configure Video Factory — detect installed tools, collect provider API keys, validate them, and write the provider registry. Idempotent; re-run to add or swap providers.
argument-hint: "[capability]   (optional — configure just one, e.g. tts)"
allowed-tools: Bash, Read, Write, Edit
---

# /video-factory:setup

Interactive, **idempotent** configuration. Goal: get from "nothing" to "the zero-key core
renders", then light up each paid tier the user wants — and **never write a secret into the
repo**.

## Rules
- Secrets go ONLY in `.video-factory/config.json` (gitignored) or the user's shell env.
  Never in `providers.json`, the manifest, or any tracked file.
- Confirm before writing any key. Echo back only the last 4 chars when reporting.
- Re-running must not clobber existing config — read it first, merge, ask only about gaps.

## Steps

1. **Probe the core.** Check `node --version` and that `remotion/` deps install. Report the
   zero-key core as ✅ ready or list what's missing (Node ≥ 18).

2. **Read current state.** Load `.video-factory/config.json` if present and `providers.json`.
   Build a table of each capability → chosen adapter → configured? (✅/❌).

3. **Offer tiers** (skip any the user declines):
   | Tier | Unlocks | Needs |
   |---|---|---|
   | Voice | natural narration + word-timed captions | `ELEVENLABS_API_KEY` |
   | B-roll + images | generative clips & stills | `FAL_KEY` |
   | Captions (precise) | best word timings | `DEEPGRAM_API_KEY` (or local WhisperX) |
   | Music + SFX | score + sound design | `ELEVENLABS_API_KEY` (shared) |
   | Avatar | your-own-avatar talking head | `HEYGEN_API_KEY`+`HEYGEN_AVATAR_ID`, or `SYNC_API_KEY` |

   If `$ARGUMENTS` names a capability, configure only that one.

4. **Collect + validate each key the user provides.** Write to `.video-factory/config.json`,
   then **ping** to confirm it works before claiming success:
   - ElevenLabs: `GET https://api.elevenlabs.io/v1/user`
   - fal.ai: a cheap whoami / model list call
   - HeyGen: list avatars; confirm `HEYGEN_AVATAR_ID` exists
   - Deepgram: `GET https://api.deepgram.com/v1/projects`
   Report ✅/❌ per provider with the failure reason if any.

5. **Set defaults.** For each working tier, set the `default` adapter in `providers.json`
   (e.g. tts→elevenlabs). Leave declined tiers on their core/`null` adapter.

6. **Summarize.** Print the final capability table and the one command to try next:
   `/video-factory:new explainer` → `/video-factory:video`.

Create `.video-factory/` and ensure it is in `.gitignore` (it already is) before writing.
