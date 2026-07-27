// The cast: leaf, sun, molecules, chloroplast, tree, and the particle systems
// that hold the shots together. Builders only — all animation lives in story.js.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, radialSprite } from './util.js';

export const PALETTE = {
  leafDeep: new THREE.Color('#0b3a24'),
  leafMid: new THREE.Color('#186a41'),
  leafLit: new THREE.Color('#49c97c'),
  mint: new THREE.Color('#6fdfa4'),
  sun: new THREE.Color('#ffd9a0'),
  sunHot: new THREE.Color('#fff3dc'),
  water: new THREE.Color('#4bb8ff'),
  co2: new THREE.Color('#b39cff'),
  oxygen: new THREE.Color('#8ff5ff'),
  sugar: new THREE.Color('#ffd36e'),
  atomO: new THREE.Color('#ff6f61'),
  atomH: new THREE.Color('#eef4ff'),
  atomC: new THREE.Color('#7f8a9c'),
  bond: new THREE.Color('#aab4c6'),
};

// --- Leaf -------------------------------------------------------------------

/**
 * A parametric leaf blade: an ovate outline that tapers to a point, cupped
 * across its width and drooping toward the tip so it reads as a solid in 3D.
 */
export function makeLeafGeometry({ length = 4.6, width = 1.5, segU = 160, segV = 40 } = {}) {
  const pos = [];
  const uvs = [];
  const idx = [];

  const halfWidth = (u) => {
    const s = Math.sin(Math.PI * Math.pow(u, 0.72));
    const serration = 1 + 0.022 * Math.sin(u * 46.0);
    return width * Math.pow(Math.max(s, 0), 0.85) * serration;
  };

  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    const w = halfWidth(u);
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * 2 - 1;
      const x = u * length;
      const y = v * w;
      // Cupped across the blade, gently falling away along its length.
      const cup = 0.34 * (y * y) / Math.max(width, 0.001);
      const droop = -0.62 * Math.pow(u, 2.3);
      const ripple = 0.05 * Math.sin(u * 9.0) * (1 - Math.abs(v));
      pos.push(x, y, cup + droop + ripple);
      uvs.push(u, j / segV);
    }
  }

  const row = segV + 1;
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.translate(-length * 0.42, 0, 0);
  return geo;
}

const LEAF_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LEAF_FRAG = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uLit;
  uniform vec3 uRim;
  uniform vec3 uLightDir;
  uniform float uCharge;   // 0..1 how energised the blade looks
  uniform float uSweep;    // position of the light sweep along the blade
  uniform float uSweepAmt;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;

    float ndl = max(dot(n, normalize(uLightDir)), 0.0);
    float wrap = ndl * 0.88 + 0.16;                       // soft, waxy falloff
    float fres = pow(1.0 - clamp(dot(n, normalize(vViewDir)), 0.0, 1.0), 2.6);

    // Blade colour: deeper at the midrib, brighter toward the thin edges.
    float edge = smoothstep(0.0, 0.55, abs(vUv.y - 0.5) * 2.0);
    vec3 base = mix(uDeep, uMid, edge * 0.85 + 0.15);
    base = mix(base, uLit, uCharge * 0.26);

    // Venation: one midrib plus lateral veins fanning toward the tip.
    float d = abs(vUv.y - 0.5);
    float mid = 1.0 - smoothstep(0.006, 0.020, d);
    float f = fract(vUv.x * 11.0 - d * 7.0);
    float lat = (1.0 - smoothstep(0.010, 0.055, min(f, 1.0 - f)))
              * smoothstep(0.015, 0.10, d)
              * (1.0 - smoothstep(0.80, 0.99, vUv.x));
    float veins = clamp(max(mid, lat * 0.8), 0.0, 1.0);
    veins *= 1.0 - smoothstep(0.40, 0.50, d);             // fade before the edge

    float sweep = exp(-pow((vUv.x - uSweep) * 5.5, 2.0)) * uSweepAmt;

    vec3 col = base * wrap;
    col += uLit * veins * (0.07 + 0.34 * uCharge);
    col += uLit * veins * sweep * 0.55;
    col += uRim * fres * (0.34 + 0.26 * uCharge);
    col += uLit * sweep * 0.09;

    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function makeLeaf(opts = {}) {
  const geo = makeLeafGeometry(opts);
  const mat = new THREE.ShaderMaterial({
    vertexShader: LEAF_VERT,
    fragmentShader: LEAF_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      uDeep: { value: PALETTE.leafDeep.clone() },
      uMid: { value: PALETTE.leafMid.clone() },
      uLit: { value: PALETTE.leafLit.clone() },
      uRim: { value: PALETTE.mint.clone() },
      uLightDir: { value: new THREE.Vector3(-0.5, 0.7, 0.6).normalize() },
      uCharge: { value: 0 },
      uSweep: { value: -1 },
      uSweepAmt: { value: 0 },
      uOpacity: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.uniforms = mat.uniforms;
  return mesh;
}

/** Thin stem + petiole so the blade does not float unattached. */
export function makeStem() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.93, 0, 0),
    new THREE.Vector3(-2.62, -0.22, 0.05),
    new THREE.Vector3(-3.08, -1.10, 0.09),
    new THREE.Vector3(-3.30, -3.40, 0.14),
    new THREE.Vector3(-3.46, -6.20, 0.18),
    new THREE.Vector3(-3.55, -9.50, 0.22),
  ]);
  const geo = new THREE.TubeGeometry(curve, 64, 0.052, 12, false);
  const mat = new THREE.MeshStandardMaterial({
    color: '#2c6b40',
    emissive: new THREE.Color('#0d3a22'),
    roughness: 0.6,
    metalness: 0.0,
    transparent: true,
  });
  return new THREE.Mesh(geo, mat);
}

// --- Sun --------------------------------------------------------------------

export function makeSun() {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 48, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.sunHot, transparent: true, toneMapped: false })
  );
  group.add(core);

  const glowTex = radialSprite('rgba(255,236,200,1)', 'rgba(255,180,90,0)', 256);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: PALETTE.sun,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
  );
  halo.scale.setScalar(2.7);
  group.add(halo);

  const bloom = halo.clone();
  bloom.material = halo.material.clone();
  bloom.material.opacity = 0.30;
  bloom.scale.setScalar(6.0);
  group.add(bloom);

  group.userData = { core, halo, bloom };
  return group;
}

// --- Particle systems -------------------------------------------------------

/** Slow drifting motes; gives every wide shot a sense of volume. */
export function makeDust(count = 1400, radius = 26) {
  const rnd = mulberry32(9128);
  const seeds = new Float32Array(count * 4);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds[i * 4 + 0] = (rnd() * 2 - 1) * radius;
    seeds[i * 4 + 1] = (rnd() * 2 - 1) * radius * 0.62;
    seeds[i * 4 + 2] = (rnd() * 2 - 1) * radius * 0.7 - 4;
    seeds[i * 4 + 3] = rnd() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.075,
    map: radialSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64),
    color: new THREE.Color('#cfe9ff'),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData = {
    seeds,
    update(t) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const sx = seeds[i * 4], sy = seeds[i * 4 + 1], sz = seeds[i * 4 + 2], ph = seeds[i * 4 + 3];
        p[i * 3 + 0] = sx + Math.sin(t * 0.16 + ph) * 0.55;
        p[i * 3 + 1] = sy + Math.cos(t * 0.13 + ph * 1.7) * 0.45 + t * 0.035;
        p[i * 3 + 2] = sz + Math.sin(t * 0.11 + ph * 0.6) * 0.4;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
  return points;
}

/**
 * Photons streaming from the sun into the blade. Each one is a pure function
 * of (t, index), so scrubbing the timeline is exact.
 */
export function makePhotons(count = 260) {
  const rnd = mulberry32(4242);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4 + 0] = rnd();                      // lane offset
    seeds[i * 4 + 1] = rnd();                      // phase
    seeds[i * 4 + 2] = 0.75 + rnd() * 0.6;         // speed
    seeds[i * 4 + 3] = rnd();                      // lateral wobble seed
  }
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.3,
    map: radialSprite('rgba(255,246,222,1)', 'rgba(255,200,120,0)', 128),
    color: PALETTE.sun,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  points.userData = {
    seeds,
    /** @param {THREE.Vector3} a source @param {THREE.Vector3} b target plane centre */
    update(t, a, b, spread = 3.0) {
      from.copy(a);
      to.copy(b);
      const p = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const lane = seeds[i * 4], ph = seeds[i * 4 + 1], sp = seeds[i * 4 + 2], wob = seeds[i * 4 + 3];
        const k = (ph + t * 0.30 * sp) % 1;
        const ox = (lane * 2 - 1) * spread;
        const oz = (wob * 2 - 1) * spread * 0.8;
        p[i * 3 + 0] = from.x + (to.x + ox - from.x) * k;
        p[i * 3 + 1] = from.y + (to.y - from.y) * k + Math.sin(k * 6.28 + ph * 9) * 0.18;
        p[i * 3 + 2] = from.z + (to.z + oz - from.z) * k;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
  return points;
}

// --- Molecules --------------------------------------------------------------

const atomGeo = new THREE.SphereGeometry(1, 32, 24);
const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

function atomMaterial(color, emissiveScale = 0.22) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(emissiveScale),
    roughness: 0.28,
    metalness: 0.05,
    transparent: true,
  });
}

/**
 * Materials are per-molecule, never shared across instances: every molecule
 * fades on its own schedule, and a shared material would fade them all.
 */
function atomMatFactory() {
  const cache = new Map();
  return (color) => {
    const key = color.getHexString();
    if (!cache.has(key)) cache.set(key, atomMaterial(color));
    return cache.get(key);
  };
}

function addBond(group, a, b, radius = 0.055, color = PALETTE.bond) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    bondGeo,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.18),
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
    })
  );
  mesh.scale.set(radius, len, radius);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  group.add(mesh);
  return mesh;
}

/**
 * Build a ball-and-stick molecule with a coloured halo so each species is
 * instantly recognisable at a glance.
 */
export function makeMolecule(spec, haloColor) {
  const group = new THREE.Group();
  const atomMat = atomMatFactory();
  const atomMeshes = [];
  for (const a of spec.atoms) {
    const m = new THREE.Mesh(atomGeo, atomMat(a.color));
    m.scale.setScalar(a.r);
    m.position.copy(a.pos);
    m.userData.isAtom = true;
    group.add(m);
    atomMeshes.push(m);
  }
  for (const [i, j, double] of spec.bonds) {
    const a = spec.atoms[i].pos;
    const b = spec.atoms[j].pos;
    if (double) {
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const off = new THREE.Vector3(0, 0, 1).cross(dir).normalize().multiplyScalar(0.075);
      if (off.lengthSq() < 1e-6) off.set(0, 0.075, 0);
      addBond(group, a.clone().add(off), b.clone().add(off), 0.042);
      addBond(group, a.clone().sub(off), b.clone().sub(off), 0.042);
    } else {
      addBond(group, a, b);
    }
  }
  if (haloColor) {
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialSprite('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 128),
        color: haloColor,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        toneMapped: false,
      })
    );
    halo.scale.setScalar((spec.halo || 3.0) * 0.62);
    group.add(halo);
    group.userData.halo = halo;
  }
  group.userData.atoms = atomMeshes;
  return group;
}

export const SPECS = {
  water: {
    halo: 2.6,
    atoms: [
      { pos: new THREE.Vector3(0, 0, 0), r: 0.4, color: PALETTE.atomO },
      { pos: new THREE.Vector3(-0.49, 0.39, 0), r: 0.22, color: PALETTE.atomH },
      { pos: new THREE.Vector3(0.49, 0.39, 0), r: 0.22, color: PALETTE.atomH },
    ],
    bonds: [[0, 1], [0, 2]],
  },
  co2: {
    halo: 3.0,
    atoms: [
      { pos: new THREE.Vector3(0, 0, 0), r: 0.34, color: PALETTE.atomC },
      { pos: new THREE.Vector3(-0.74, 0, 0), r: 0.4, color: PALETTE.atomO },
      { pos: new THREE.Vector3(0.74, 0, 0), r: 0.4, color: PALETTE.atomO },
    ],
    bonds: [[0, 1, true], [0, 2, true]],
  },
  o2: {
    halo: 2.6,
    atoms: [
      { pos: new THREE.Vector3(-0.38, 0, 0), r: 0.4, color: PALETTE.atomO },
      { pos: new THREE.Vector3(0.38, 0, 0), r: 0.4, color: PALETTE.atomO },
    ],
    bonds: [[0, 1, true]],
  },
  hydrogen: {
    halo: 1.8,
    atoms: [
      { pos: new THREE.Vector3(-0.2, 0, 0), r: 0.22, color: PALETTE.atomH },
      { pos: new THREE.Vector3(0.2, 0, 0), r: 0.22, color: PALETTE.atomH },
    ],
    bonds: [[0, 1]],
  },
};

/** Stylised glucose: a six-membered ring wearing its hydroxyl groups. */
export function makeGlucose() {
  const R = 0.92;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const pos = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, Math.sin(i * 1.7) * 0.10);
    atoms.push({ pos, r: i === 5 ? 0.36 : 0.32, color: i === 5 ? PALETTE.atomO : PALETTE.atomC });
    bonds.push([i, (i + 1) % 6]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const out = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(R + 0.52);
    out.z = Math.sin(i * 2.2) * 0.24;
    const oIdx = atoms.length;
    atoms.push({ pos: out, r: 0.24, color: PALETTE.atomO });
    bonds.push([i, oIdx]);
    const h = out.clone().multiplyScalar(1.22);
    h.z += 0.16;
    atoms.push({ pos: h, r: 0.15, color: PALETTE.atomH });
    bonds.push([oIdx, oIdx + 1]);
  }
  return makeMolecule({ atoms, bonds, halo: 5.0 }, PALETTE.sugar);
}

// --- Chloroplast ------------------------------------------------------------

const SHELL_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uOpacity;
  uniform float uPulse;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    // Double-sided: without flipping, every back face reads as pure rim and
    // the envelope turns into an opaque disc.
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float fres = pow(1.0 - clamp(dot(n, normalize(vViewDir)), 0.0, 1.0), 2.2);
    float band = 0.5 + 0.5 * sin(vLocal.y * 7.0 + uPulse * 6.28);
    vec3 col = uColor * (0.42 + 0.40 * band) + uRim * fres * 1.35;
    gl_FragColor = vec4(col, uOpacity * (0.10 + fres * 0.80));
  }
`;

export function makeChloroplast() {
  const group = new THREE.Group();

  const shellMat = new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: PALETTE.leafMid.clone() },
      uRim: { value: PALETTE.mint.clone() },
      uOpacity: { value: 1 },
      uPulse: { value: 0 },
    },
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.95, 64, 48), shellMat);
  shell.scale.set(1.0, 0.62, 0.78);
  group.add(shell);

  // Grana: stacks of thylakoid discs, the actual site of the light reactions.
  const rnd = mulberry32(777);
  const discGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.055, 28);
  const discMat = new THREE.MeshStandardMaterial({
    color: '#2fa863',
    emissive: new THREE.Color('#1a7a44'),
    emissiveIntensity: 1.0,
    roughness: 0.42,
    metalness: 0.05,
    transparent: true,
  });
  const stacks = [];
  for (let s = 0; s < 7; s++) {
    const stack = new THREE.Group();
    const n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Mesh(discGeo, discMat);
      d.position.y = i * 0.085 - (n - 1) * 0.0425;
      d.scale.setScalar(0.82 + rnd() * 0.35);
      stack.add(d);
    }
    const a = (s / 7) * Math.PI * 2 + rnd() * 0.7;
    const rad = 0.5 + rnd() * 1.15;
    stack.position.set(Math.cos(a) * rad * 0.82, (rnd() * 2 - 1) * 0.42, Math.sin(a) * rad * 0.66);
    stack.rotation.set((rnd() * 2 - 1) * 0.7, rnd() * Math.PI, (rnd() * 2 - 1) * 0.7);
    group.add(stack);
    stacks.push(stack);
  }

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialSprite('rgba(180,255,214,0.9)', 'rgba(60,220,140,0)', 256),
      color: PALETTE.leafLit,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      toneMapped: false,
    })
  );
  glow.scale.setScalar(5.0);
  group.add(glow);

  group.userData = { shell, shellMat, stacks, glow, discMat };
  return group;
}

// --- Tree -------------------------------------------------------------------

const UNIT_Y = new THREE.Vector3(0, 1, 0);
const UNIT_X = new THREE.Vector3(1, 0, 0);

/** Recursive branch skeleton; returns merged trunk geometry + leaf transforms. */
export function makeTree() {
  const rnd = mulberry32(20260727);
  const parts = [];
  const leaves = [];

  const grow = (origin, dir, len, rad, depth) => {
    const end = origin.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(rad * 0.68, rad, len, 8, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(
      origin.clone().addScaledVector(dir, len * 0.5),
      q,
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    parts.push(geo);

    if (depth <= 1) {
      const n = depth === 0 ? 12 : 4;
      for (let i = 0; i < n; i++) {
        const p = end.clone().add(
          new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 1.05, rnd() - 0.5).multiplyScalar(len * 2.0)
        );
        leaves.push({
          pos: p,
          rot: new THREE.Euler(rnd() * 3.14, rnd() * 6.28, rnd() * 3.14),
          scale: 0.11 + rnd() * 0.09,
          tint: rnd(),
        });
      }
      if (depth === 0) return;
    }

    // Children fan out evenly around the parent branch, then lean back toward
    // the light — without that bias the canopy grows sideways and lopsided.
    const branches = depth > 2 ? 3 : 3;
    const helper = Math.abs(dir.y) > 0.95 ? UNIT_X : UNIT_Y;
    const side = new THREE.Vector3().crossVectors(dir, helper).normalize();
    const side2 = new THREE.Vector3().crossVectors(dir, side).normalize();
    const twist = depth * 1.31 + rnd() * 0.8;
    for (let i = 0; i < branches; i++) {
      const az = (i / branches) * Math.PI * 2 + twist;
      const spread = 0.34 + rnd() * 0.34;
      const nd = dir
        .clone()
        .addScaledVector(side, Math.cos(az) * spread)
        .addScaledVector(side2, Math.sin(az) * spread)
        .normalize()
        .lerp(UNIT_Y, 0.16)
        .normalize();
      grow(end, nd, len * (0.62 + rnd() * 0.20), rad * 0.64, depth - 1);
    }
  };

  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 1, 0).normalize(), 3.4, 0.40, 4);

  const trunkGeo = BufferGeometryUtils.mergeGeometries(parts, false);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: '#4a3a2e',
    emissive: new THREE.Color('#160f0a'),
    roughness: 0.85,
    metalness: 0.0,
    transparent: true,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);

  const group = new THREE.Group();
  group.add(trunk);

  const leafGeo = makeLeafGeometry({ length: 1.0, width: 0.36, segU: 14, segV: 6 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: new THREE.Color('#0f3f26'),
    emissiveIntensity: 0.6,
    roughness: 0.5,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const inst = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(leaves.length * 3), 3);
  const tintA = new THREE.Color('#17753f');
  const tintB = new THREE.Color('#57c47c');
  const tmpCol = new THREE.Color();
  const dummy = new THREE.Object3D();
  leaves.forEach((l, i) => {
    tmpCol.copy(tintA).lerp(tintB, l.tint * l.tint);
    inst.setColorAt(i, tmpCol);
    dummy.position.copy(l.pos);
    dummy.rotation.copy(l.rot);
    dummy.scale.setScalar(l.scale * 2.0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);

  group.userData = { trunk, inst, leafCount: leaves.length, leaves };
  return group;
}

/** Soft ground disc that fades out before it reaches the horizon. */
export function makeGround() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.60)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(130, 96),
    new THREE.MeshStandardMaterial({
      color: '#0f1712',
      emissive: new THREE.Color('#040705'),
      roughness: 0.95,
      metalness: 0,
      alphaMap: tex,
      transparent: true,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// --- Backdrop ---------------------------------------------------------------

/** A very dark, faintly graded backdrop so the frame never reads as flat black. */
export function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: new THREE.Color('#071a17') },
      uBottom: { value: new THREE.Color('#02040a') },
      uTint: { value: new THREE.Color('#0a2230') },
      uMix: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uTint; uniform float uMix;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 1.6));
        col = mix(col, uTint, uMix);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.userData.uniforms = mat.uniforms;
  return mesh;
}
