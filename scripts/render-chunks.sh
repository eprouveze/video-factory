#!/usr/bin/env bash
# Resumable chunked Remotion render, then a lossless concat. Finished chunks are kept, so a
# crash or a stop resumes at the first missing chunk. Chunks are rendered muted: the audio is
# put back afterwards with scripts/mux-original-audio.sh.
#
# usage: render-chunks.sh <project-dir> <composition-id> <total-frames> [options]
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: render-chunks.sh <project-dir> <composition-id> <total-frames> [options]
  <project-dir>      Remotion project (has node_modules/.bin/remotion)
  <composition-id>   composition to render
  <total-frames>     frame count of the whole film (seconds * fps)
options:
  --entry <file>        Remotion entry point            (default src/index.ts)
  --chunk <frames>      frames per chunk                (default 600)
  --concurrency <n>     renderer concurrency            (default 2)
  --out <file>          joined film, relative to the project dir (default out/render.mp4)
  --props <file>        JSON props file passed to every chunk
env: REMOTION_BIN overrides <project-dir>/node_modules/.bin/remotion
Chunks live in <project-dir>/out/chunks/. Delete that folder to start over.
USAGE
}

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
if [ "$#" -lt 3 ]; then usage; exit 2; fi
dir=$1; comp=$2; total=$3; shift 3
entry=src/index.ts; chunk=600; conc=2; out=out/render.mp4; props=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --entry) entry=${2:?}; shift 2 ;;
    --chunk) chunk=${2:?}; shift 2 ;;
    --concurrency) conc=${2:?}; shift 2 ;;
    --out) out=${2:?}; shift 2 ;;
    --props) props=${2:?}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 2 ;;
  esac
done
[ -d "$dir" ] || { echo "project dir not found: $dir" >&2; exit 2; }
case "$total" in ''|*[!0-9]*|0) echo "total-frames must be a positive integer" >&2; exit 2 ;; esac
case "$chunk" in ''|*[!0-9]*|0) echo "--chunk must be a positive integer" >&2; exit 2 ;; esac
case "$conc" in ''|*[!0-9]*|0) echo "--concurrency must be a positive integer" >&2; exit 2 ;; esac
command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH" >&2; exit 2; }

cd "$dir"
remotion=${REMOTION_BIN:-./node_modules/.bin/remotion}
[ -x "$remotion" ] || { echo "remotion binary not found: $remotion (npm install in $dir, or set REMOTION_BIN)" >&2; exit 2; }
mkdir -p out/chunks "$(dirname "$out")"
: > out/chunks/list.txt
for ((a=0; a<total; a+=chunk)); do
  b=$((a+chunk-1)); [ "$b" -ge "$total" ] && b=$((total-1))
  f=out/chunks/$(printf %06d "$a").mp4
  if [ ! -s "$f" ]; then
    extra=(); [ -n "$props" ] && extra=(--props="$props")
    "$remotion" render "$entry" "$comp" "$f.part.mp4" --frames="$a-$b" --concurrency="$conc" --muted --log=error "${extra[@]}"
    mv "$f.part.mp4" "$f"
    echo "$(date -u +%H:%M:%S) chunk $a-$b done" >> out/chunks/progress.log
  fi
  echo "file '$(basename "$f")'" >> out/chunks/list.txt
done
ffmpeg -v error -y -f concat -safe 0 -i out/chunks/list.txt -c copy "$out"
echo "joined: $dir/$out" | tee -a out/chunks/progress.log
