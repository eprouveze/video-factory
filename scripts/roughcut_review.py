#!/usr/bin/env python3
"""Review material for one take of a rough cut: a 5-frame strip per clip, a duration check, and the
lip-sync figure for singing cuts.

  roughcut_review.py --dir PROJECT_DIR --tag t01 [--only S001,S004] [--face-model face_landmarker.task]
                     [--clip-pattern "{cut}/{tag}.mp4"]

PROJECT_DIR holds manifest.json: a list of {cut, mode, dur, ref_audio?}, mode one of lip, ref, first,
pair (other modes are skipped). ref_audio is the slice of the lead-vocal stem the clip sings, relative
to PROJECT_DIR. Writes PROJECT_DIR/review/<cut>-<tag>.jpg and review/<tag>.jsonl (one line per clip,
appended as each finishes, so a crash keeps finished work; finished cuts are skipped on a re-run).
Needs ffmpeg/ffprobe on PATH; lip-sync uses scripts/lipsync-check.py (see its header for dependencies).
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--dir", required=True)
ap.add_argument("--tag", default="t01")
ap.add_argument("--only", help="comma-separated cut ids")
ap.add_argument("--face-model", default=os.environ.get("FACE_MODEL"), help="face_landmarker.task (or env FACE_MODEL)")
ap.add_argument("--clip-pattern", default="{cut}/{tag}.mp4", help="clip path under --dir")
a = ap.parse_args()

OUT = a.dir
os.makedirs(os.path.join(OUT, "review"), exist_ok=True)
jl = os.path.join(OUT, "review", a.tag + ".jsonl")
done = {json.loads(l)["cut"] for l in open(jl)} if os.path.exists(jl) else set()
for it in json.load(open(os.path.join(OUT, "manifest.json"))):
    if it["mode"] not in ("lip", "ref", "first", "pair") or it["cut"] in done:
        continue
    if a.only and it["cut"] not in a.only.split(","):
        continue
    clip = os.path.join(OUT, a.clip_pattern.format(cut=it["cut"], tag=a.tag))
    if not os.path.exists(clip):
        continue
    d = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip],
        capture_output=True, text=True).stdout or 0)
    strip = os.path.join(OUT, "review", f"{it['cut']}-{a.tag}.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", clip, "-vf",
                    f"fps=5/{max(d, 0.1):.3f},scale=384:-2,tile=5x1", "-frames:v", "1", strip])
    rec = {"cut": it["cut"], "tag": a.tag, "mode": it["mode"], "cut_dur": it["dur"],
           "clip_dur": round(d, 2), "long_enough": d >= it["dur"]}
    if it["mode"] == "lip":
        cmd = [sys.executable, os.path.join(HERE, "lipsync-check.py"), clip, os.path.join(OUT, it["ref_audio"])]
        if a.face_model:
            cmd += ["--model", a.face_model]
        r = subprocess.run(cmd, capture_output=True, text=True)
        try:
            rec["lipsync"] = json.loads(r.stdout.strip().split("\n")[-1])
        except Exception:
            rec["lipsync"] = {"corr": None, "note": "check failed: " + r.stderr[-200:]}
    open(jl, "a").write(json.dumps(rec) + "\n")
    print(rec, flush=True)
