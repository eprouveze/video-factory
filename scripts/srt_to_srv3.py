#!/usr/bin/env python3
"""SRT -> YouTube timed text (srv3) with one colour per speaker. Same words and times as the SRT.

  srt_to_srv3.py IN.srt OUT.srv3 [--lead NAME] [--colour NAME=#RRGGBB ...]

A line starting "NAME:" or "NAME (note):" (NAME in capitals) sets the speaker for the rest of that
cue. A cue with no label belongs to the lead speaker (--lead, default the first speaker named in
the file; the one who sings the unlabelled lines). [Bracketed] lines are sound descriptions and get
their own grey pen. Labels stay in the text: colour is an extra cue, never the only one.
Colours come from a fixed palette in order of first appearance; override with --colour.
"""
import argparse
import html
import re

PALETTE = ["#FA9726", "#FFFFFF", "#59DCEB", "#9BE564", "#F28DC3", "#C4A7F5"]
SOUND = "#B4BCC4"
LABEL = re.compile(r"^([A-Z][A-Z0-9_ ]*?)(?: \([^)]*\))?\s*:")

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--lead", help="speaker of unlabelled cues (default: first labelled speaker)")
ap.add_argument("--colour", action="append", default=[], metavar="NAME=#RRGGBB")
a = ap.parse_args()


def ms(t):
    h, m, s = t.replace(",", ".").split(":")
    return round((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)


cues = [b for b in re.split(r"\n\s*\n", open(a.src, encoding="utf-8").read().strip()) if b.strip()]
names = []
for c in cues:
    for ln in c.strip().split("\n")[2:]:
        m = LABEL.match(ln)
        if m and m.group(1) not in names:
            names.append(m.group(1))
lead = a.lead or (names[0] if names else "LEAD")
if lead not in names:
    names.insert(0, lead)
colours = {n: PALETTE[i % len(PALETTE)] for i, n in enumerate(names)}
for kv in a.colour:
    k, v = kv.split("=", 1)
    colours[k] = v
pen_id = {n: i for i, n in enumerate(names, 1)}
SOUND_ID = len(names) + 1
pens = "".join(f'<pen id="{pen_id[n]}" fc="{colours[n]}" fo="254" bc="#000000" bo="166"/>' for n in names)
pens += f'<pen id="{SOUND_ID}" fc="{SOUND}" fo="254" bc="#000000" bo="166"/>'
body = []
for c in cues:
    lines = c.strip().split("\n")
    t0, t1 = [ms(x.strip()) for x in lines[1].split("-->")]
    cur, segs = lead, []
    for ln in lines[2:]:
        if ln.startswith("["):
            pid = SOUND_ID
        else:
            m = LABEL.match(ln)
            if m:
                cur = m.group(1)
            pid = pen_id[cur]
        segs.append(f'<s p="{pid}">{html.escape(ln, quote=False)}</s>')
    body.append(f'<p t="{t0}" d="{t1 - t0}" wp="1" ws="1">' + "\n".join(segs) + "</p>")
xml = ('<?xml version="1.0" encoding="utf-8"?>\n<timedtext format="3">\n<head>' + pens
       + '<wp id="1" ap="7" ah="50" av="94"/><ws id="1" ju="2"/></head>\n<body>\n'
       + "\n".join(body) + "\n</body>\n</timedtext>\n")
open(a.out, "w", encoding="utf-8").write(xml)
print("wrote", a.out, len(body), "cues")
