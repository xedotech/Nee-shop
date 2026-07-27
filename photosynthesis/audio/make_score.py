#!/usr/bin/env python3
"""Procedural score and sound design for the 60-second photosynthesis film.

Everything is synthesised from scratch — no samples, no network. The cue sheet
at the bottom is keyed to the same beat times the animation uses, so picture
and sound stay locked.

    python3 audio/make_score.py --out out/score.wav
"""

from __future__ import annotations

import argparse
import math
import os
import wave

import numpy as np

SR = 48000
DURATION = 60.0
BPM = 84.0
BEAT = 60.0 / BPM

rng = np.random.default_rng(20260727)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def n_samples(seconds: float) -> int:
    return int(round(seconds * SR))


def silence(seconds: float = DURATION) -> np.ndarray:
    return np.zeros(n_samples(seconds), dtype=np.float64)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(n_samples(seconds)) / SR


def note(name: str, octave: int) -> float:
    """Equal-tempered frequency, A4 = 440."""
    semis = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4,
             'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}[name]
    return 440.0 * (2.0 ** (semis / 12.0 + (octave - 4)))


def add(dst: np.ndarray, src: np.ndarray, at: float, gain: float = 1.0) -> None:
    """Mix `src` into `dst` starting at `at` seconds, clipping at the edges."""
    i = n_samples(at)
    if i >= len(dst):
        return
    if i < 0:
        src = src[-i:]
        i = 0
    end = min(len(dst), i + len(src))
    dst[i:end] += src[: end - i] * gain


def adsr(length: float, a: float, d: float, s: float, r: float, peak: float = 1.0) -> np.ndarray:
    n = n_samples(length)
    env = np.zeros(n)
    na, nd, nr = n_samples(a), n_samples(d), n_samples(r)
    ns = max(0, n - na - nd - nr)
    idx = 0
    if na:
        env[idx:idx + na] = np.linspace(0, peak, na)
        idx += na
    if nd:
        env[idx:idx + nd] = np.linspace(peak, peak * s, nd)
        idx += nd
    if ns:
        env[idx:idx + ns] = peak * s
        idx += ns
    if nr:
        env[idx:idx + nr] = np.linspace(peak * s, 0, min(nr, n - idx))
    return env


def expdecay(length: float, tau: float, attack: float = 0.004) -> np.ndarray:
    t = t_axis(length)
    env = np.exp(-t / tau)
    na = max(1, n_samples(attack))
    env[:na] *= np.linspace(0, 1, na)
    return env


def onepole_lp_fast(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Two-pass smoothing that approximates a gentle low pass, vectorised."""
    a = math.exp(-2.0 * math.pi * cutoff / SR)
    n_taps = max(1, int(round(1.0 / (1.0 - a))))
    kernel = np.exp(-np.arange(n_taps * 3) / n_taps)
    kernel /= kernel.sum()
    return np.convolve(x, kernel, mode='same')


def hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - onepole_lp_fast(x, cutoff)


def comb(x: np.ndarray, delay: int, feedback: float) -> np.ndarray:
    """y[n] = x[n] + f*y[n-delay], evaluated a block at a time."""
    y = x.astype(np.float64).copy()
    for start in range(delay, len(y), delay):
        end = min(start + delay, len(y))
        y[start:end] += feedback * y[start - delay:start - delay + (end - start)]
    return y


def allpass(x: np.ndarray, delay: int, g: float) -> np.ndarray:
    y = np.zeros(len(x) + delay)
    xp = np.concatenate([x, np.zeros(delay)])
    for start in range(0, len(y), delay):
        end = min(start + delay, len(y))
        prev_y = y[start - delay:start - delay + (end - start)] if start >= delay else np.zeros(end - start)
        prev_x = xp[start - delay:start - delay + (end - start)] if start >= delay else np.zeros(end - start)
        y[start:end] = -g * xp[start:end] + prev_x + g * prev_y
    return y[: len(x)]


def reverb(x: np.ndarray, mix: float = 0.3, size: float = 1.0) -> np.ndarray:
    """Schroeder reverb: parallel combs into series allpasses."""
    combs = [int(d * size) for d in (1553, 1789, 2087, 2437)]
    wet = np.zeros_like(x)
    for d in combs:
        wet += comb(x, d, 0.84)
    wet /= len(combs)
    for d, g in ((233, 0.7), (97, 0.7)):
        wet = allpass(wet, d, g)
    wet = onepole_lp_fast(wet, 5200)
    return (1 - mix) * x + mix * wet


def level(x: np.ndarray, target: float = 0.115, amount: float = 0.42,
          window: float = 0.35, lo: float = 0.6, hi: float = 2.6) -> np.ndarray:
    """Slow upward/downward levelling.

    Synthesised cues arrive at wildly different levels; without this the pad
    passages sit ten decibels under the hits and read as dropouts.
    """
    mono = x.mean(axis=1) if x.ndim > 1 else x
    w = max(1, n_samples(window))
    kernel = np.ones(w) / w
    env = np.sqrt(np.convolve(mono ** 2, kernel, mode='same')) + 1e-6
    gain = np.clip((target / env) ** amount, lo, hi)
    gain = np.convolve(gain, kernel, mode='same')          # no pumping on transients
    return x * (gain[:, None] if x.ndim > 1 else gain)


def stereo(mono_l: np.ndarray, mono_r: np.ndarray) -> np.ndarray:
    n = max(len(mono_l), len(mono_r))
    out = np.zeros((n, 2))
    out[: len(mono_l), 0] = mono_l
    out[: len(mono_r), 1] = mono_r
    return out


# --------------------------------------------------------------------------
# voices
# --------------------------------------------------------------------------

def bell(freq: float, length: float = 2.6, gain: float = 1.0, bright: float = 1.0) -> np.ndarray:
    """Struck bell: a few slightly inharmonic partials, each decaying faster."""
    t = t_axis(length)
    partials = [(1.0, 1.00, 1.00), (0.46, 2.01, 0.62), (0.28, 2.99, 0.42),
                (0.16, 4.21, 0.28), (0.09, 5.44, 0.20), (0.05, 6.79, 0.14)]
    out = np.zeros(len(t))
    for amp, ratio, decay in partials:
        tau = length * 0.30 * decay
        out += amp * bright ** (ratio - 1) * np.sin(2 * math.pi * freq * ratio * t) * np.exp(-t / tau)
    na = n_samples(0.003)
    out[:na] *= np.linspace(0, 1, na)
    return out * gain * 0.30


def pluck(freq: float, length: float = 1.2, gain: float = 1.0) -> np.ndarray:
    """Soft triangle-ish pluck for the arpeggio."""
    t = t_axis(length)
    sig = (np.sin(2 * math.pi * freq * t)
           + 0.28 * np.sin(2 * math.pi * freq * 2 * t)
           + 0.12 * np.sin(2 * math.pi * freq * 3 * t))
    env = expdecay(length, 0.34, attack=0.006)
    return sig * env * gain * 0.22


def pad(freqs, length: float, gain: float = 1.0, detune: float = 0.006) -> np.ndarray:
    """Warm stacked-saw pad, filtered and slowly moving."""
    t = t_axis(length)
    out = np.zeros(len(t))
    lfo = 1.0 + 0.004 * np.sin(2 * math.pi * 0.13 * t + 1.1)
    for f in freqs:
        for k, d in ((1.0, 0.0), (1.0, detune), (1.0, -detune), (0.5, detune * 2)):
            ph = 2 * math.pi * f * k * (1 + d) * t * lfo
            # band-limited-ish saw from a small harmonic stack
            sig = np.zeros(len(t))
            for h in range(1, 7):
                sig += np.sin(ph * h) / h
            out += sig * (0.5 if k == 0.5 else 1.0)
    out /= max(1, len(freqs) * 4)
    out = onepole_lp_fast(out, 1400)
    return out * gain * 0.20


def sub(freq: float, length: float, gain: float = 1.0) -> np.ndarray:
    t = t_axis(length)
    env = adsr(length, length * 0.35, length * 0.15, 0.75, length * 0.45)
    return np.sin(2 * math.pi * freq * t) * env * gain * 0.5


def kick(gain: float = 1.0) -> np.ndarray:
    length = 0.55
    t = t_axis(length)
    f = 92 * np.exp(-t / 0.045) + 44
    phase = 2 * math.pi * np.cumsum(f) / SR
    body = np.sin(phase) * expdecay(length, 0.13, attack=0.001)
    click = rng.normal(0, 1, len(t)) * expdecay(length, 0.004)
    return (body + 0.10 * click) * gain * 0.55


def tick(gain: float = 1.0, bright: float = 7000.0) -> np.ndarray:
    length = 0.09
    n = n_samples(length)
    noise = rng.normal(0, 1, n)
    noise = hp(noise, bright * 0.35)
    return noise * expdecay(length, 0.014) * gain * 0.22


def whoosh(length: float = 1.4, gain: float = 1.0, rise: bool = True) -> np.ndarray:
    """Noise sweep: brightness climbs into the hit, then falls away."""
    n = n_samples(length)
    noise = rng.normal(0, 1, n)
    t = np.linspace(0, 1, n)
    curve = t ** 2 if rise else (1 - t) ** 2
    lows = onepole_lp_fast(noise, 420)
    highs = hp(noise, 2600)
    mids = onepole_lp_fast(noise, 2200) - onepole_lp_fast(noise, 700)
    body = lows * (1 - curve) + mids * (0.7 + 0.3 * curve) + highs * curve * 0.8
    env = np.sin(np.pi * t) ** 1.6 if rise else np.exp(-t * 4)
    return body * env * gain * 0.16


def impact(gain: float = 1.0) -> np.ndarray:
    length = 2.2
    t = t_axis(length)
    boom = np.sin(2 * math.pi * (58 * np.exp(-t / 0.25) + 38) * t) * expdecay(length, 0.34, 0.002)
    air = hp(rng.normal(0, 1, len(t)), 1800) * expdecay(length, 0.09)
    return (boom * 0.9 + air * 0.22) * gain * 0.45


def sparkle(count: int = 14, spread: float = 0.7, base: float = 1400.0, gain: float = 1.0) -> np.ndarray:
    """A shower of tiny bells — used when the water molecules break apart."""
    out = silence(spread + 2.0)
    for i in range(count):
        f = base * (2 ** (rng.integers(0, 14) / 12.0))
        at = float(rng.random()) * spread
        add(out, bell(f, 1.4, gain=0.34, bright=1.2), at)
    return out


def riser(length: float = 2.4, gain: float = 1.0) -> np.ndarray:
    """Pitch-rising shimmer that leads into a cut."""
    t = t_axis(length)
    k = (t / length) ** 1.8
    freq = 220 * (2 ** (2.2 * k))
    phase = 2 * math.pi * np.cumsum(freq) / SR
    sig = np.sin(phase) + 0.4 * np.sin(2 * phase) + 0.2 * np.sin(3 * phase)
    noise = hp(rng.normal(0, 1, len(t)), 3000) * k
    env = k ** 1.4
    return (sig * 0.35 + noise * 0.5) * env * gain * 0.14


# --------------------------------------------------------------------------
# the cue sheet
# --------------------------------------------------------------------------

CHORDS = [
    # (start, end, root octave 2 note, chord tones for pad, arpeggio pool)
    (0.0, 10.8, ('D', 2), [('D', 3), ('A', 3), ('D', 4), ('F#', 4), ('E', 5)],
     [('D', 5), ('F#', 5), ('A', 5), ('E', 6)]),
    (10.8, 17.0, ('D', 2), [('D', 3), ('A', 3), ('F#', 4), ('C#', 5), ('E', 5)],
     [('F#', 5), ('A', 5), ('C#', 6), ('E', 6)]),
    (17.0, 23.2, ('B', 1), [('B', 2), ('F#', 3), ('D', 4), ('A', 4), ('C#', 5)],
     [('D', 5), ('F#', 5), ('A', 5), ('B', 5)]),
    (23.2, 29.6, ('G', 1), [('G', 2), ('D', 3), ('B', 3), ('F#', 4), ('A', 4)],
     [('B', 5), ('D', 6), ('F#', 5), ('A', 5)]),
    (29.6, 37.2, ('A', 1), [('A', 2), ('E', 3), ('C#', 4), ('G#', 4), ('B', 4)],
     [('C#', 6), ('E', 6), ('B', 5), ('G#', 5)]),
    (37.2, 44.4, ('D', 2), [('D', 3), ('A', 3), ('F#', 4), ('E', 5), ('A', 5)],
     [('D', 6), ('F#', 5), ('A', 5), ('E', 6)]),
    (44.4, 52.0, ('G', 1), [('G', 2), ('D', 3), ('B', 3), ('E', 4), ('A', 4)],
     [('B', 5), ('D', 6), ('E', 6), ('A', 5)]),
    (52.0, 60.0, ('D', 2), [('D', 2), ('A', 2), ('D', 3), ('F#', 3), ('A', 3), ('D', 4), ('F#', 4)],
     [('D', 6), ('A', 5), ('F#', 5), ('D', 5)]),
]

CUTS = (29.6, 44.4, 52.0)


def air_bed() -> np.ndarray:
    """Barely-there noise wash that glues the quiet sections together."""
    n = n_samples(DURATION)
    noise = rng.normal(0, 1, n)
    band = onepole_lp_fast(noise, 900) - onepole_lp_fast(noise, 180)
    t = t_axis(DURATION)
    move = 0.55 + 0.45 * (0.5 + 0.5 * np.sin(2 * math.pi * 0.055 * t + 0.6))
    swell = np.clip((t - 1.0) / 2.5, 0, 1) * np.clip((DURATION - 1.2 - t) / 2.0, 0, 1)
    return band * move * swell * 0.075


def build() -> np.ndarray:
    music = silence()
    fx = silence()

    music += air_bed()

    # ---- harmony: pads and sub, one block per chord ----------------------
    for start, end, root, tones, _pool in CHORDS:
        length = end - start + 2.4
        freqs = [note(n, o) for n, o in tones]
        block = pad(freqs, length, gain=1.0)
        block *= adsr(length, 1.1, 0.6, 0.9, 1.4)
        add(music, reverb(block, mix=0.42, size=1.15), start - 0.4, 1.30)
        add(music, sub(note(*root), length * 0.9, gain=0.9), start - 0.2, 0.44)

    # ---- arpeggio: eighth notes, entering with the leaf -------------------
    arp_start, arp_end = 5.6, 52.0
    step = BEAT / 2
    i = 0
    t = arp_start
    while t < arp_end:
        pool = next(p for s, e, _r, _c, p in CHORDS if s <= t < e)
        n, o = pool[i % len(pool)]
        # busier through the build, sparser under the wide beats
        density = 1.0 if t < 10.8 else (0.92 if t < 37.2 else 1.0)
        if (i % 2 == 0) or rng.random() < density - 0.25:
            vel = 0.55 + 0.35 * (0.5 + 0.5 * math.sin(i * 0.7))
            if 44.4 <= t < 52.0:
                vel *= 0.92
            add(music, reverb(pluck(note(n, o), 1.3, gain=vel), mix=0.34), t, 0.5)
        i += 1
        t += step

    # ---- pulse: soft kick and ticks keep the film moving ------------------
    t = 5.2
    beat_i = 0
    while t < 52.6:
        strong = beat_i % 2 == 0
        if strong and t > 6.0:
            g = 0.45 if t < 29.6 else 0.6
            if 44.4 <= t < 52.0:
                g = 0.6
            add(fx, kick(g), t)
        if t > 8.0:
            add(fx, tick(0.5 if strong else 0.3), t + step)
        beat_i += 1
        t += BEAT

    # ---- the story beats --------------------------------------------------
    # Ignition: the sun arrives on a low swell and a single bell.
    add(fx, reverb(impact(1.0), mix=0.5), 0.72, 0.9)
    add(music, reverb(bell(note('D', 5), 4.0, gain=1.2), mix=0.55, size=1.3), 0.9, 0.8)
    add(music, reverb(bell(note('A', 5), 3.4, gain=0.7), mix=0.55, size=1.3), 1.6, 0.7)

    # The leaf rises into frame.
    add(fx, whoosh(1.6, 1.0), 4.9)
    add(fx, reverb(impact(0.55), mix=0.45), 5.45, 0.8)

    # Each ingredient lands on a chime, with air moving underneath it.
    for at, freq in ((10.8, note('F#', 6)), (17.0, note('D', 6)), (23.2, note('B', 5))):
        add(fx, whoosh(1.2, 0.75), at - 0.55)
        add(music, reverb(bell(freq, 3.0, gain=0.85), mix=0.5, size=1.2), at + 0.3, 0.8)

    # Diving inside the leaf.
    add(fx, riser(2.2, 1.0), CUTS[0] - 2.2)
    add(fx, whoosh(1.8, 1.25), CUTS[0] - 0.75)
    add(fx, reverb(impact(1.0), mix=0.5), CUTS[0], 0.95)
    add(music, reverb(bell(note('C#', 6), 3.6, gain=0.8), mix=0.55, size=1.25), CUTS[0] + 0.25, 0.7)

    # Water splits: a bright shower of fragments.
    add(fx, reverb(sparkle(18, 0.9, base=1600, gain=1.0), mix=0.45), 33.15, 0.85)
    add(fx, whoosh(0.9, 0.55, rise=False), 33.2)

    # Glucose assembles, oxygen lifts away.
    add(fx, whoosh(1.4, 0.7), 36.8)
    for k in range(6):
        add(fx, tick(0.35, bright=9000), 38.2 + k * 0.42)
    add(music, reverb(bell(note('D', 6), 3.2, gain=0.75), mix=0.5), 37.6, 0.7)
    add(music, reverb(bell(note('A', 6), 2.6, gain=0.5), mix=0.5), 41.6, 0.6)

    # The equation assembles term by term.
    add(fx, riser(1.8, 0.8), CUTS[1] - 1.8)
    add(fx, whoosh(1.6, 1.1), CUTS[1] - 0.7)
    add(fx, reverb(impact(0.85), mix=0.5), CUTS[1], 0.9)
    eq_notes = [('B', 5), ('D', 6), ('E', 6), ('F#', 6), ('A', 6)]
    for k, (n, o) in enumerate(eq_notes):
        at = CUTS[1] + 0.95 + k * 0.28
        add(music, reverb(bell(note(n, o), 2.4, gain=0.55), mix=0.5), at, 0.75)
        add(fx, tick(0.30, bright=9500), at)

    # Payoff: the sky opens up.
    add(fx, riser(2.4, 1.0), CUTS[2] - 2.4)
    add(fx, whoosh(2.0, 1.3), CUTS[2] - 0.9)
    add(fx, reverb(impact(1.1), mix=0.55), CUTS[2], 1.0)
    for k, (n, o) in enumerate((('D', 5), ('F#', 5), ('A', 5), ('D', 6))):
        add(music, reverb(bell(note(n, o), 5.0, gain=0.85), mix=0.6, size=1.4),
            CUTS[2] + 0.35 + k * 0.34, 0.75)

    # Wordmark.
    add(music, reverb(bell(note('D', 6), 5.0, gain=0.7), mix=0.62, size=1.45), 58.5, 0.8)

    # ---- mix --------------------------------------------------------------
    mix = music * 0.90 + fx * 0.78

    # Width without wrecking mono: both sides keep the full centre and add a
    # quiet, differently-delayed tap, so channel correlation stays high.
    def tap(seconds, gain):
        d = n_samples(seconds)
        return np.concatenate([np.zeros(d), mix[:-d]]) * gain

    left = mix + tap(0.013, 0.16)
    right = mix + tap(0.021, 0.16)

    out = stereo(left, right)

    # Master: soft knee limiting, a light high shelf, and top-and-tail fades.
    out[:, 0] = hp(out[:, 0], 30.0)
    out[:, 1] = hp(out[:, 1], 30.0)
    out = level(out)
    out = np.tanh(out * 1.35) * 0.9
    peak = np.max(np.abs(out))
    if peak > 0:
        out *= 0.85 / peak

    fade_in = n_samples(0.6)
    fade_out = n_samples(1.6)
    out[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    out[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    return out


def write_wav(path: str, data: np.ndarray) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(data, -1.0, 1.0)
    pcm = (pcm * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'out', 'score.wav'))
    args = ap.parse_args()
    data = build()
    write_wav(os.path.abspath(args.out), data)
    rms = np.sqrt(np.mean(data ** 2))
    print(f'wrote {os.path.abspath(args.out)}  {len(data) / SR:.2f}s  '
          f'peak {np.max(np.abs(data)):.3f}  rms {rms:.3f} ({20 * math.log10(rms):.1f} dBFS)')


if __name__ == '__main__':
    main()
