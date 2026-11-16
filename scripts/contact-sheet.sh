#!/usr/bin/env bash
# One frame per shot of a film, tiled into a contact sheet. The frame is taken a fraction of
# the way into each shot (default 60 percent), and an index file lists the tile order.
#
# usage: contact-sheet.sh <manifest.json> <video.mp4> [options]
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: contact-sheet.sh <manifest.json> <video.mp4> [options]
  Reads scenes[].id, in_ms and out_ms from the manifest and takes one frame per shot.
options:
  --out <file.jpg>   sheet path           (default <video>-sheet.jpg)
  --cols <n>         tiles per row        (default 6)
  --width <px>       tile width           (default 320)
  --at <0..1>        position inside shot (default 0.6)
Also writes <sheet>.txt: tile number, shot id, time in seconds. Needs node and ffmpeg.
USAGE
}

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
if [ "$#" -lt 2 ]; then usage; exit 2; fi
manifest=$1; video=$2; shift 2
out=""; cols=6; width=320; at=0.6
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) out=${2:?}; shift 2 ;;
    --cols) cols=${2:?}; shift 2 ;;
    --width) width=${2:?}; shift 2 ;;
    --at) at=${2:?}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 2 ;;
  esac
done
[ -f "$manifest" ] || { echo "manifest not found: $manifest" >&2; exit 2; }
[ -f "$video" ] || { echo "video not found: $video" >&2; exit 2; }
case "$cols" in ''|*[!0-9]*|0) echo "--cols must be a positive integer" >&2; exit 2 ;; esac
case "$width" in ''|*[!0-9]*|0) echo "--width must be a positive integer" >&2; exit 2 ;; esac
awk -v a="$at" 'BEGIN{exit !(a>=0 && a<=1)}' || { echo "--at must be between 0 and 1" >&2; exit 2; }
command -v node >/dev/null || { echo "node not found on PATH" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH" >&2; exit 2; }
[ -n "$out" ] || out="${video%.*}-sheet.jpg"

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const at = Number(process.argv[2]);
for (const s of m.scenes || []) {
  if (!Number.isFinite(s.in_ms) || !Number.isFinite(s.out_ms)) continue;
  console.log(s.id + " " + ((s.in_ms + (s.out_ms - s.in_ms) * at) / 1000).toFixed(3));
}' "$manifest" "$at" > "$work/frames.txt"
[ -s "$work/frames.txt" ] || { echo "no scenes with in_ms/out_ms in $manifest" >&2; exit 1; }

: > "$out.txt"; n=0
while read -r id t; do
  tile=$(printf '%s/%04d.jpg' "$work" "$n")
  if ! ffmpeg -nostdin -v error -y -ss "$t" -i "$video" -frames:v 1 \
      -vf "scale=${width}:-2,drawtext=text='$id':x=6:y=h-22:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6" "$tile" 2>/dev/null; then
    ffmpeg -nostdin -v error -y -ss "$t" -i "$video" -frames:v 1 -vf "scale=${width}:-2" "$tile"
  fi
  echo "$n $id $t" >> "$out.txt"
  n=$((n+1))
done < "$work/frames.txt"
rows=$(( (n + cols - 1) / cols ))
ffmpeg -nostdin -v error -y -start_number 0 -i "$work/%04d.jpg" -frames:v 1 -vf "tile=${cols}x${rows}" "$out"
echo "sheet: $out ($n tiles); index: $out.txt"
