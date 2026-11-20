# Rough-cut and render checks

Small scripts that sit next to the freezedetect and blackdetect checks in
`commands/music-video.md` (Phase 11). All take paths as arguments.

| Script | Purpose | Dependencies |
|---|---|---|
| `scripts/stray_frame_check.py` | Finds shots of 1 or 2 frames in a rendered film. Exit 1 if any. | ffmpeg, ffprobe |
| `scripts/roughcut_review.py` | 5-frame strip per clip, duration check, lip-sync figure for singing cuts. | ffmpeg; lipsync deps for `lip` cuts |
| `scripts/roughcut_align.py` | Chooses a start offset per silent clip so motion lines up with the music onsets. | numpy, scipy, opencv-python |

## stray_frame_check.py

```
python3 scripts/stray_frame_check.py film.mp4 [--max-frames 2] [--threshold 12]
```

A freeze or black check does not see a one-frame shot. Typical causes: an insert entered as
start + duration, landing one frame short of the next insert; a section spliced in by time instead of
by frame. Run it on every render after a splice, retime or insert change, before showing the film.

## roughcut_review.py and roughcut_align.py

Both read a project directory with:

- `manifest.json`: a list of `{cut, start, end, mode, dur, ref_audio?}` (seconds). `mode` is `lip`
  (singing, reference mode), `ref` (face, no vocal, reference mode), `first` (first frame) or `pair`
  (first and last frame).
- `selection.json` (align only): `{cut: {verdict, mode, take}}`.
- Clips at `--clip-pattern` (default `{cut}/{tag}.mp4` for review, `{cut}/{take}.mp4` for align).

```
python3 scripts/roughcut_review.py --dir $P/rough --tag t01 --face-model face_landmarker.task
python3 scripts/roughcut_align.py $P/audio/master.wav --dir $P/rough
```

`roughcut_review.py` appends one JSON line per clip to `review/<tag>.jsonl` as it goes, so a crash
keeps finished work. `roughcut_align.py` keeps an offset only if it beats offset 0 by 0.05 in
correlation, never touches lip-synced clips, and writes `offset`, `align_corr`, `align_corr0` back
into `selection.json`. The lip-sync figure is the existing `scripts/lipsync-check.py`; the numbers are
reporting lines, not thresholds, and never replace watching the clip.

The per-cut table is already covered by `scripts/shot-table.mjs`, and shot planning is
project-specific, so neither is duplicated here.
