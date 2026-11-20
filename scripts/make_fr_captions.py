#!/usr/bin/env python3
"""Build translated captions on the cue times of an existing SRT, with the checks that catch the usual slips.

  make_fr_captions.py SOURCE.srt TRANSLATION.txt OUT.srt [--lang fr] [--max-chars 42]

TRANSLATION.txt: one cue per block, blocks separated by a blank line, in the same order as the
SOURCE.srt cues (line breaks inside a block become line breaks in the cue). The script
  - refuses a different cue count;
  - refuses a cue whose kind differs from the source ([sound description] vs sung line starting
    with a music note) so a sound cue is never translated into speech or the other way round;
  - refuses a line longer than --max-chars;
  - with --lang fr applies French typography: a no-break space before : ; ? ! » and after «.
Times come from SOURCE.srt untouched. Other languages: pass --lang xx for no typography rules, or
add a function to TYPO. French is the worked example.
"""
import argparse
import re
import sys

NB = " "


def typo_fr(s):
    s = re.sub(r" ([:;?!»])", NB + r"\1", s)
    return s.replace("« ", "«" + NB)


TYPO = {"fr": typo_fr}

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("source")
ap.add_argument("translation")
ap.add_argument("out")
ap.add_argument("--lang", default="fr")
ap.add_argument("--max-chars", type=int, default=42)
a = ap.parse_args()

cues = [b for b in re.split(r"\n\s*\n", open(a.source, encoding="utf-8").read().strip()) if b.strip()]
tr = [b.strip("\n") for b in re.split(r"\n\s*\n", open(a.translation, encoding="utf-8").read().strip()) if b.strip()]
if len(cues) != len(tr):
    sys.exit(f"{len(cues)} source cues vs {len(tr)} translated")
fix = TYPO.get(a.lang, lambda s: s)
blocks, bad = [], []
for i, (c, t) in enumerate(zip(cues, tr), 1):
    lines = c.split("\n")
    times, first = lines[1], lines[2]
    if first.startswith("[") != t.startswith("[") or first.startswith("♪") != t.startswith("♪"):
        bad.append(f"cue {i}: kind differs ({first!r} / {t!r})")
    for ln in t.split("\n"):
        if len(ln) > a.max_chars:
            bad.append(f"cue {i}: {len(ln)} chars: {ln}")
    blocks.append(f"{i}\n{times}\n{fix(t)}\n")
if bad:
    sys.exit("\n".join(bad))
open(a.out, "w", encoding="utf-8").write("\n".join(blocks))
print("wrote", a.out, len(blocks), "cues")
