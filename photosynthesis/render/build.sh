#!/usr/bin/env bash
# End-to-end build: score -> frames -> muxed master.
#
#   ./render/build.sh                 # 1920x1080 @ 30fps
#   WIDTH=960 HEIGHT=540 ./render/build.sh   # quick look
set -euo pipefail

cd "$(dirname "$0")/.."

WIDTH="${WIDTH:-1920}"
HEIGHT="${HEIGHT:-1080}"
FPS="${FPS:-30}"
OUT="${OUT:-out/photosynthesis.mp4}"

FFMPEG="${FFMPEG:-$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}"
export NODE_PATH="${NODE_PATH:-/opt/node22/lib/node_modules}"

echo "==> score"
python3 audio/make_score.py --out out/score.wav

echo "==> frames (${WIDTH}x${HEIGHT} @ ${FPS}fps)"
node render/render.js --out out/video.mp4 --width "$WIDTH" --height "$HEIGHT" --fps "$FPS"

echo "==> mux"
"$FFMPEG" -y -hide_banner -loglevel error \
  -i out/video.mp4 -i out/score.wav \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart -shortest "$OUT"

rm -f out/video.mp4
ls -lh "$OUT"
"$FFMPEG" -hide_banner -i "$OUT" 2>&1 | sed -n '/Duration/,/Stream/p'
