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
hop = int(round(sr / FPS))
_, _, Z = stft(y, fs=sr, nperseg=hop * 2, noverlap=hop, boundary=None, padded=False)
M = np.log1p(np.abs(Z))
flux = np.maximum(0, np.diff(M, axis=1)).sum(axis=0)
flux = np.concatenate([[0], flux])


def motion(path):
    cap = cv2.VideoCapture(path)
    prev = None
    m = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(f, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        m.append(0.0 if prev is None else float(np.mean(np.abs(g - prev))))
        prev = g
    return np.array(m)


def z(x):
    x = x - np.convolve(x, np.ones(13) / 13, mode="same")  # remove slow drift, keep accents
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
    mo = motion(clip)
    on = z(flux[f0:f0 + n])
    spare = len(mo) - n - 1
    best = (0, None)
    c0 = None
    for k in range(0, max(0, min(spare, int(a.max_offset * FPS))) + 1):
        seg = z(mo[k:k + n])
        if len(seg) != len(on) or len(on) < 12:
            break
        r = float(np.corrcoef(seg, on)[0, 1])
        if k == 0:
            c0 = r
        if best[1] is None or r > best[1]:
            best = (k, r)
    if best[1] is None:
        continue
    k = best[0] if best[1] - c0 >= 0.05 else 0
    s["offset"] = round(k / FPS, 3)
    s["align_corr"] = round(best[1] if k else c0, 3)
    s["align_corr0"] = round(c0, 3)
    print(c, s["mode"], "offset", s["offset"], "corr", s["align_corr"], "at 0:", s["align_corr0"], "spare", round(spare / FPS, 2))
json.dump(sel, open(sp, "w"), indent=1, ensure_ascii=False)
