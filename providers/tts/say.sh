#!/usr/bin/env bash
# Zero-key TTS adapter — macOS `say`. No word timings (captions fall back to STT/estimate).
# Contract: stdin {text, out_path, ...} -> stdout {audio_path, duration_ms, word_timings:[]}
set -euo pipefail

req="$(cat)"
text="$(printf '%s' "$req" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["text"])')"
out="$(printf '%s' "$req" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["out_path"])')"
voice="$(printf '%s' "$req" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin).get("voice","") or "")')"

mkdir -p "$(dirname "$out")"
aiff="${out%.*}.aiff"

if [ -n "$voice" ]; then say -v "$voice" -o "$aiff" "$text"; else say -o "$aiff" "$text"; fi

final="$aiff"
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -loglevel error -i "$aiff" "$out" && rm -f "$aiff" && final="$out"
fi

dur_ms=0
if command -v ffprobe >/dev/null 2>&1; then
  dur_ms="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$final" 2>/dev/null | awk '{printf "%d",$1*1000}')"
fi

printf '{"audio_path":"%s","duration_ms":%s,"word_timings":[]}\n' "$final" "${dur_ms:-0}"
