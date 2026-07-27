# Photosynthesis — a 60-second 3D explainer

A one-minute motion-graphics film explaining photosynthesis to a middle-school
class. Real 3D (WebGL), original procedural score and sound design, rendered
offline to a 1080p H.264 master.

**Master:** [`out/photosynthesis.mp4`](out/photosynthesis.mp4) — 1920×1080, 30fps, 60.00s, AAC stereo.

Everything here is generated from source: no stock footage, no sample library,
no external assets at runtime. The only third-party dependencies are three.js
and the Inter typeface, both installed from npm.

## The film

| Time | Beat |
|---|---|
| 0:00 | Sun ignites out of black — title card |
| 0:05 | The leaf rises and settles |
| 0:11 | **Ingredient 1** — sunlight, photons streaming into the blade |
| 0:17 | **Ingredient 2** — water climbing the stalk from the roots |
| 0:23 | **Ingredient 3** — carbon dioxide drifting in from the air |
| 0:30 | Light wipe *inside* the leaf — the chloroplast; water splits at 0:33 |
| 0:37 | Glucose assembles atom by atom; oxygen pairs lift away |
| 0:44 | The whole equation, a model over every term |
| 0:52 | Pull back to a tree at dusk — payoff |

The typography carries the full explanation, so the film teaches with the sound
off. A narration script, beat sheet and caption file live in
[`script/`](script/); `script/narration.md` also lists what the film knowingly
simplifies, which is the useful thing to have in front of you when a student
asks a sharp question.

## How it is built

```
scene/      the film — a deterministic WebGL scene
  js/util.js       easing, seeded RNG, rich-text (subscript) rasterising
  js/objects.js    leaf, sun, molecules, chloroplast, tree, particles
  js/ui.js         typography layer: per-glyph reveals in 3D space
  js/story.js      the shot list, choreography and copy
  js/main.js       renderer, post chain, frame clock
audio/
  make_score.py    procedural score + sound design -> 48kHz stereo WAV
render/
  render.js        headless Chromium -> JPEG frames -> ffmpeg
  build.sh         score + frames + mux
script/            narration, beat sheet, captions
```

**Determinism.** `story.update(t)` describes the frame at time `t` completely —
nothing integrates state between frames, and every random value comes from a
seeded generator. Any frame can be rendered in isolation and the film renders
byte-identically every time, however fast or slow the renderer runs.

**Looks.** Bloom over an ACES tone map, then a final grade pass with vignette,
grain and a touch of chromatic aberration. Type is rendered *after* the tone
map, in its own perspective scene, so lines travel in real depth while staying
crisp and free of bloom.

**Sound.** `make_score.py` synthesises everything — pads from stacked detuned
saws, inharmonic bells, a pitch-enveloped kick, noise whooshes, a Schroeder
reverb built from comb and allpass filters — and places the cues on the same
beat times the animation uses. The master is levelled to about −14 dBFS RMS
and stays mono-compatible (channel correlation ≈ 0.96).

## Rendering it yourself

```bash
npm install                    # three.js + Inter, into ./node_modules
pip install imageio-ffmpeg numpy
photosynthesis/render/build.sh # -> photosynthesis/out/photosynthesis.mp4
```

Faster look at a change:

```bash
WIDTH=960 HEIGHT=540 FPS=24 photosynthesis/render/build.sh

# or single frames, no encode
node photosynthesis/render/render.js --stills 14,33.5,48 --width 1280 --height 720
```

To scrub it live in a browser, serve the repo root and open
`photosynthesis/scene/index.html?play`.

Rendering needs a headless Chromium with WebGL (the renderer launches it with
SwiftShader, so no GPU is required) and an ffmpeg with libx264 and AAC.

## Note on the voice-over

There is no recorded narration. Neural text-to-speech voices are distributed
via Hugging Face, which this environment's egress policy blocks, and a
formant-synth voice would have undercut the rest of the film. The design
compensates: every idea is on screen as type, the score is scored to those
reveals, and `script/narration.md` is ready to read live or record.
