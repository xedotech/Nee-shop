// Typography layer. Text lives in its own perspective scene sitting on top of
// the 3D render, so lines can travel in depth (and pick up real perspective)
// while staying pixel-crisp and free of bloom.

import * as THREE from 'three';
import { makeTextTexture, clamp, easeOutQuint, easeInCubic, easeOutCubic, span } from './util.js';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Camera whose frustum is exactly STAGE_W x STAGE_H units at z = 0. */
export function makeUiCamera() {
  const fov = 35;
  const dist = STAGE_H / 2 / Math.tan((fov * Math.PI) / 360);
  const cam = new THREE.PerspectiveCamera(fov, STAGE_W / STAGE_H, 10, 6000);
  cam.position.set(0, 0, dist);
  cam.lookAt(0, 0, 0);
  return cam;
}

const STYLES = {
  title: { size: 104, weight: 200, tracking: 26, color: '#ffffff', perChar: true },
  sub: { size: 34, weight: 300, tracking: 1.2, color: 'rgba(226,240,255,0.78)', perChar: false },
  kicker: { size: 21, weight: 600, tracking: 7.5, color: 'rgba(126,240,178,0.95)', perChar: false },
  head: { size: 86, weight: 200, tracking: 1.5, color: '#ffffff', perChar: true },
  body: { size: 31, weight: 300, tracking: 0.5, color: 'rgba(226,240,255,0.80)', perChar: false },
  statement: { size: 62, weight: 200, tracking: 1.0, color: '#ffffff', perChar: true },
  eq: { size: 62, weight: 300, tracking: 1.0, color: '#ffffff', perChar: false },
  eqlabel: { size: 21, weight: 500, tracking: 3.6, color: 'rgba(186,218,238,0.85)', perChar: false },
  wordmark: { size: 42, weight: 300, tracking: 15, color: 'rgba(255,255,255,0.94)', perChar: true },
};

/**
 * Build one line of type. `perChar` slices a single line texture into one
 * plane per glyph via UV windows, which keeps the reveal cheap but lets each
 * character animate on its own delay.
 */
export function makeLine(text, styleName, opts = {}) {
  const style = { ...STYLES[styleName], ...opts };
  const { tex, width, height, glyphs, pad } = makeTextTexture(text, style);

  const group = new THREE.Group();
  const chars = [];

  const mat = () =>
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      opacity: 1,
    });

  if (style.perChar) {
    for (const g of glyphs) {
      if (g.ch === ' ') continue;
      const x0 = pad + g.x;
      const w = g.w;
      const geo = new THREE.PlaneGeometry(w, height);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        uv.setX(i, (x0 + u * w) / width);
      }
      uv.needsUpdate = true;
      const mesh = new THREE.Mesh(geo, mat());
      mesh.position.x = x0 + w / 2 - width / 2;
      group.add(mesh);
      chars.push(mesh);
    }
  } else {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat());
    group.add(mesh);
    chars.push(mesh);
  }

  group.renderOrder = 20;
  group.userData = { width, height, chars, style };
  return group;
}

/** Horizontal anchoring in stage pixels. */
export function place(line, { x = 0, y = 0, align = 'center' } = {}) {
  const w = line.userData.width;
  let ox = 0;
  if (align === 'left') ox = w / 2;
  else if (align === 'right') ox = -w / 2;
  line.userData.home = new THREE.Vector3(x + ox, y, 0);
  line.position.copy(line.userData.home);
  return line;
}

/**
 * The house text move: rise, fade and settle out of depth on the way in;
 * drift back and dissolve on the way out. Chars can be staggered.
 */
export function animateLine(line, t, t0, t1, opts = {}) {
  const {
    inDur = 0.95,
    outDur = 0.55,
    stagger = 0.024,
    rise = 30,
    depth = 170,
    exitDepth = 90,
    exitRise = 14,
  } = opts;

  const chars = line.userData.chars;
  const home = line.userData.home || new THREE.Vector3();
  const n = chars.length;
  const staggerTotal = Math.min(stagger * n, 0.62);
  const per = n > 1 ? staggerTotal / (n - 1) : 0;

  let anyVisible = false;
  const out = easeInCubic(span(t, t1 - outDur, t1));

  for (let i = 0; i < n; i++) {
    const c = chars[i];
    const d = per * i;
    const inP = easeOutQuint(span(t, t0 + d, t0 + d + inDur));
    const a = clamp(inP * (1 - out));
    c.material.opacity = a;
    c.visible = a > 0.002;
    if (c.visible) anyVisible = true;
    const baseX = c.userData.baseX !== undefined ? c.userData.baseX : (c.userData.baseX = c.position.x);
    c.position.set(
      baseX,
      (1 - inP) * -rise + out * exitRise,
      (1 - inP) * -depth + out * exitDepth
    );
    c.rotation.x = (1 - inP) * -0.16;
  }

  line.visible = anyVisible;
  line.position.copy(home);
  return anyVisible;
}

/** Soft dark gradient behind copy so type stays readable over bright frames. */
export function makeScrim() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.52)');
  g.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE_W * 1.05, STAGE_H * 0.62),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      opacity: 0,
    })
  );
  mesh.position.set(0, -STAGE_H * 0.5 + STAGE_H * 0.31, -6);
  mesh.renderOrder = 5;
  return mesh;
}

/** Full-frame light wipe used to hide cuts between sets. */
export function makeFlash() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE_W * 1.4, STAGE_H * 1.4),
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.position.z = 20;
  mesh.renderOrder = 100;
  return mesh;
}

/** Black cover for the open and the close. */
export function makeFade() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE_W * 1.4, STAGE_H * 1.4),
    new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
  );
  mesh.position.z = 30;
  mesh.renderOrder = 120;
  return mesh;
}

/** Hairline progress rule along the bottom — a quiet nod to the running time. */
export function makeProgressRule(duration) {
  const group = new THREE.Group();
  const y = -STAGE_H / 2 + 44;
  const w = 620;
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 1.5),
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
  );
  track.position.set(0, y, 0);
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1.5),
    new THREE.MeshBasicMaterial({
      color: '#7ef0b2',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
  );
  fill.position.set(0, y, 1);
  group.add(track, fill);
  group.renderOrder = 30;
  group.userData.update = (t) => {
    const p = clamp(t / duration);
    fill.scale.x = Math.max(0.001, p * w);
    fill.position.x = -w / 2 + (p * w) / 2;
    const a = easeOutCubic(span(t, 1.2, 2.4)) * (1 - easeInCubic(span(t, 58.4, 59.4)));
    track.material.opacity = 0.12 * a;
    fill.material.opacity = 0.42 * a;
    group.visible = a > 0.01;
  };
  return group;
}
