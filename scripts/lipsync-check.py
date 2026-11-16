#!/usr/bin/env python3
"""Lip-sync figure for one clip: mouth opening (face landmarks) against the vocal-band envelope of the audio it was asked to sing.

  lipsync-check.py CLIP.mp4 REF.wav --model face_landmarker.task [--max-lag 0.4] [--audio-offset 0]
Prints one JSON line: corr (Pearson at best lag), lag_s (positive = mouth late), corr0 (at lag 0),
face_frac, frames, open_range.

REF.wav must be the slice of the LEAD-VOCAL STEM that the clip was asked to sing, starting at the
same instant as the clip (cut it with: ffmpeg -ss START -t LEN -i vocal-stem.wav slice.wav). On a
full mix the instruments are in the 300-3400 Hz band and the figure is only a floor.
A good figure does not replace watching the clip: a staccato mouth can still correlate well.

Python dependencies (imported only when a clip is measured): numpy, scipy, opencv-python, mediapipe.
  pip install numpy scipy opencv-python mediapipe
The face landmarker model file (face_landmarker.task) is a separate download from the MediaPipe
project; pass it with --model or the FACE_MODEL environment variable. Nothing is downloaded here.
"""
import argparse
import json
import os
import sys


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description="Mouth-opening vs audio-envelope correlation for one clip.")
    ap.add_argument("clip", help="video clip (mp4)")
    ap.add_argument("wav", help="WAV slice of the lead-vocal stem aligned with the clip start")
    ap.add_argument("--max-lag", type=float, default=0.4, help="largest lag searched, seconds (default 0.4)")
    ap.add_argument("--audio-offset", type=float, default=0.0, help="skip this many seconds at the start of the WAV")
    ap.add_argument("--model", default=os.environ.get("FACE_MODEL"),
                    help="path of face_landmarker.task (or set FACE_MODEL)")
    return ap.parse_args(argv)


def load_deps():
    missing = []
    mods = {}
    for name, mod in (("numpy", "numpy"), ("scipy", "scipy"), ("opencv-python", "cv2"), ("mediapipe", "mediapipe")):
        try:
            mods[mod] = __import__(mod)
        except ImportError:
            missing.append(name)
    if missing:
        sys.exit("lipsync-check: missing Python packages: " + ", ".join(missing) + "\n  pip install " + " ".join(missing))
    return mods


def band_envelope(y, sr, fps, n, np, butter, sosfiltfilt):
    y = sosfiltfilt(butter(4, [300, 3400], btype="band", fs=sr, output="sos"), y)
    hop = sr / fps
    env = np.array([
        np.sqrt(np.mean(y[int(i * hop):int((i + 1) * hop)] ** 2)) if int((i + 1) * hop) <= len(y) else np.nan
        for i in range(n)
    ])
    return env


def best_lag(m, env, fps, max_lag, np):
    def corr(lag):  # lag in frames; positive = mouth late
        if lag >= 0:
            x, y2 = m[lag:], env[:len(env) - lag]
        else:
            x, y2 = m[:lag], env[-lag:]
        if len(x) < 8 or x.std() == 0 or y2.std() == 0:
            return -1.0
        return float(np.corrcoef(x, y2)[0, 1])

    L = int(round(max_lag * fps))
    best = max(range(-L, L + 1), key=corr)
    return best, corr(best), corr(0)


def main():
    a = parse_args()
    if not os.path.isfile(a.clip):
        sys.exit(f"lipsync-check: clip not found: {a.clip}")
    if not os.path.isfile(a.wav):
        sys.exit(f"lipsync-check: wav not found: {a.wav}")
    if not a.model or not os.path.isfile(a.model):
        sys.exit("lipsync-check: face landmarker model not found; pass --model face_landmarker.task or set FACE_MODEL")
    mods = load_deps()
    np, cv2, mp = mods["numpy"], mods["cv2"], mods["mediapipe"]
    from scipy.io import wavfile
    from scipy.signal import butter, sosfiltfilt

    opt = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=a.model),
        running_mode=mp.tasks.vision.RunningMode.IMAGE, num_faces=1)
    det = mp.tasks.vision.FaceLandmarker.create_from_options(opt)
    cap = cv2.VideoCapture(a.clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    m = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        if not r.face_landmarks:  # small face: retry on a 2.5x enlargement
            big = np.ascontiguousarray(cv2.resize(rgb, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC))
            r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=big))
        if r.face_landmarks:
            p = r.face_landmarks[0]
            h = abs(p[152].y - p[10].y) or 1e-6
            m.append(abs(p[14].y - p[13].y) / h)
        else:
            m.append(np.nan)
    m = np.array(m)
    n = len(m)
    face = float(np.mean(~np.isnan(m))) if n else 0.0
    out = {"clip": a.clip, "frames": n, "fps": round(fps, 3), "face_frac": round(face, 3)}
    if n < 8 or face < 0.5:
        out.update(corr=None, note="face not found in enough frames")
        print(json.dumps(out))
        return
    idx = np.arange(n)
    good = ~np.isnan(m)
    m = np.interp(idx, idx[good], m[good])
    sr, y = wavfile.read(a.wav)
    y = y.astype(np.float64)
    y = y.mean(axis=1) if y.ndim > 1 else y
    y = y[int(a.audio_offset * sr):]
    env = band_envelope(y, sr, fps, n, np, butter, sosfiltfilt)
    k = int(np.sum(~np.isnan(env)))
    m, env = m[:k], env[:k]
    sm = lambda x: np.convolve(x, np.ones(3) / 3, mode="same")
    m, env = sm(m), sm(env)
    best, c_best, c0 = best_lag(m, env, fps, a.max_lag, np)
    out.update(corr=round(c_best, 3), lag_s=round(best / fps, 3), corr0=round(c0, 3),
               open_range=round(float(m.max() - m.min()), 4), seconds=round(k / fps, 2))
    print(json.dumps(out))


if __name__ == "__main__":
    main()
