#!/usr/bin/env bash
# Replace the render's re-encoded audio with the master audio stream, copied bit for bit.
# A renderer re-encodes AAC and leaves an encoder delay (about 2048 samples); copying the
# master stream removes both. Compares the audio packet MD5 of master and result, then checks
# the film's duration against the master's.
#
# usage: mux-original-audio.sh <render.mp4> <master-audio> <out.mp4> [tolerance-seconds]
# exit:  0 identical audio and duration within tolerance (default 0.5 s); 1 otherwise; 2 usage
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: mux-original-audio.sh <render.mp4> <master-audio> <out.mp4> [tolerance-seconds]
  Copies the first audio stream of <master-audio> into <render.mp4> (video copied, nothing
  re-encoded), prints the audio packet MD5 of the master and of the result, and exits 1 if
  they differ or if the film's duration is more than the tolerance (default 0.5 s) away from
  the master's. Needs ffmpeg and ffprobe.
USAGE
}

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then usage; exit 2; fi
render=$1; master=$2; out=$3; tol=${4:-0.5}
[ -f "$render" ] || { echo "render not found: $render" >&2; exit 2; }
[ -f "$master" ] || { echo "master audio not found: $master" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH" >&2; exit 2; }
command -v ffprobe >/dev/null || { echo "ffprobe not found on PATH" >&2; exit 2; }

ffmpeg -v error -y -i "$render" -i "$master" -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart "$out"

a=$(ffmpeg -v error -i "$master" -map 0:a:0 -c copy -f md5 -)
b=$(ffmpeg -v error -i "$out" -map 0:a:0 -c copy -f md5 -)
echo "master audio packets: $a"
echo "result audio packets: $b"
if [ "$a" != "$b" ]; then echo "AUDIO DIFFERS" >&2; exit 1; fi
echo "audio identical"

dm=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$master")
do_=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$out")
if awk -v a="$dm" -v b="$do_" -v t="$tol" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(d<=t)}'; then
  echo "duration ok: film ${do_}s, master ${dm}s (tolerance ${tol}s)"
else
  echo "DURATION MISMATCH: film ${do_}s, master ${dm}s (tolerance ${tol}s)" >&2
  exit 1
fi
