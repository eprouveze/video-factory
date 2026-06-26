---
name: manifest
description: The manifest is Video Factory's source of truth. Use when authoring, validating, or updating a project's manifest.json — its lifecycle, the schema, and the TTS-first timing rule.
allowed-tools: Read, Write, Edit, Bash
metadata:
  author: Emmanuel Prouvèze
---

# The Manifest — source of truth

One `manifest.json` per video. Every stage reads from it; if the output is wrong, **fix the
manifest, not the code**. Schema: [`schema/manifest.schema.json`](schema/manifest.schema.json).

## It is the SERIALIZATION of creative work, not a pre-creative step

The order is creative-first:

```
Director + Screenwriter  (creative: idea → hook → script → art direction)
        │  serialize into
        ▼
   manifest.json   ← tts_script + visual_brief ARE the creative outputs, written down
        │  HUMAN REVIEW (before any paid call)
        ▼
Producer + Editor  (execution)  — consume it, and UPDATE it in place
```

So the manifest is the spine of **execution**. Don't think "write JSON first" — think
"the approved screenplay + shot list, in a machine-readable file."

## It is LIVING

The manifest is enriched as the pipeline runs:
- After TTS, the **measured** `duration_ms` replaces `duration_estimate_s` (timing truth).
- As assets are produced, their paths land in `visual.asset`.
- `project.json` (the reconciliation ledger) tracks planned-vs-produced per scene so a crash
  resumes instead of restarting.

## TTS-first timing (non-negotiable)

Audio is the temporal spine. Generate narration first, measure it with `ffprobe`, and time
visuals to the **real** audio duration — never estimate. This is what prevents A/V drift.

## Authoring checklist
- `intent` set; `hook` works muted; `format` chosen.
- Every scene: exact `tts_script`, a **semantic** `visual_brief` (not a keyword), a `shot`.
- `brand` locked (palette/font/tone/LUT) so scenes don't drift.
- Validate against the schema before the human gate.
