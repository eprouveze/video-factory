#!/usr/bin/env python3
"""Put the action of silent clips on the music: choose, per clip, the start offset (inside the clip's
spare length) that best lines up motion energy with the onsets of the master audio for that cut.

  roughcut_align.py MASTER.wav --dir PROJECT_DIR [--clip-pattern "{cut}/{take}.mp4"] [--max-offset 2.0]

PROJECT_DIR holds manifest.json (list of {cut, start, end} in seconds) and selection.json
({cut: {verdict, mode, take}}). Only clips with verdict "usable" and mode "first" or "ref" are
touched (lip-synced and first+last-frame clips keep offset 0). Writes `offset` (seconds),
`align_corr` and `align_corr0` into selection.json and prints one line per cut.
Motion = mean absolute frame difference at 160 px; onsets = positive spectral flux of the audio,
both at 24 Hz. An offset is kept only when it beats offset 0 by 0.05 in correlation; otherwise 0.
Cuts shorter than 13 samples (about 0.54 s) are skipped with a warning. Motion is resampled to 24 Hz
from the clip's own frame rate, so offsets are in seconds for any source fps. An undefined correlation
(a clip with no motion) is stored as null and keeps offset 0.
Python dependencies: numpy, scipy, opencv-python.
"""
import argparse
import json
import os
import sys

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("wav", help="mono or stereo wav of the master, any rate")
ap.add_argument("--dir", required=True, help="project dir with manifest.json and selection.json")
ap.add_argument("--clip-pattern", default="{cut}/{take}.mp4", help="clip path under --dir")
ap.add_argument("--max-offset", type=float, default=2.0)
a = ap.parse_args()

import numpy as np  # noqa: E402  (after argparse so --help works without dependencies)
import cv2  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.signal import stft  # noqa: E402

OUT = a.dir
man = {i["cut"]: i for i in json.load(open(os.path.join(OUT, "manifest.json")))}
sp = os.path.join(OUT, "selection.json")
sel = json.load(open(sp))
sr, y = wavfile.read(a.wav)
y = y.astype(np.float64)
y = y.mean(axis=1) if y.ndim > 1 else y
FPS = 24.0
MIN_SAMPLES = 13  # the smoother needs a window at least as long as its 13-sample kernel
hop = int(round(sr / FPS))
_, _, Z = stft(y, fs=sr, nperseg=hop * 2, noverlap=hop, boundary=None, padded=False)
M = np.log1p(np.abs(Z))
flux = np.maximum(0, np.diff(M, axis=1)).sum(axis=0)
flux = np.concatenate([[0], flux])


def motion(path):
    """Mean frame difference, resampled to the 24 Hz audio grid from the clip's own frame rate."""
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or FPS
    prev = None
    m = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(f, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        m.append(0.0 if prev is None else float(np.mean(np.abs(g - prev))))
        prev = g
    m = np.array(m)
    if len(m) == 0 or abs(src_fps - FPS) < 1e-3:
        return m
    t = np.arange(int(len(m) / src_fps * FPS)) / FPS
    return m[np.minimum(np.round(t * src_fps).astype(int), len(m) - 1)]


def z(x):
    # remove slow drift, keep accents; callers guarantee len(x) >= MIN_SAMPLES (the kernel length)
    x = x - np.convolve(x, np.ones(13) / 13, mode="same")
    s = x.std()
    return x / s if s > 0 else x


for c, s in sel.items():
    if s.get("verdict") != "usable" or s.get("mode") not in ("first", "ref"):
        continue
    i = man[c]
    n = int(round((i["end"] - i["start"]) * FPS))
    f0 = int(round(i["start"] * FPS))
    clip = os.path.join(OUT, a.clip_pattern.format(cut=c, take=s["take"]))
    if not os.path.exists(clip):
        print(c, "clip missing:", clip, file=sys.stderr)
        continue
    if n < MIN_SAMPLES:
        print(f"{c}: cut is {n / FPS:.2f} s, under the {MIN_SAMPLES / FPS:.2f} s needed; skipped", file=sys.stderr)
        continue
    mo = motion(clip)
    spare = len(mo) - n  # last complete candidate window starts at mo[spare]
    if len(flux[f0:f0 + n]) != n or spare < 0:
        print(f"{c}: clip or audio shorter than the cut; skipped", file=sys.stderr)
        continue
    on = z(flux[f0:f0 + n])

    def corr(k):
        r = float(np.corrcoef(z(mo[k:k + n]), on)[0, 1])
        return r if np.isfinite(r) else None

    c0 = corr(0)
    best = (0, c0)
    for k in range(1, min(spare, int(a.max_offset * FPS)) + 1):
        r = corr(k)
        if r is not None and (best[1] is None or r > best[1]):
            best = (k, r)
    # A zero-offset correlation that is undefined (a still clip) keeps offset 0 and stores null.
    k = best[0] if (c0 is not None and best[1] is not None and best[1] - c0 >= 0.05) else 0
    best_r = best[1] if k else c0
    s["offset"] = round(k / FPS, 3)
    s["align_corr"] = None if best_r is None else round(best_r, 3)
    s["align_corr0"] = None if c0 is None else round(c0, 3)
    print(c, s["mode"], "offset", s["offset"], "corr", s["align_corr"], "at 0:", s["align_corr0"], "spare", round(spare / FPS, 2))
json.dump(sel, open(sp, "w"), indent=1, ensure_ascii=False, allow_nan=False)
