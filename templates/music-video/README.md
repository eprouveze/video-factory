# music-video template

Starting point for a song-led film: the master audio sets the duration and shots tile it
exactly. The manifest has `mode: "music"` and four placeholder shots (an intro, a lip-sync
shot, a B-roll insert and an outro) on a 16 s placeholder master.

1. `/video-factory:new music-video <name>` copies this folder to `projects/<name>/`.
2. Put the locked master at `audio/master.wav` (or change `audio_master_path`), and measure
   it: `scripts/beat-map.mjs`. Replace the shots with your cut list, one scene per shot, so
   that `in_ms`/`out_ms` tile `[0, audio_master_duration_ms]` with no gap.
3. Run `/video-factory:music-video` for the phases, the human gates and the scripts.

Placeholder shots are marked `tech_test_placeholder: true`: the audit accepts them with a
warning so you can render an animatic on the real audio, and they must all be replaced by
a start still or a clip before delivery. Shot ids (`S001`...) key the take records, the
contact sheet and the per-shot table.
