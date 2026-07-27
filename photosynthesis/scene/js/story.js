// The film itself: shot list, choreography and copy.
// `update(t)` fully describes the frame at time t — nothing integrates state,
// so any frame can be rendered in isolation and the result is identical.

import * as THREE from 'three';
import {
  span,
  clamp,
  lerp,
  envelope,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  easeOutQuart,
  easeOutExpo,
  mulberry32,
} from './util.js';
import {
  PALETTE,
  makeLeaf,
  makeStem,
  makeSun,
  makeDust,
  makePhotons,
  makeMolecule,
  makeGlucose,
  makeChloroplast,
  makeTree,
  makeBackdrop,
  makeGround,
  SPECS,
} from './objects.js';
import {
  makeLine,
  place,
  animateLine,
  makeScrim,
  makeFlash,
  makeFade,
  makeProgressRule,
  STAGE_W,
  STAGE_H,
} from './ui.js';

export const DURATION = 60.0;

// Scene boundaries, in seconds.
const S = {
  open: [0.0, 5.2],
  leaf: [5.2, 10.8],
  light: [10.8, 17.0],
  water: [17.0, 23.2],
  co2: [23.2, 29.6],
  inside: [29.6, 37.2],
  build: [37.2, 44.4],
  equation: [44.4, 52.0],
  payoff: [52.0, 60.0],
};

const CUTS = [S.inside[0], S.equation[0], S.payoff[0]];

// Each act gets its own pocket of world space; cuts between them are hidden
// under a light wipe.
const SET = {
  A: new THREE.Vector3(0, 0, 0),
  B: new THREE.Vector3(0, -60, 0),
  C: new THREE.Vector3(0, 60, 0),
  D: new THREE.Vector3(0, 140, 0),
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Framing note: through act one the camera looks slightly left of and below
// the blade, which parks the leaf up and to the right and leaves the lower-left
// quadrant dark for the type.
const SHOTS = [
  { t: S.open, set: 'A', from: { p: V(0, -0.55, 10.4), l: V(0, -0.75, 0), fov: 40 }, to: { p: V(0, -0.55, 8.2), l: V(0, -0.75, 0), fov: 40 }, ease: easeOutCubic },
  { t: S.leaf, set: 'A', from: { p: V(0, -0.55, 8.2), l: V(0, -0.75, 0), fov: 40 }, to: { p: V(2.6, 1.6, 8.4), l: V(0.35, 0.45, 0), fov: 38 }, ease: easeInOutCubic },
  { t: S.light, set: 'A', from: { p: V(2.6, 1.6, 8.4), l: V(0.35, 0.45, 0), fov: 38 }, to: { p: V(-1.5, 2.6, 8.8), l: V(0.55, 0.65, 0), fov: 38 }, ease: easeInOutCubic },
  { t: S.water, set: 'A', from: { p: V(-1.5, 2.6, 8.8), l: V(0.55, 0.65, 0), fov: 38 }, to: { p: V(-1.0, -0.9, 8.0), l: V(0.35, 0.05, 0), fov: 39 }, ease: easeInOutCubic },
  { t: S.co2, set: 'A', from: { p: V(-1.0, -0.9, 8.0), l: V(0.35, 0.05, 0), fov: 39 }, to: { p: V(2.4, 0.7, 7.4), l: V(0.5, 0.55, 0), fov: 38 }, ease: easeInOutCubic },
  { t: S.inside, set: 'B', from: { p: V(0.4, 1.6, 15.0), l: V(0, 0, 0), fov: 42 }, to: { p: V(-2.8, 1.9, 9.4), l: V(-0.5, 0.15, 0), fov: 42 }, ease: easeOutQuart },
  { t: S.build, set: 'B', from: { p: V(-2.8, 1.9, 9.4), l: V(-0.5, 0.15, 0), fov: 42 }, to: { p: V(3.2, 1.2, 10.6), l: V(2.2, -0.30, 1.4), fov: 40 }, ease: easeInOutCubic },
  { t: S.equation, set: 'C', from: { p: V(0, 0, 16.0), l: V(0, 0, 0), fov: 38 }, to: { p: V(0, 0, 14.8), l: V(0, 0, 0), fov: 38 }, ease: easeOutCubic },
  { t: S.payoff, set: 'D', from: { p: V(1.2, 3.6, 12.5), l: V(-0.6, 5.0, 0), fov: 40 }, to: { p: V(-2.2, 7.0, 24.5), l: V(0.2, 6.2, 0), fov: 34 }, ease: easeOutCubic },
];

/** Point on the screen (NDC) at a fixed distance in front of the camera. */
function screenToWorld(camera, ndcX, ndcY, dist, out = new THREE.Vector3()) {
  out.set(ndcX, ndcY, 0.5).unproject(camera);
  out.sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
  return out;
}

export function buildStory({ scene, uiScene, camera }) {
  const rnd = mulberry32(31337);

  // ---------------------------------------------------------------- lighting
  const keyLight = new THREE.DirectionalLight('#fff1d8', 2.5);
  keyLight.position.set(-5, 7, 6);
  const fillLight = new THREE.DirectionalLight('#7cbcff', 0.85);
  fillLight.position.set(7, -2, 3);
  const rimLight = new THREE.DirectionalLight('#b6ffe2', 1.5);
  rimLight.position.set(0, 2, -9);
  scene.add(keyLight, fillLight, rimLight, new THREE.AmbientLight('#2b3a4a', 0.55));

  const backdrop = makeBackdrop();
  scene.add(backdrop);

  const dust = makeDust(1500, 22);
  scene.add(dust);

  // ------------------------------------------------------------------- set A
  const setA = new THREE.Group();
  setA.position.copy(SET.A);
  scene.add(setA);

  const sun = makeSun();
  setA.add(sun);

  const plant = new THREE.Group();
  plant.position.set(1.5, 0.35, 0);
  setA.add(plant);

  const leafGroup = new THREE.Group();
  const leaf = makeLeaf({ length: 4.6, width: 1.5 });
  const stem = makeStem();
  leafGroup.add(leaf, stem);
  plant.add(leafGroup);
  const leafU = leaf.userData.uniforms;

  const photons = makePhotons(300);
  setA.add(photons);

  // Water climbing the stem.
  const waterPath = new THREE.CatmullRomCurve3([
    V(-3.55, -9.5, 0.28),
    V(-3.42, -6.2, 0.24),
    V(-3.26, -3.4, 0.20),
    V(-3.04, -1.1, 0.16),
    V(-2.58, -0.22, 0.12),
    V(-1.60, 0.02, 0.22),
    V(0.30, 0.10, 0.30),
    V(1.90, 0.14, 0.34),
  ]);
  const risers = [];
  for (let i = 0; i < 16; i++) {
    const m = makeMolecule(SPECS.water, PALETTE.water);
    m.scale.setScalar(0.46);
    plant.add(m);
    risers.push({ mesh: m, phase: i / 16, spin: 0.6 + rnd() * 0.8, wob: rnd() * 6.28 });
  }

  // Carbon dioxide drifting in from the air.
  const drifters = [];
  for (let i = 0; i < 12; i++) {
    const m = makeMolecule(SPECS.co2, PALETTE.co2);
    m.scale.setScalar(0.44);
    plant.add(m);
    const side = i % 2 === 0 ? -1 : 1;
    drifters.push({
      mesh: m,
      from: V(side * (8.0 + rnd() * 3), 0.4 + rnd() * 4.6, -2 + rnd() * 6),
      to: V(0.5 + rnd() * 2.1, -0.15 + rnd() * 0.8, 0.35 + rnd() * 0.6),
      phase: i / 12,
      spin: 0.4 + rnd() * 0.7,
    });
  }

  // ------------------------------------------------------------------- set B
  const setB = new THREE.Group();
  setB.position.copy(SET.B);
  scene.add(setB);

  const chloroplast = makeChloroplast();
  setB.add(chloroplast);

  const splitters = [];
  for (let i = 0; i < 7; i++) {
    const m = makeMolecule(SPECS.water, PALETTE.water);
    const a = (i / 7) * Math.PI * 2;
    m.userData.home = V(Math.cos(a) * 3.1, Math.sin(a * 1.3) * 1.5, Math.sin(a) * 2.2);
    m.userData.seed = rnd();
    setB.add(m);
    splitters.push(m);
    // children: [O, H, H, bondA, bondB, halo]
    m.userData.hA = m.children[1];
    m.userData.hB = m.children[2];
    m.userData.hHomeA = m.children[1].position.clone();
    m.userData.hHomeB = m.children[2].position.clone();
    m.userData.bonds = [m.children[3], m.children[4]];
  }

  const oxygens = [];
  for (let i = 0; i < 7; i++) {
    const m = makeMolecule(SPECS.o2, PALETTE.oxygen);
    m.scale.setScalar(0.5);
    m.userData.seed = rnd();
    setB.add(m);
    oxygens.push(m);
  }

  const feeders = [];
  for (let i = 0; i < 6; i++) {
    const m = makeMolecule(SPECS.co2, PALETTE.co2);
    m.scale.setScalar(0.42);
    m.userData.from = V(-6 + rnd() * 2, -3.4 + rnd() * 6.8, -4 + rnd() * 6);
    m.userData.seed = rnd();
    setB.add(m);
    feeders.push(m);
  }

  const glucose = makeGlucose();
  glucose.position.set(2.9, -0.3, 1.4);
  glucose.scale.setScalar(0.72);
  setB.add(glucose);
  const glucoseAtoms = glucose.children.filter((c) => c.isMesh && c.userData.isAtom);
  const glucoseBonds = glucose.children.filter((c) => c.isMesh && !c.userData.isAtom);
  for (const c of glucoseAtoms) {
    c.userData.home = c.position.clone();
    c.userData.scatter = c.position
      .clone()
      .add(V((rnd() * 2 - 1) * 5.5, (rnd() * 2 - 1) * 4.2, (rnd() * 2 - 1) * 4.5));
    c.userData.delay = rnd() * 0.9;
    c.userData.homeScale = c.scale.x;
  }

  // ------------------------------------------------------------------- set C
  const eqMolecules = {
    co2: makeMolecule(SPECS.co2, PALETTE.co2),
    water: makeMolecule(SPECS.water, PALETTE.water),
    glucose: makeGlucose(),
    o2: makeMolecule(SPECS.o2, PALETTE.oxygen),
  };
  const eqSun = makeSun();
  const eqGroup = new THREE.Group();
  eqGroup.add(eqMolecules.co2, eqMolecules.water, eqSun, eqMolecules.glucose, eqMolecules.o2);
  eqMolecules.glucose.scale.setScalar(0.52);
  eqSun.scale.setScalar(0.42);
  scene.add(eqGroup);

  // ------------------------------------------------------------------- set D
  const setD = new THREE.Group();
  setD.position.copy(SET.D);
  scene.add(setD);

  const tree = makeTree();
  tree.position.set(-1.4, 0, 0);
  setD.add(tree);
  const treeDummy = new THREE.Object3D();
  const treeLeaves = tree.userData.leaves;
  const treeInst = tree.userData.inst;
  const treeDelays = treeLeaves.map(() => rnd());

  const ground = makeGround();
  ground.position.y = -0.05;
  setD.add(ground);

  const dawn = makeSun();
  dawn.position.set(3.2, 6.4, -15);
  dawn.scale.setScalar(2.6);
  setD.add(dawn);

  const breath = makePhotons(220);
  breath.material.color = PALETTE.oxygen.clone();
  breath.material.size = 0.16;
  setD.add(breath);

  // ---------------------------------------------------------------- typography
  const LEFT = -STAGE_W / 2 + 130;
  const lines = {};
  const add = (key, text, style, pos) => {
    const l = makeLine(text, style);
    place(l, pos);
    uiScene.add(l);
    l.visible = false;
    lines[key] = l;
    return l;
  };

  add('title', 'PHOTOSYNTHESIS', 'title', { x: 0, y: -196 });
  add('subtitle', 'How a leaf turns light into food', 'sub', { x: 0, y: -300 });

  add('leafLine', 'A leaf is a solar-powered kitchen.', 'statement', { x: 0, y: -318 });

  const block = (key, kicker, head, body) => {
    add(key + 'K', kicker, 'kicker', { x: LEFT, y: -180, align: 'left' });
    add(key + 'H', head, 'head', { x: LEFT, y: -252, align: 'left' });
    add(key + 'B', body, 'body', { x: LEFT, y: -330, align: 'left' });
  };

  block('light', 'INGREDIENT 01', 'SUNLIGHT', 'Chlorophyll — the pigment that makes leaves green — catches it.');
  block('water', 'INGREDIENT 02', 'WATER', 'H_2O, pulled up from the soil through the roots.');
  block('co2', 'INGREDIENT 03', 'CARBON DIOXIDE', 'CO_2 from the air, in through tiny pores called stomata.');
  block('inside', 'INSIDE EVERY LEAF', 'CHLOROPLASTS', 'Light energy splits water into hydrogen and oxygen.');
  block('sugar', 'WHAT COMES OUT', 'GLUCOSE', 'Carbon, hydrogen and oxygen rebuild into sugar — the plant’s food.');
  block('air', 'AND THE LEFTOVERS', 'OXYGEN', 'Spare oxygen atoms pair up and drift out as O_2.');

  add('eqKicker', 'THE WHOLE RECIPE', 'kicker', { x: 0, y: 252 });
  add('payoff1', 'Plants eat light.', 'statement', { x: 0, y: -372 });
  add('payoff2', 'The oxygen you breathe is what’s left over.', 'statement', { x: 0, y: -372 });
  add('wordmark', 'PHOTOSYNTHESIS', 'wordmark', { x: 0, y: -330 });

  // The equation, laid out term by term so molecules can sit over each term.
  const EQ_TERMS = [
    { text: '6 CO_2', label: 'carbon dioxide', mol: 'co2' },
    { text: '+', label: null, mol: null },
    { text: '6 H_2O', label: 'water', mol: 'water' },
    { text: '+', label: null, mol: null },
    { text: 'light', label: 'sunlight', mol: 'sun' },
    { text: 'ARROW', label: null, mol: null },
    { text: 'C_6H_12O_6', label: 'glucose', mol: 'glucose' },
    { text: '+', label: null, mol: null },
    { text: '6 O_2', label: 'oxygen', mol: 'o2' },
  ];

  const EQ_Y = -140;
  const eqItems = [];
  let cursor = 0;
  const GAP = 26;
  for (const term of EQ_TERMS) {
    let node;
    let w;
    if (term.text === 'ARROW') {
      node = makeArrow();
      w = 96;
      node.userData.chars = node.children;
      node.userData.width = w;
    } else {
      node = makeLine(term.text, 'eq');
      w = node.userData.width;
    }
    uiScene.add(node);
    node.visible = false;
    const item = { node, w, x: cursor + w / 2, term };
    if (term.label) {
      const lab = makeLine(term.label, 'eqlabel');
      uiScene.add(lab);
      lab.visible = false;
      item.label = lab;
    }
    eqItems.push(item);
    cursor += w + GAP;
  }
  const eqTotal = cursor - GAP;
  for (const item of eqItems) {
    const x = item.x - eqTotal / 2;
    item.node.userData.home = new THREE.Vector3(x, EQ_Y, 0);
    item.node.position.copy(item.node.userData.home);
    item.screenX = x;
    if (item.label) {
      item.label.userData.home = new THREE.Vector3(x, EQ_Y - 78, 0);
      item.label.position.copy(item.label.userData.home);
    }
  }

  function makeArrow() {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(56, 2.5),
      new THREE.MeshBasicMaterial({ color: '#7ef0b2', transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    );
    bar.position.x = -14;
    const shape = new THREE.Shape();
    shape.moveTo(0, 9);
    shape.lineTo(24, 0);
    shape.lineTo(0, -9);
    shape.closePath();
    const head = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: '#7ef0b2', transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    );
    head.position.x = 14;
    g.add(bar, head);
    g.renderOrder = 20;
    return g;
  }

  const scrim = makeScrim();
  const flash = makeFlash();
  const fade = makeFade();
  const rule = makeProgressRule(DURATION);
  uiScene.add(scrim, flash, fade, rule);

  // --------------------------------------------------------------- utilities
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  const activeShot = (t) => {
    for (let i = SHOTS.length - 1; i >= 0; i--) {
      if (t >= SHOTS[i].t[0]) return SHOTS[i];
    }
    return SHOTS[0];
  };

  function hideAll(objs) {
    for (const o of objs) o.visible = false;
  }

  function flashAmount(t) {
    let a = 0;
    for (const c of CUTS) {
      if (t > c - 0.30 && t < c + 0.55) {
        const up = t < c ? Math.pow(span(t, c - 0.30, c), 2.2) : 1;
        const down = t >= c ? 1 - easeOutCubic(span(t, c, c + 0.55)) : 1;
        a = Math.max(a, up * down * 0.92);
      }
    }
    return a;
  }

  // ----------------------------------------------------------------- update
  function update(t) {
    const shot = activeShot(t);
    const u = clamp(span(t, shot.t[0], shot.t[1]));
    const e = shot.ease(u);
    const off = SET[shot.set];

    camPos.lerpVectors(shot.from.p, shot.to.p, e).add(off);
    camLook.lerpVectors(shot.from.l, shot.to.l, e).add(off);
    camera.fov = lerp(shot.from.fov, shot.to.fov, e);

    // A whisper of handheld so nothing feels mechanically locked off.
    camPos.x += Math.sin(t * 0.47) * 0.055 + Math.sin(t * 0.19 + 1.3) * 0.035;
    camPos.y += Math.cos(t * 0.39 + 0.6) * 0.05;

    // The dive that ends act one.
    if (t > S.co2[1] - 0.75 && t < S.co2[1]) {
      const d = easeInCubic(span(t, S.co2[1] - 0.75, S.co2[1]));
      camPos.lerp(tmp.copy(camLook).add(V(0, 0, 1.1)), d * 0.86);
      camera.fov = lerp(camera.fov, 62, d);
    }

    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    // Needed before any screen-space placement below: lookAt only touches the
    // local transform, and a stale world matrix would misplace the equation.
    camera.updateMatrixWorld(true);

    dust.position.copy(camPos);
    dust.userData.update(t);
    dust.material.opacity = 0.42 * (1 - flashAmount(t) * 0.8);

    // ------------------------------------------------------------- backdrop
    // Each act sits in its own light: cool space outside, green inside the
    // leaf, near-black for the equation, warm low sun for the payoff.
    const bg = backdrop.userData.uniforms;
    if (shot.set === 'B') {
      bg.uTint.value.setRGB(0.007, 0.034, 0.020);
      bg.uMix.value = 0.92;
    } else if (shot.set === 'C') {
      bg.uTint.value.setRGB(0.010, 0.014, 0.024);
      bg.uMix.value = 0.86;
    } else if (shot.set === 'D') {
      const warm = easeInOutCubic(span(t, S.payoff[0], S.payoff[0] + 3.5));
      bg.uTint.value.setRGB(lerp(0.014, 0.038, warm), lerp(0.030, 0.038, warm), lerp(0.048, 0.040, warm));
      bg.uMix.value = 0.85;
    } else {
      bg.uTint.value.setRGB(0.02, 0.055, 0.075);
      bg.uMix.value = 0.55;
    }

    // ---------------------------------------------------------------- set A
    const inA = t < S.inside[0];
    setA.visible = inA;
    if (inA) {
      // Sun: ignition, then it takes its place off in the corner.
      const born = easeOutExpo(span(t, 0.18, 1.5));
      const travel = easeInOutCubic(span(t, S.leaf[0], S.leaf[0] + 3.2));
      sun.position.lerpVectors(V(0, 0, 0), V(-6.6, 3.9, 2.4), travel);
      const pulse = 1 + 0.045 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 5.3);
      sun.scale.setScalar(born * lerp(1, 0.52, travel) * pulse);
      sun.userData.bloom.material.opacity = 0.55 * lerp(1, 0.75, travel) * (0.7 + 0.3 * Math.sin(t * 1.7));

      // Leaf: rises, settles, then breathes.
      const arrive = easeOutQuart(span(t, S.leaf[0] + 0.15, S.leaf[0] + 2.6));
      leafGroup.position.set(0, lerp(-5.4, 0, arrive), lerp(-1.6, 0, arrive));
      leafGroup.rotation.set(
        lerp(-1.35, -0.30, arrive) + Math.sin(t * 0.42) * 0.035,
        lerp(1.15, 0.22, arrive) + Math.sin(t * 0.31 + 1.1) * 0.05,
        lerp(0.55, 0.06, arrive) + Math.cos(t * 0.37) * 0.02
      );
      const leafFade = envelope(t, S.leaf[0], S.inside[0] + 0.4, 0.5, 0.5);
      leafU.uOpacity.value = leafFade;
      stem.material.opacity = leafFade;

      const charge = easeOutCubic(span(t, S.light[0] + 0.6, S.light[0] + 3.0));
      leafU.uCharge.value = charge * (0.52 + 0.09 * Math.sin(t * 1.9));
      leafU.uLightDir.value.copy(sun.position).normalize();
      const sweepT = ((t - S.light[0]) % 2.6) / 2.6;
      leafU.uSweep.value = sweepT * 1.4 - 0.2;
      leafU.uSweepAmt.value = charge * 0.75;

      // Photons pour down the moment the light beat starts.
      const photonAmt =
        envelope(t, S.light[0] - 0.2, S.inside[0], 0.9, 0.5) *
        (t > S.light[1] ? 0.45 : 1.0);
      photons.material.opacity = photonAmt;
      photons.visible = photonAmt > 0.01;
      if (photons.visible) {
        photons.userData.update(t, sun.position, V(1.7, 0.45, 0.3), 2.8);
      }

      // Water climbing the stem.
      const waterAmt = envelope(t, S.water[0] - 0.4, S.co2[1] - 0.2, 0.8, 0.8);
      for (const r of risers) {
        const k = ((t - S.water[0]) * 0.155 + r.phase) % 1;
        const on = k < 0.94 ? 1 : 0;
        waterPath.getPointAt(clamp(k, 0, 1), tmp);
        r.mesh.position.copy(tmp);
        r.mesh.position.x += Math.sin(t * 1.4 + r.wob) * 0.07;
        r.mesh.position.z += Math.cos(t * 1.1 + r.wob) * 0.07;
        r.mesh.rotation.set(t * r.spin * 0.6, t * r.spin, 0);
        const fadeIn = clamp(k / 0.06);
        const fadeOut = 1 - clamp((k - 0.72) / 0.22);
        setGroupOpacity(r.mesh, waterAmt * on * fadeIn * fadeOut);
        r.mesh.scale.setScalar(0.34 * lerp(0.75, 1, fadeIn));
      }

      // Carbon dioxide arriving from the air.
      const co2Amt = envelope(t, S.co2[0] - 0.5, S.co2[1] - 0.1, 0.8, 0.6);
      for (const d of drifters) {
        const k = ((t - S.co2[0]) * 0.26 + d.phase) % 1;
        const ek = easeInOutCubic(k);
        d.mesh.position.lerpVectors(d.from, d.to, ek);
        d.mesh.position.y += Math.sin(t * 0.9 + d.phase * 9) * 0.25 * (1 - ek);
        d.mesh.rotation.set(t * d.spin * 0.5, t * d.spin, t * d.spin * 0.3);
        const fadeOut = 1 - clamp((k - 0.80) / 0.18);
        setGroupOpacity(d.mesh, co2Amt * clamp(k / 0.05) * fadeOut);
        d.mesh.scale.setScalar(0.40 * lerp(1.0, 0.6, ek));
      }
    }

    // ---------------------------------------------------------------- set B
    const inB = t >= S.inside[0] && t < S.equation[0];
    setB.visible = inB;
    if (inB) {
      const cIn = easeOutQuart(span(t, S.inside[0], S.inside[0] + 1.4));
      const cOut = 1 - easeInCubic(span(t, S.build[0] + 2.2, S.build[1]));
      chloroplast.userData.shellMat.uniforms.uOpacity.value = cIn * cOut;
      chloroplast.userData.shellMat.uniforms.uPulse.value = t * 0.22;
      chloroplast.rotation.y = 0.22 + t * 0.075;
      chloroplast.rotation.x = Math.sin(t * 0.21) * 0.09;
      chloroplast.scale.setScalar(lerp(0.86, 1.0, cIn));
      chloroplast.userData.glow.material.opacity = 0.30 * cOut * (0.8 + 0.35 * Math.sin(t * 2.4));
      chloroplast.userData.discMat.emissiveIntensity =
        0.8 + 0.7 * Math.sin(t * 3.1) * easeOutCubic(span(t, 31.5, 33.0));
      chloroplast.userData.discMat.opacity = cIn * cOut;
      chloroplast.userData.trunkOpacity = cOut;

      // The split: at 33.2s the light reaction tears the water apart.
      const SPLIT = 33.2;
      const splitP = easeOutQuart(span(t, SPLIT, SPLIT + 1.5));
      const waterVis = envelope(t, S.inside[0] + 0.5, S.build[0] + 1.2, 1.0, 0.9);
      for (let i = 0; i < splitters.length; i++) {
        const m = splitters[i];
        const s = m.userData.seed;
        const a = (i / splitters.length) * Math.PI * 2 + t * 0.10;
        const r = 2.9 + Math.sin(t * 0.5 + s * 6) * 0.28;
        m.position.set(
          Math.cos(a) * r,
          m.userData.home.y + Math.sin(t * 0.6 + s * 5) * 0.35,
          Math.sin(a) * r * 0.7
        );
        m.rotation.set(t * 0.4 + s, t * 0.55 + s * 2, 0);
        const push = splitP * (1.6 + s * 0.8);
        m.userData.hA.position.copy(m.userData.hHomeA).multiplyScalar(1 + push * 2.4);
        m.userData.hB.position.copy(m.userData.hHomeB).multiplyScalar(1 + push * 2.6);
        for (const b of m.userData.bonds) b.visible = splitP < 0.15;
        setGroupOpacity(m, waterVis * (1 - splitP * 0.55));
        m.scale.setScalar(0.52);
      }

      // Oxygen pairs form after the split and rise away.
      const oxAmt = envelope(t, SPLIT + 0.5, S.equation[0], 1.1, 0.6);
      for (let i = 0; i < oxygens.length; i++) {
        const m = oxygens[i];
        const s = m.userData.seed;
        const k = (t - SPLIT - 0.5) * 0.16 + s;
        const a = (i / oxygens.length) * Math.PI * 2 + 0.7;
        m.position.set(
          Math.cos(a) * (2.4 + s) + Math.sin(t * 0.7 + s * 4) * 0.3,
          -1.2 + ((k % 1) * 7.5),
          Math.sin(a) * (2.0 + s * 0.8)
        );
        m.rotation.set(t * 0.5 + s * 3, t * 0.62, t * 0.3);
        setGroupOpacity(m, oxAmt * Math.sin(clamp(k % 1) * Math.PI) * 1.1);
      }

      // Carbon dioxide feeding the build.
      const feedAmt = envelope(t, S.build[0] - 0.6, S.build[0] + 3.0, 0.7, 0.8);
      for (let i = 0; i < feeders.length; i++) {
        const m = feeders[i];
        const s = m.userData.seed;
        const k = easeInOutCubic(clamp(span(t, S.build[0] - 0.4 + s * 0.9, S.build[0] + 2.2 + s * 0.9)));
        m.position.lerpVectors(m.userData.from, glucose.position, k);
        m.position.y += Math.sin(t * 1.1 + s * 7) * 0.3 * (1 - k);
        m.rotation.set(t * 0.6 + s, t * 0.8, 0);
        setGroupOpacity(m, feedAmt * (1 - clamp((k - 0.78) / 0.2)));
        m.scale.setScalar(0.42 * lerp(1, 0.5, k));
      }

      // Glucose assembles atom by atom.
      const gStart = S.build[0] + 0.9;
      const gVis = envelope(t, gStart, S.equation[0], 0.5, 0.5);
      glucose.rotation.set(Math.sin(t * 0.3) * 0.18, 0.35 + Math.sin(t * 0.28) * 0.45, 0.10);
      for (const c of glucoseAtoms) {
        const k = easeOutQuart(span(t, gStart + c.userData.delay, gStart + c.userData.delay + 1.5));
        c.position.lerpVectors(c.userData.scatter, c.userData.home, k);
        c.scale.setScalar(c.userData.homeScale * lerp(0.25, 1, k));
      }
      const bondsIn = easeOutCubic(span(t, gStart + 1.4, gStart + 2.4));
      for (const c of glucoseAtoms) setMeshOpacity(c, gVis);
      for (const c of glucoseBonds) setMeshOpacity(c, gVis * bondsIn);
      if (glucose.userData.halo) {
        glucose.userData.halo.material.opacity = 0.42 * gVis * bondsIn;
      }
      glucose.visible = gVis > 0.01;
    }

    // ---------------------------------------------------------------- set C
    const inC = t >= S.equation[0] && t < S.payoff[0];
    eqGroup.visible = inC;
    if (inC) {
      const molOrder = ['co2', 'water', 'sun', 'glucose', 'o2'];
      const molNodes = {
        co2: eqMolecules.co2,
        water: eqMolecules.water,
        sun: eqSun,
        glucose: eqMolecules.glucose,
        o2: eqMolecules.o2,
      };
      let mi = 0;
      for (const item of eqItems) {
        if (!item.term.mol) continue;
        const node = molNodes[item.term.mol];
        const t0 = S.equation[0] + 0.75 + mi * 0.52;
        const k = easeOutQuart(span(t, t0, t0 + 1.0));
        const ndcX = (item.screenX / (STAGE_W / 2)) * 1.0;
        screenToWorld(camera, ndcX, 0.24, 12.5, tmp2);
        node.position.copy(tmp2);
        node.position.y += (1 - k) * -0.55;
        const baseScale = item.term.mol === 'glucose' ? 0.40 : item.term.mol === 'sun' ? 0.26 : 0.74;
        node.scale.setScalar(baseScale * lerp(0.4, 1, k));
        node.rotation.set(Math.sin(t * 0.4 + mi) * 0.18, 0.5 + Math.sin(t * 0.33 + mi) * 0.55, 0.08);
        const vis = k * (1 - easeInCubic(span(t, S.equation[1] - 0.5, S.equation[1])));
        if (item.term.mol === 'sun') {
          node.visible = vis > 0.01;
          node.userData.core.material.opacity = vis;
          node.userData.halo.material.opacity = vis * 0.7;
          node.userData.bloom.material.opacity = vis * 0.22;
        } else {
          setGroupOpacity(node, vis);
        }
        mi++;
      }
    }

    // ---------------------------------------------------------------- set D
    const inD = t >= S.payoff[0];
    setD.visible = inD;
    if (inD) {
      tree.rotation.y = 0.35 + (t - S.payoff[0]) * 0.055;
      const grow = easeOutQuart(span(t, S.payoff[0], S.payoff[0] + 2.4));
      for (let i = 0; i < treeLeaves.length; i++) {
        const l = treeLeaves[i];
        const d = treeDelays[i] * 0.9;
        const k = easeOutBackSafe(span(t, S.payoff[0] + d, S.payoff[0] + d + 1.1));
        treeDummy.position.copy(l.pos);
        treeDummy.rotation.set(
          l.rot.x + Math.sin(t * 0.8 + i) * 0.06,
          l.rot.y,
          l.rot.z + Math.cos(t * 0.7 + i) * 0.06
        );
        treeDummy.scale.setScalar(l.scale * 3.0 * k);
        treeDummy.updateMatrix();
        treeInst.setMatrixAt(i, treeDummy.matrix);
      }
      treeInst.instanceMatrix.needsUpdate = true;
      tree.userData.trunk.material.opacity = grow;
      ground.material.opacity = grow * 0.5;
      treeInst.material.opacity = grow;

      const dawnIn = easeOutCubic(span(t, S.payoff[0] + 0.2, S.payoff[0] + 3.0));
      const dawnOut = 1 - easeInCubic(span(t, DURATION - 1.0, DURATION));
      dawn.userData.core.visible = false;
      dawn.userData.halo.material.opacity = dawnIn * dawnOut * 0.55;
      dawn.userData.bloom.material.opacity = dawnIn * dawnOut * 0.34;

      const breathAmt = envelope(t, S.payoff[0] + 1.0, DURATION, 1.2, 1.0);
      breath.material.opacity = breathAmt * 0.85;
      breath.visible = breathAmt > 0.01;
      if (breath.visible) breath.userData.update(t * 0.55, V(0, 1.5, 0), V(0, 22, 0), 7.0);
    }

    // ------------------------------------------------------------- typography
    let scrimAmt = 0;
    const beat = (line, t0, t1, opts) => {
      const on = animateLine(line, t, t0, t1, opts);
      return on;
    };

    beat(lines.title, 0.85, 4.6, { stagger: 0.035, rise: 22, depth: 240, inDur: 1.25 });
    beat(lines.subtitle, 1.7, 4.75, { inDur: 1.1, rise: 18 });

    if (beat(lines.leafLine, 6.2, 10.3, { stagger: 0.018 })) scrimAmt = 1;

    const blocks = [
      ['light', S.light[0] + 0.35, S.light[1] - 0.15],
      ['water', S.water[0] + 0.3, S.water[1] - 0.15],
      ['co2', S.co2[0] + 0.3, S.co2[1] - 0.7],
      ['inside', S.inside[0] + 0.6, S.build[0] - 0.2],
      ['sugar', S.build[0] + 0.5, 41.4],
      ['air', 41.5, S.build[1] - 0.2],
    ];
    for (const [key, t0, t1] of blocks) {
      const a = beat(lines[key + 'K'], t0, t1, { inDur: 0.7, rise: 14, depth: 70 });
      const b = beat(lines[key + 'H'], t0 + 0.12, t1, { stagger: 0.026, inDur: 1.0 });
      const c = beat(lines[key + 'B'], t0 + 0.42, t1, { inDur: 0.9, rise: 20 });
      if (a || b || c) scrimAmt = 1;
    }

    beat(lines.eqKicker, S.equation[0] + 0.5, S.equation[1] - 0.3, { inDur: 0.8, rise: 12, depth: 60 });
    for (let i = 0; i < eqItems.length; i++) {
      const item = eqItems[i];
      const t0 = S.equation[0] + 0.9 + i * 0.28;
      const t1 = S.equation[1] - 0.25;
      if (item.term.text === 'ARROW') {
        const k = easeOutQuart(span(t, t0, t0 + 0.7));
        const outK = easeInCubic(span(t, t1 - 0.5, t1));
        const a = k * (1 - outK);
        item.node.visible = a > 0.01;
        for (const ch of item.node.children) ch.material.opacity = a;
        item.node.position.copy(item.node.userData.home);
        item.node.position.z = (1 - k) * -120 + outK * 80;
        item.node.scale.setScalar(lerp(0.7, 1, k));
      } else {
        beat(item.node, t0, t1, { stagger: 0.02, inDur: 0.75, rise: 22, depth: 130 });
      }
      if (item.label) beat(item.label, t0 + 0.35, t1, { inDur: 0.6, rise: 10, depth: 50 });
    }
    if (t >= S.equation[0] && t < S.equation[1]) scrimAmt = 0.55;

    if (beat(lines.payoff1, 53.1, 56.2, { stagger: 0.02 })) scrimAmt = 1;
    if (beat(lines.payoff2, 56.35, 58.45, { stagger: 0.016 })) scrimAmt = 1;
    beat(lines.wordmark, 58.5, 60.0, { stagger: 0.03, inDur: 1.0, rise: 8, depth: 120, outDur: 0.4 });

    scrim.material.opacity = 0.85 * scrimAmt;
    rule.userData.update(t);

    flash.material.opacity = flashAmount(t);
    const fadeIn = 1 - easeOutCubic(span(t, 0.0, 0.7));
    const fadeOut = easeInCubic(span(t, 59.35, 60.0));
    fade.material.opacity = Math.max(fadeIn, fadeOut);
  }

  return { update };
}

// --- small helpers ----------------------------------------------------------

function easeOutBackSafe(x) {
  const s = 1.35;
  return x <= 0 ? 0 : 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
}

function setMeshOpacity(mesh, o) {
  const m = mesh.material;
  if (!m) return;
  if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1;
  m.opacity = m.userData.baseOpacity * o;
  m.transparent = true;
  mesh.visible = o > 0.004;
}

function setGroupOpacity(group, o) {
  group.visible = o > 0.004;
  if (!group.visible) return;
  group.traverse((n) => {
    if (n.isMesh || n.isSprite) setMeshOpacity(n, o);
  });
}
