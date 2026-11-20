#!/usr/bin/env python3
"""Find shots that last only 1 or 2 frames in a rendered film (stray frames at joins).

  stray_frame_check.py FILM.mp4 [--max-frames 2] [--threshold 12]
A frame-to-frame difference above the threshold is a cut; two cuts closer than max-frames+1 frames
mean a shot of max-frames frames or fewer. Prints one line per stray shot and exits 1 if any is found.
Run it on every render after a splice, a retime or an insert change, before showing the film.
Why: an insert entered as start + duration lands one frame short of the next insert, and a
section spliced in by time instead of by frame leaves a one-frame shot. Neither shows up in a
freeze or black-frame check.
Source-frame contract: frames are decoded in passthrough mode (no duplicate or dropped frames),
so shot length counts source frames even for variable-frame-rate input, and reported times come
from the source frame timestamps. Exit codes: 0 clean, 1 stray shot found, 2 analysis failed
(ffprobe/ffmpeg error or no frames decoded).
Needs ffmpeg and ffprobe on PATH; no Python dependencies.
"""
import argparse
import subprocess
import sys

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("film")
ap.add_argument("--max-frames", type=int, default=2)
ap.add_argument("--threshold", type=float, default=12)
a = ap.parse_args()
W, H = 32, 18
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", a.film],
    capture_output=True, text=True,
)
if probe.returncode != 0:
    print(f"ffprobe failed: {probe.stderr.strip()[:300]}", file=sys.stderr)
    sys.exit(2)
times = []
for ln in probe.stdout.split():
    try:
        times.append(float(ln.strip(",")))
    except ValueError:
        pass
p = subprocess.Popen(
    ["ffmpeg", "-v", "error", "-i", a.film, "-map", "0:v:0", "-fps_mode", "passthrough",
     "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
)
n = W * H
prev = None
i = 0
cuts = []
while True:
    buf = p.stdout.read(n)
    if len(buf) < n:
        break
    if prev is not None and sum(abs(x - y) for x, y in zip(buf, prev)) / n > a.threshold:
        cuts.append(i)
    prev = buf
    i += 1
err = p.stderr.read().decode(errors="replace").strip()
p.stdout.close()
if p.wait() != 0 or i == 0:
    print(f"analysis failed (ffmpeg exit {p.returncode}, {i} frames decoded): {err[:300]}", file=sys.stderr)
    sys.exit(2)
bad = [(c0, c1) for c0, c1 in zip(cuts, cuts[1:]) if c1 - c0 <= a.max_frames]
for c0, c1 in bad:
    t = times[c0] if c0 < len(times) else 0.0
    print(f"stray shot: frames {c0}-{c1 - 1} ({c1 - c0} frame(s)) at {int(t // 60)}:{t % 60:05.2f}")
print(f"{i} frames, {len(cuts)} cuts, {len(bad)} stray shot(s)")
sys.exit(1 if bad else 0)
