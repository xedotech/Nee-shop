#!/usr/bin/env bash
# End-to-end build: score -> frames -> muxed master.
#
#   ./render/build.sh                        # 1920x1080 @ 30fps
#   WIDTH=960 HEIGHT=540 ./render/build.sh   # quick look
#   CHUNK=6 ./render/build.sh                # segment length in seconds
#
# The film renders in segments. Segments already on disk are skipped, so an
# interrupted build resumes where it stopped instead of starting over — which
# matters because a full 1080p pass takes about twenty minutes on CPU.
set -euo pipefail

cd "$(dirname "$0")/.."

WIDTH="${WIDTH:-1920}"
HEIGHT="${HEIGHT:-1080}"
FPS="${FPS:-30}"
CHUNK="${CHUNK:-6}"
DURATION="${DURATION:-60}"
OUT="${OUT:-out/photosynthesis.mp4}"
PARTS="out/parts"

FFMPEG="${FFMPEG:-$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}"
export NODE_PATH="${NODE_PATH:-/opt/node22/lib/node_modules}"

mkdir -p "$PARTS"

if [ ! -s out/score.wav ]; then
  echo "==> score"
  python3 audio/make_score.py --out out/score.wav
else
  echo "==> score (cached)"
fi

echo "==> frames (${WIDTH}x${HEIGHT} @ ${FPS}fps, ${CHUNK}s segments)"
list="$PARTS/list.txt"
: > "$list"
start=0
while [ "$(echo "$start < $DURATION" | bc)" -eq 1 ]; do
  end=$(echo "$start + $CHUNK" | bc)
  [ "$(echo "$end > $DURATION" | bc)" -eq 1 ] && end="$DURATION"
  part="$PARTS/$(printf 'part_%05.1f.mp4' "$start")"

  if [ -s "$part" ] && "$FFMPEG" -hide_banner -v error -i "$part" -f null - 2>/dev/null; then
    echo "  [skip] ${start}s-${end}s"
  else
    echo "  [render] ${start}s-${end}s"
    node render/render.js --out "$part" --start "$start" --end "$end" \
      --width "$WIDTH" --height "$HEIGHT" --fps "$FPS"
  fi

  echo "file '$(basename "$part")'" >> "$list"
  start="$end"
done

echo "==> concat + mux"
"$FFMPEG" -y -hide_banner -loglevel error \
  -f concat -safe 0 -i "$list" -i out/score.wav \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart -shortest "$OUT"

ls -lh "$OUT"
"$FFMPEG" -hide_banner -i "$OUT" 2>&1 | sed -n '/Duration/,/Stream #0:1/p'
