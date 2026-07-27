// Small maths + text helpers shared by the scene.
// Everything here is a pure function of the animation clock so that a frame
// rendered at t always looks identical, however fast the renderer is going.

import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, x) => a + (b - a) * x;
export const invlerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));

/** Normalised progress through [t0, t1], clamped to 0..1. */
export const span = (t, t0, t1) => clamp(invlerp(t0, t1, t));

// --- Easing -----------------------------------------------------------------
// The house style: slow out of the gate, long confident glide, gentle landing.
export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
export const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
export const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);
export const easeInCubic = (x) => x * x * x;
export const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeInOutQuint = (x) =>
  x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

/** Fade in over `fin`, hold, fade out over `fout` — in absolute seconds. */
export function envelope(t, t0, t1, fin = 0.6, fout = 0.6) {
  if (t <= t0 || t >= t1) return 0;
  const up = easeOutCubic(span(t, t0, t0 + fin));
  const down = 1 - easeInCubic(span(t, t1 - fout, t1));
  return Math.min(up, down);
}

/** Deterministic RNG so every render of the film is byte-for-byte the same. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Rich text --------------------------------------------------------------
// Copy is authored as plain strings with `_` marking a subscript run, so the
// chemistry reads correctly ("H_2O", "C_6H_12O_6") without relying on font
// coverage of the Unicode subscript block.

const SUB_SCALE = 0.62;
const SUB_DROP = 0.2;

/** Split "H_2O" into [{text:'H'},{text:'2',sub:true},{text:'O'}]. */
export function parseRich(str) {
  const runs = [];
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '_') {
      if (buf) runs.push({ text: buf, sub: false });
      buf = '';
      let j = i + 1;
      let sub = '';
      while (j < str.length && /[0-9]/.test(str[j])) sub += str[j++];
      if (sub) runs.push({ text: sub, sub: true });
      i = j - 1;
    } else {
      buf += ch;
    }
  }
  if (buf) runs.push({ text: buf, sub: false });
  return runs;
}

function fontString(weight, px) {
  return `${weight} ${px}px Inter, -apple-system, sans-serif`;
}

/** Per-character advances for a rich string, honouring letter-spacing. */
export function measureRich(ctx, str, { size, weight, tracking }) {
  const runs = parseRich(str);
  const glyphs = [];
  let x = 0;
  for (const run of runs) {
    const px = run.sub ? size * SUB_SCALE : size;
    ctx.font = fontString(weight, px);
    ctx.letterSpacing = `${tracking}px`;
    for (const ch of run.text) {
      const w = ctx.measureText(ch).width;
      glyphs.push({
        ch,
        x,
        w,
        px,
        dy: run.sub ? size * SUB_DROP : 0,
        weight,
      });
      x += w;
    }
  }
  return { glyphs, width: x };
}

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

export function measureText(str, opts) {
  return measureRich(measureCtx, str, opts);
}

/**
 * Draw a rich string onto its own canvas and return a texture plus the plane
 * size in layout pixels. `dpr` oversamples so the type stays crisp when the
 * plane is pushed toward camera.
 */
export function makeTextTexture(str, opts) {
  const {
    size = 48,
    weight = 300,
    tracking = 0,
    color = '#ffffff',
    dpr = 2,
    pad = Math.ceil(size * 0.45),
  } = opts;

  const m = measureText(str, { size, weight, tracking });
  const w = Math.ceil(m.width + pad * 2);
  const h = Math.ceil(size * 1.6 + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.ceil(w * dpr));
  canvas.height = Math.max(2, Math.ceil(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;

  const baseline = pad + size * 1.06;
  for (const g of m.glyphs) {
    ctx.font = fontString(g.weight, g.px);
    ctx.letterSpacing = `${tracking}px`;
    ctx.fillText(g.ch, pad + g.x, baseline + g.dy);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // already sRGB bytes; pass straight through
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 8;
  return { tex, width: w, height: h, textWidth: m.width, glyphs: m.glyphs, pad };
}


/** Soft round sprite used for photons, dust and bloom seeds. */
export function radialSprite(inner = '#ffffff', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

