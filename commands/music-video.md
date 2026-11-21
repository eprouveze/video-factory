---
description: Make a song-led music video end-to-end — write and audition the song if there is none, lock it, measure it, cut to it, animatic on the real audio, then takes, lip-sync, B-roll, overlays, build, QA, subtitles. Human gates before every paid call.
argument-hint: "[project-dir]   (scaffold one first with /video-factory:new music-video)"
allowed-tools: Bash, Read, Write, Edit, Task
---

# /video-factory:music-video

Drive a song-led film: the master audio sets the duration and every shot is cut to it
(`mode: "music"`, see `skills/manifest/SKILL.md`). The order is deliberate: **everything
free (song, timings, cut list, animatic) comes first, and each paid call sits behind a
human gate.** A gate is a question put to the person who owns the project; silence is never
approval, a candidate is never called approved, and you never approve on their behalf.
Quote their words in the notes instead of paraphrasing them into a decision.

Project layout used below (`$P` = the project dir): `song/` lyrics, style strings and
audition records, `audio/` master + stems, `timing/`
words, lines, beats, `refs/` start stills, `prompts/` one text file per take, `takes/`
records + clips, `output/` films and sheets, `manifest.json`.

## Phase 0 — Story, lyrics and song auditions  (only when no song exists yet)
Skip to Phase 1 if a finished song is handed to you. Otherwise the song and the film are
invented together here, before anything is measured: a verse is decided with the picture it
calls for, and a picture may ask for a line, a riff or a silence. The song still has to work
with no picture at all.
- **Story.** One sentence that someone outside the subject understands. The song carries one
  emotional journey; extra layers go to the picture. Put questions to the owner one at a time
  and keep their answers word for word, with the date, in the project's decision record.
- **GATE 0 (story):** write the story as a short treatment (who wants what, what goes wrong,
  what it costs, how it ends, and what the picture shows that the song does not say) and work
  it out with the owner. No lyric is drafted before the owner has approved the story.
- **GATE 0r (independent review of the approved story):** before any lyric, have several
  models from different families review the approved treatment: story strength (score and the
  biggest fix), fit to a song, fit to video (shot count, what is over-stuffed, the must-have
  shots), hook quality with alternatives, what the viewer learns, alternative ideas, anything
  else. Show the synthesis to the owner. The owner decides which changes to take; re-approve
  the treatment if it changed. Only then draft lyrics.
- **Lyrics.** Draft by section (`$P/song/lyrics-v01.txt`, a new file per version). The owner
  approves section by section. A draft is a candidate until they say so.
- **Style strings.** One text file per style in `$P/song/styles/`. Put what decides the result
  (voice type first) in the opening words: a generator cuts what exceeds its limit, and a lost
  word can change the singer. Check every file before a run:
  `node scripts/song-style-lint.mjs $P/song/styles/*.txt --max 1000 --must-lead "<voice term>"`.
  A reference track is inspiration: describe it by measured tempo and instrumentation, never
  by artist or title, and do not copy its key and tempo together.
- **Audition plan.** Fewest runs that answer the question: all styles with one voice, then the
  voices on the style that won. Show the number of runs and their cost.
- **GATE 0a (per run):** the owner approves each generation run. Read the balance first.
- **Record every take** as one line in `$P/song/auditions.jsonl`: lyrics file, style file,
  generator and served model, take id, cost, and the owner's verdict in their words. Keep the
  raw download untouched (some formats carry a line-timing track that a re-encode destroys).
- **Check before the owner listens:** duration, every section present once (generators repeat
  a bridge or a chorus), words per minute against the plan, the voice that was asked for.
- **GATE 0b:** the owner picks the song by ear. A favourite is not a master. Cuts and inserts
  are new files made from the pick; the result goes to Phase 1.

## Phase 1 — Song and master audio locked  (free)
1. Confirm the song is chosen and the master is final. The master is never edited after this
   point: later mixes are new files.
2. `ffprobe` it; note the duration. If a candidate mix exists, deliver two films at the end
   (one per audio), never silently swap.
- **GATE 1:** the owner confirms the master. Nothing below starts without it.

## Phase 2 — Stems, word timings, beat map  (free)
3. Export or obtain stems, at least the **lead-vocal stem**. Keep them next to the master.
4. Word timings: measure on the lead-vocal stem (`scripts/extract-voice.mjs` forced-aligns a
   quote, or any aligner that writes `[{word,start_ms,end_ms}]` to `$P/timing/words.json`).
   A cue without a measured time is not a cue: do not time lines from guessed offsets.
5. Beat map: `node scripts/beat-map.mjs $P/audio/master.wav --out $P/timing/beats.json`.
   If it reports `reliable: false` there is no pulse; cut on the vocal phrasing instead and
   say so.
- **GATE 2:** the owner sees the section list, the tempo and the line times.

## Phase 3 — Cut list  (free)
6. Write `$P/edl.json`: one row per shot (`shot_id` like `S012`, `in_ms`, `out_ms`, picture,
   `lyrics_line`, `requires_lipsync`, a start-still path or a placeholder, the overlay action,
   the sync source). Shots must tile `[0, master duration]` exactly, with variety of angle and
   size, and cuts on beats from the beat map. Check the total length against the master first.
- **GATE 3:** the owner approves the cut list.

## Phase 4 — Animatic on the real audio  (free)
7. Build: `node scripts/music-manifest.mjs $P/edl.json --out $P/manifest.json --beats $P/timing/beats.json`.
   Missing pictures are placeholders (`tech_test_placeholder: true`), each labelled on screen
   as PLACEHOLDER, STAND-IN, CANDIDATE or APPROVED.
8. Audit: `node scripts/validate-manifest.mjs $P`. Render:
   `node scripts/render-manifest.mjs $P --out $P/output/animatic.mp4`, then QA it as in Phase 11.
   The animatic exposes the shots that return again and again, and builds the missing-asset queue.
- **GATE 4:** the owner has watched the animatic.

## Phase 5 — Start stills  (paid if generated; one gate per batch)
9. One start still per shot, plus a guide still per recurring character or object state, so
   identity survives. Stills are references for clips, not shots. Write one prompt file per
   still, generate each in a clean session, and keep `refs/` names tied to shot ids.
   - Character sheet: for every recurring character, one sheet that shows them from several
     angles, plus one sheet per outfit. Later shots are checked against the sheet, not
     against the previous clip.
   - Sheets and guide stills use a plain background: a model carries whatever stands behind
     the character into the new scene.
   - Continuity list: one line per shot saying what each character wears and holds. A change
     inside a scene (a coat put on, an object picked up) is carried into every later shot of
     that scene. The line goes into the take record (`--continuity`).
   - Geometry blockout: when several shots share one set, or a shot depends on where an element
     stands, build the set in 3D, render each shot's camera and have the image model repaint the
     render. The 3D set is the geometry authority (positions and sizes); the image model only
     paints the look. Verify the repainted stills on a contact sheet against the renders before any
     paid clip. See `docs/blockout-set-route.md`.
   - Eye and face details: plan small details (an ember in a pupil, an iris pattern) on close-ups
     only. At medium-shot size the video model does not carry them, even with a close-up as an
     extra reference.
   - Upscaling: never run a face-restoring or automatic upscaler on designed faces. It repaints
     irises and features (a CLI mode with face recovery on does this by default). Use a
     non-generative upscale (for example Lanczos resampling in ffmpeg), or regenerate at the higher
     resolution.
- **GATE 5:** the owner accepts each still as a reference. Reject, do not patch, stills that
  carry collage, dashboards or stray elements.

## Phase 6 — Takes  (paid)
10. Estimate first: take count x shots x seconds x price of the chosen model. Show it.
- **GATE 6:** the owner approves the spend and the model. Read the provider balance before a batch.
11. Per take, in this order, with the adapters in `providers/clip/` (`openrouter.mjs`,
    `minimax.mjs`, ...):
    1. Save the prompt to `$P/prompts/<shot>-t<NN>.txt` BEFORE generating. End it with
       "No text, no captions, no interface, no logos."
       Do not name what must not appear: one word (a job, a place) can add its uniform,
       emblem or prop even when a reference image is given.
    2. Cheapest resolution first (for example 768p); a higher resolution only for shots judged usable.
    3. Mode: lip-sync = reference mode (start still + identity guide + the lead-vocal slice);
       silent = first frame; transition = first + last frame. Reference mode cannot be mixed
       with first/last frame.
    4. Record the take: `node scripts/take-record.mjs write --dir $P/takes --shot S012 --model <served id> --resolution 768p --duration 5 --prompt-file $P/prompts/S012-t01.txt --ref $P/refs/S012.png --cost 0.40 --result $P/takes/S012/t01.mp4 --seed 7 --continuity "grey coat on, cup in left hand"`.
       Pass a seed where the adapter accepts one, record it, and keep it fixed while only the
       prompt changes, so that a different result comes from the prompt and not from chance.
       It refuses a missing prompt file, a take number that already has a record, and a 4th
       take of a shot.
    5. The `minimax.mjs` adapter refuses, before the API call, a reference image whose width/height
       is outside [0.4, 2.5] (a wide eye crop at 2.61 fails the whole task), reference audio that is
       not `.wav`, and a first frame mixed with reference inputs.
    6. Gate the file: `node scripts/accept-clip.mjs` (container, aspect, duration).
    7. Set the verdict: `node scripts/take-record.mjs set --dir $P/takes --shot S012 --take 1 --verdict usable|redo|missing`.
12. **At most 3 takes per shot.** A 4th needs the owner's go for that shot (`--allow-extra`);
    a failed shot keeps its start still and the verdict `redo` or `missing`.
- **GATE 7 (per shot or batch):** the owner picks the takes by eye.

## Phase 7 — Lip-sync measured  (free)
13. For each singing shot, cut the slice of the **lead-vocal stem** that the clip sings (not
    the full mix, whose instruments inflate the figure):
    `ffmpeg -ss <start> -t <len> -i $P/audio/lead-vocal.wav $P/takes/S012/slice.wav`, then
    `python3 scripts/lipsync-check.py $P/takes/S012/t01.mp4 $P/takes/S012/slice.wav --model face_landmarker.task`
    (Python dependencies are listed in the script header). Report the correlation at the best
    lag and the lag. Store it: `take-record.mjs set ... --corr <x> --lag <s>`.
14. The number is a reporting line, not a ratified threshold, and never replaces the owner's
    eye: a staccato mouth can correlate well.

## Phase 8 — B-roll on the beat grid  (paid like Phase 6)
15. Insert B-roll over long face shots, with in/out on beats from `timing/beats.json`
    (`scripts/snap-grid.mjs` shows how the grid is read). Fit generated motion to the grid
    by frame-difference energy, not by eye. The B-roll must be consistent with what the
    music is doing at that moment (no instrument that is not playing).

## Phase 9 — Overlays  (free)
16. Overlays are code in Remotion, never part of a generated clip.
    - No generated text or interface inside clips; prompts say so, and the QA sheet is checked for it.
    - No overlay text behind faces or heads.
    - Keep the subtitle zone (centre-bottom) clear of any text animation.
    - Every element keeps its measured frame; check for a delay applied twice when restyling.

## Phase 10 — Build  (free, resumable)
17. Rebuild the manifest with the accepted clips, then audit again:
    `node scripts/music-manifest.mjs $P/edl.json --out $P/manifest.json` and
    `node scripts/validate-manifest.mjs $P`.
18. Render in resumable chunks (finished chunks are kept after a crash):
    `bash scripts/render-chunks.sh <remotion-project> <composition-id> <total-frames> --out out/render.mp4`
    (total frames = master seconds x fps). Single-pass alternative: `scripts/render-manifest.mjs`.
19. Put the master back, bit for bit, and check the duration:
    `bash scripts/mux-original-audio.sh <render.mp4> $P/audio/master.wav $P/output/film.mp4`.
    It prints the audio packet MD5 of master and result and exits non-zero if they differ or
    if the film is more than 0.5 s off the master duration.

## Phase 11 — QA  (free)
20. Cues: every overlay cue lands within one frame of its measured source time.
21. `node scripts/review-video.mjs $P/output/film.mp4 --manifest $P/manifest.json` (freeze
    check and duration fidelity). Also run the raw detectors and read the timestamps:
    `ffmpeg -i film.mp4 -vf freezedetect=n=-60dB:d=0.22 -an -f null -` and
    `ffmpeg -i film.mp4 -vf blackdetect=d=0.1:pix_th=0.05 -an -f null -`.
    Then `python3 scripts/stray_frame_check.py film.mp4`: it finds 1 or 2 frame shots at joins, which
    the freeze and black checks miss (see `docs/rough-cut-tools.md`).
    Expect freezes only where a still is held on purpose (and a freeze at the very end of a
    clip means it ran out: re-time it).
22. Contact sheet: `bash scripts/contact-sheet.sh $P/manifest.json $P/output/film.mp4 --out $P/output/sheet.jpg`;
    look at it. Per-shot table: `node scripts/shot-table.mjs --dir $P/takes --manifest $P/manifest.json --out $P/output/shot-table.md`.
23. Continuity: `node scripts/take-record.mjs list --dir $P/takes`, read the `continuity`
    line of each chosen take in film order, and compare with the contact sheet. Every change
    of clothing or object must be explained by the shot before it.
- **GATE 8:** the owner watches the film and the table. Each note they give is recorded
  verbatim and numbered, and answered DONE / PARTIAL / OPEN in the next report.

## Phase 12 — Subtitles  (free)
24. `node scripts/srt-from-words.mjs $P/timing/words.json $P/timing/lines.txt --out $P/output/subtitles`
    writes `subtitles.srt` and `subtitles.vtt`, with line starts and ends from the measured
    words. Keep lines to 42 characters; add sound descriptions for instrumental passages by hand.

## Phase 13 — Delivery
25. For YouTube: private upload first, captions as timed text, credentials from the environment
    (`docs/youtube-delivery.md`). Deliver the film, the clips, the sheets, the shot table and the subtitle files. Keep
    video out of git. Write the report: audio MD5, duration check, QA results, total recorded
    spend (the sum of take costs), and the list of what is still a candidate.

Throughout: when credit runs out, stop, ask once, then do the free work (timing, overlays,
B-roll placement) and list what waits on credit.
