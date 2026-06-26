# Component Contracts

Every provider is an **adapter**: a standalone executable (any language) that does one job.
The orchestrator never talks to a vendor API directly — it invokes the adapter registered
for a capability in `providers.json`. Swap a provider by writing a new adapter that honors
the same contract and pointing the registry at it. Nothing upstream changes.

## The adapter protocol (universal)

- **Input:** one JSON object on **stdin**.
- **Output:** one JSON object on **stdout** (and only that — logs go to **stderr**).
- **Exit code:** `0` on success, non-zero on failure (with a human reason on stderr).
- **Secrets:** read from environment / the gitignored `.video-factory/config.json`.
  **Never** accept a key as a CLI arg or in the JSON (it would leak into logs/manifests).
- **Idempotent on `out_path`:** if the requested output already exists and is valid, an
  adapter may return it without re-billing (the orchestrator relies on this for resume).
- **Determinism aid:** when a request includes a `seed`, pass it through if the vendor supports it.

All paths are absolute or relative to the **project dir** (the folder created by `:new`).

---

## Contracts by capability

### `tts` — text → narration audio (+ word timings)
```jsonc
// in
{ "text": "...", "voice": "river", "tone": "calm authoritative",
  "prev_text": "...", "next_text": "...",   // for natural scene-join delivery
  "out_path": "audio/s1.mp3" }
// out
{ "audio_path": "audio/s1.mp3", "duration_ms": 8120,
  "word_timings": [ { "word": "Most", "start_ms": 0, "end_ms": 180 }, ... ] }  // [] if unsupported
```
`word_timings` is what powers animated captions. An adapter that can't produce them returns
`[]`; the `stt` capability is then used to recover timings from the audio.

### `stt` — audio → word-level timings
```jsonc
{ "audio_path": "audio/s1.mp3" }
// out
{ "word_timings": [ { "word": "Most", "start_ms": 0, "end_ms": 180 }, ... ] }
```

### `image` — brief → still
```jsonc
{ "brief": "neurons firing across a dark synaptic gap, cinematic, shallow depth of field",
  "aspect": "16:9", "refs": ["clips/s2-frame.png"], "seed": 42, "out_path": "assets/s3.png" }
// out
{ "image_path": "assets/s3.png" }
```

### `clip` — brief → generative video
```jsonc
{ "brief": "...", "aspect": "9:16", "duration_s": 8,
  "ref_frame": "assets/s3.png",   // reference-frame lock for continuity
  "seed": 42, "out_path": "clips/s3.mp4" }
// out
{ "clip_path": "clips/s3.mp4", "duration_ms": 8000 }
```

### `music` — brief → track
```jsonc
{ "brief": "warm lo-fi piano, building", "duration_ms": 45000, "out_path": "audio/music-ch1.mp3" }
// out
{ "audio_path": "audio/music-ch1.mp3", "duration_ms": 45000 }
```

### `sfx` — brief → one-shot
```jsonc
{ "brief": "soft whoosh on cut", "out_path": "audio/sfx-s2.mp3" }
// out
{ "audio_path": "audio/sfx-s2.mp3" }
```

### `avatar` — audio (+ likeness) → talking-head clip
```jsonc
{ "audio_path": "audio/s1.mp3", "likeness_id": "emmanuel-2026",
  "aspect": "9:16", "out_path": "clips/s1-avatar.mp4" }
// out
{ "clip_path": "clips/s1-avatar.mp4", "duration_ms": 8120 }
```

### `reframe` — clip + target aspect → reframed clip
```jsonc
{ "clip_path": "clips/s3.mp4", "target_aspect": "9:16", "out_path": "clips/s3-9x16.mp4" }
// out
{ "clip_path": "clips/s3-9x16.mp4" }
```

### `compositor` — manifest + format → final video
```jsonc
{ "manifest_path": "manifest.json", "format": "16:9", "out_path": "output/video-16x9.mp4" }
// out
{ "video_path": "output/video-16x9.mp4", "duration_ms": 52000 }
```

---

## Writing a new adapter (e.g. swap ElevenLabs → Piper TTS)

1. Create `providers/tts/piper.sh` (or `.mjs`, `.py` — any executable).
2. Read the `tts` request JSON from stdin; write the `tts` response JSON to stdout.
3. Register it in `providers.json` under `capabilities.tts.adapters.piper`, with its `tier`
   and `needs`.
4. `/video-factory:setup` will offer it; set it as `default` (or per-scene via the manifest's
   `provider_assignments.tts`).

That's the entire handover. Adapters are independently testable:
```bash
echo '{"text":"hello world","voice":"river","out_path":"/tmp/t.mp3"}' | providers/tts/piper.sh
```
